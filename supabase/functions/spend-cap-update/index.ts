import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function verifyMetaSpendCap(actId: string, accessToken: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v24.0/${actId}?fields=spend_cap&access_token=${encodeURIComponent(accessToken)}`
    );
    const data = await res.json();
    if (data.error || data.spend_cap === undefined) return null;
    // Meta returns spend_cap in cents as a string
    return Number(data.spend_cap) / 100;
  } catch {
    return null;
  }
}

async function rollbackWallet(
  supabase: any,
  walletId: string,
  amount: number,
  adAccountId: string,
  walletUserId: string
) {
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
      .eq("reference_id", adAccountId)
      .eq("user_id", walletUserId)
      .eq("amount", -amount)
      .order("created_at", { ascending: false })
      .limit(1);
  }
}

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

    // --- Wallet deduction ---
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

    let metaSuccess = false;
    let metaErrorMsg = "";

    try {
      const metaRes = await fetch(`https://graph.facebook.com/v24.0/${actId}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          spend_cap: String(Math.round(newSpendCap * 100)),
          access_token: bm.access_token,
        }),
      });

      const metaData = await metaRes.json();

      if (!metaData.error) {
        metaSuccess = true;
      } else {
        metaErrorMsg = metaData.error.message || "Unknown Meta error";
      }
    } catch (err) {
      // Network timeout or fetch failure
      metaErrorMsg = err instanceof Error ? err.message : "Network error calling Meta API";
    }

    // --- If POST failed/errored, verify actual spend cap before rollback ---
    if (!metaSuccess) {
      console.log(`Meta POST failed (${metaErrorMsg}), verifying actual spend cap...`);
      const actualSpendCap = await verifyMetaSpendCap(actId, bm.access_token);

      if (actualSpendCap !== null && actualSpendCap >= newSpendCap) {
        // Meta actually updated successfully despite the error response
        console.log(`Verification: spend cap IS updated on Meta (${actualSpendCap}). Treating as success.`);
        metaSuccess = true;
      } else {
        // Confirmed not updated, proceed with rollback
        console.log(`Verification: spend cap NOT updated (actual: ${actualSpendCap}). Rolling back.`);
        if (shouldDeductWallet && walletId) {
          await rollbackWallet(supabase, walletId, amount, ad_account_id, walletUserId);
        }

        return new Response(
          JSON.stringify({
            error: `Meta API error: ${metaErrorMsg}`,
            verified: actualSpendCap !== null,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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
