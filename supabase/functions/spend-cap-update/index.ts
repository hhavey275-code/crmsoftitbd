// Edge function: update-spend-cap v2
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } =
      await supabaseUser.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = user.id;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .single();

    const isAdmin = !!roleData;

    const { ad_account_id, amount, deduct_wallet, target_user_id } = await req.json();
    if (!ad_account_id || !amount) {
      return new Response(
        JSON.stringify({ error: "ad_account_id and amount required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const walletUserId = target_user_id || callerId;

    if (!isAdmin && walletUserId !== callerId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch profile for frozen check and due_limit
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("status, due_limit")
      .eq("user_id", walletUserId)
      .single();

    if (!isAdmin) {
      if (userProfile?.status === "inactive") {
        return new Response(
          JSON.stringify({ error: "Your account has been frozen. You cannot perform this action." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: assignment } = await supabase
        .from("user_ad_accounts")
        .select("id")
        .eq("user_id", callerId)
        .eq("ad_account_id", ad_account_id)
        .single();
      if (!assignment) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch ad account + BM info first (for account name in description)
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

    // Wallet deduction
    if (deduct_wallet) {
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

      const dueLimit = Number(userProfile?.due_limit ?? 0);
      const effectiveBalance = Number(wallet.balance) + dueLimit;

      // Clients cannot exceed wallet balance + due_limit; admins can (allows negative)
      if (!isAdmin && effectiveBalance < amount) {
        return new Response(
          JSON.stringify({ error: "Insufficient wallet balance" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const newBalance = Number(wallet.balance) - amount;

      const { error: updateWalletErr } = await supabase
        .from("wallets")
        .update({ balance: newBalance })
        .eq("id", wallet.id);

      if (updateWalletErr) {
        return new Response(
          JSON.stringify({ error: "Failed to deduct wallet" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Log transaction with account name
      await supabase.from("transactions").insert({
        user_id: walletUserId,
        amount: -amount,
        balance_after: newBalance,
        type: "ad_topup",
        description: `Ad account top-up: $${amount} → ${account.account_name}`,
        reference_id: ad_account_id,
      });
    }

    const bm = (account as any).business_managers;
    const oldSpendCap = Number(account.spend_cap);
    const newSpendCap = oldSpendCap + amount;

    const actId = account.account_id.startsWith("act_")
      ? account.account_id
      : `act_${account.account_id}`;

    const metaRes = await fetch(
      `https://graph.facebook.com/v24.0/${actId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          spend_cap: String(Math.round(newSpendCap)),
          access_token: bm.access_token,
        }),
      }
    );

    const metaData = await metaRes.json();

    if (metaData.error) {
      // Rollback wallet deduction on Meta API failure
      if (deduct_wallet) {
        const { data: wallet } = await supabase
          .from("wallets")
          .select("id, balance")
          .eq("user_id", walletUserId)
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
    console.error("update-spend-cap error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
