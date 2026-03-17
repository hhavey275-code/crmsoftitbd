import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // --- Role check: admin OR superadmin ---
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    const isAdmin = userRole?.role === "admin" || userRole?.role === "superadmin";

    // --- Parse body ---
    const { ad_account_id, amount, deduct_wallet, target_user_id } = await req.json();
    if (!ad_account_id || !amount) {
      return new Response(
        JSON.stringify({ error: "ad_account_id and amount required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Non-admin checks ---
    if (!isAdmin) {
      // Check account status
      const { data: profile } = await supabase
        .from("profiles")
        .select("status, due_limit")
        .eq("user_id", user.id)
        .single();

      if (profile?.status === "inactive") {
        return new Response(
          JSON.stringify({ error: "Your account has been frozen." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check assignment
      const { data: assignment } = await supabase
        .from("user_ad_accounts")
        .select("id")
        .eq("user_id", user.id)
        .eq("ad_account_id", ad_account_id)
        .single();

      if (!assignment) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // --- Fetch ad account with BM access token ---
    const { data: account, error: accErr } = await supabase
      .from("ad_accounts")
      .select("*, business_managers!inner(access_token, bm_id)")
      .eq("id", ad_account_id)
      .single();

    if (accErr || !account) {
      return new Response(
        JSON.stringify({ error: "Ad account not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Wallet deduction (only when deduct_wallet=true AND target_user_id exists) ---
    const shouldDeductWallet = !!deduct_wallet && !!target_user_id;
    const walletUserId = target_user_id || user.id;
    let walletId: string | null = null;
    let newBalance: number | null = null;

    if (shouldDeductWallet) {
      const { data: wallet, error: walletErr } = await supabase
        .from("wallets")
        .select("id, balance")
        .eq("user_id", walletUserId)
        .single();

      if (walletErr || !wallet) {
        return new Response(
          JSON.stringify({ error: "Wallet not found for user" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Non-admin balance check (with due_limit)
      if (!isAdmin) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("due_limit")
          .eq("user_id", walletUserId)
          .single();

        const dueLimit = Number(prof?.due_limit ?? 0);
        const effectiveBalance = Number(wallet.balance) + dueLimit;
        if (effectiveBalance < amount) {
          return new Response(
            JSON.stringify({ error: "Insufficient wallet balance" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      newBalance = Number(wallet.balance) - amount;
      walletId = wallet.id;

      const { error: updateErr } = await supabase
        .from("wallets")
        .update({ balance: newBalance })
        .eq("id", wallet.id);

      if (updateErr) {
        return new Response(
          JSON.stringify({ error: "Failed to deduct wallet" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cleanAccountId = account.account_id.replace(/^act_/, '');
      await supabase.from("transactions").insert({
        user_id: walletUserId,
        amount: -amount,
        balance_after: newBalance,
        type: "ad_topup",
        description: `${account.account_name}\n${cleanAccountId}`,
        reference_id: ad_account_id,
        processed_by: isAdmin ? `admin:${user.id}` : `client:${walletUserId}`,
      });
    }

    // --- Meta API v24.0 spend cap update ---
    const bm = (account as any).business_managers;
    const oldSpendCap = Number(account.spend_cap);
    const newSpendCap = oldSpendCap + amount;

    const actId = account.account_id.startsWith("act_")
      ? account.account_id
      : `act_${account.account_id}`;

    const metaRes = await fetch(`https://graph.facebook.com/v24.0/${actId}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        spend_cap: String(Math.round(newSpendCap * 100)),
        access_token: bm.access_token,
      }),
    });

    const metaData = await metaRes.json();

    if (metaData.error) {
      // Rollback wallet if we deducted
      if (shouldDeductWallet && walletId) {
        const { data: wallet } = await supabase
          .from("wallets")
          .select("id, balance")
          .eq("id", walletId)
          .single();
        if (wallet) {
          await supabase
            .from("wallets")
            .update({ balance: Number(wallet.balance) + amount })
            .eq("id", wallet.id);
          await supabase
            .from("transactions")
            .delete()
            .eq("reference_id", ad_account_id)
            .eq("user_id", walletUserId)
            .eq("amount", -amount)
            .order("created_at", { ascending: false })
            .limit(1);
        }
      }

      return new Response(
        JSON.stringify({
          error: `Meta API error: ${metaData.error.message}`,
          meta_error: metaData.error,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Update DB spend cap ---
    await supabase
      .from("ad_accounts")
      .update({ spend_cap: newSpendCap })
      .eq("id", ad_account_id);

    return new Response(
      JSON.stringify({
        success: true,
        old_spend_cap: oldSpendCap,
        new_spend_cap: newSpendCap,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("spend-cap-update error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
