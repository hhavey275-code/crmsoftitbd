import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);

    const userId = claimsData.claims.sub as string;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Role check
    const { data: userRole } = await supabase.from("user_roles").select("role").eq("user_id", userId).single();
    const isAdmin = userRole?.role === "admin" || userRole?.role === "superadmin";

    // Parse body
    const { ad_account_id, amount, deduct_wallet, target_user_id } = await req.json();
    if (!ad_account_id || !amount) return json({ error: "ad_account_id and amount required" }, 400);

    // Non-admin checks
    if (!isAdmin) {
      const { data: profile } = await supabase.from("profiles").select("status").eq("user_id", userId).single();
      if (profile?.status === "inactive") return json({ error: "Your account has been frozen." }, 403);

      const { data: assignment } = await supabase
        .from("user_ad_accounts").select("id").eq("user_id", userId).eq("ad_account_id", ad_account_id).single();
      if (!assignment) return json({ error: "Forbidden" }, 403);
    }

    // Fetch ad account
    const { data: account, error: accErr } = await supabase
      .from("ad_accounts")
      .select("*")
      .eq("id", ad_account_id)
      .eq("platform", "tiktok")
      .single();

    if (accErr || !account) return json({ error: "TikTok ad account not found" }, 404);

    const { data: userProfile } = await supabase.from("profiles").select("full_name").eq("user_id", userId).single();
    const userName = userProfile?.full_name || "Unknown";

    const shouldDeductWallet = !!deduct_wallet;
    const walletUserId = target_user_id || userId;

    // STEP 1: Wallet deduction
    let newBalance: number | null = null;

    if (shouldDeductWallet) {
      const { data: wallet, error: walletErr } = await supabase
        .from("wallets").select("id, balance").eq("user_id", walletUserId).single();

      if (walletErr || !wallet) return json({ error: "Wallet not found" }, 404);

      const { data: prof } = await supabase.from("profiles").select("due_limit").eq("user_id", walletUserId).single();
      const dueLimit = Number(prof?.due_limit ?? 0);
      if (Number(wallet.balance) + dueLimit < amount) return json({ error: "Insufficient wallet balance" }, 400);

      newBalance = Number(wallet.balance) - amount;
      await supabase.from("wallets").update({ balance: newBalance }).eq("id", wallet.id);

      await supabase.from("transactions").insert({
        user_id: walletUserId,
        amount: -amount,
        balance_after: newBalance,
        type: "ad_topup",
        description: `${account.account_name}\n${account.account_id} (TikTok)`,
        reference_id: ad_account_id,
        processed_by: isAdmin ? `admin:${userId}` : `client:${walletUserId}`,
      });
    }

    // STEP 2: Update spend cap in CRM (postpaid accounts - no TikTok API call needed)
    // Budget Manager spending caps are managed in TikTok BC dashboard directly
    const bm = (account as any).business_managers;
    const oldSpendCap = Number(account.spend_cap);
    const newSpendCap = oldSpendCap + amount;

    // STEP 3: Update spend cap in DB
    const currentAmountSpent = Number(account.amount_spent);
    const remainingAfterTopup = newSpendCap - currentAmountSpent;
    await supabase.from("ad_accounts").update({ spend_cap: newSpendCap, balance_after_topup: remainingAfterTopup }).eq("id", ad_account_id);

    await supabase.from("system_logs").insert({
      user_id: userId,
      user_name: userName,
      action: "TikTok Spend Cap Updated",
      details: `${account.account_name} (${account.account_id}) — $${oldSpendCap} → $${newSpendCap}`,
    });

    return json({ success: true, old_spend_cap: oldSpendCap, new_spend_cap: newSpendCap });
  } catch (err) {
    console.error("tiktok-topup error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
