import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function decryptToken(stored: string, secret: string): Promise<string> {
  if (!stored.startsWith("enc:")) return stored;
  try {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: enc.encode("bm-token-enc-v1"), iterations: 100000, hash: "SHA-256" },
      keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
    );
    const combined = Uint8Array.from(atob(stored.slice(4)), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch { return stored; }
}

function centsToDollars(cents: number): number {
  return cents / 100;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized - invalid token" }, 401);

    const userId = claimsData.claims.sub as string;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // --- Admin only ---
    const { data: userRole } = await supabase.from("user_roles").select("role").eq("user_id", userId).single();
    if (userRole?.role !== "admin" && userRole?.role !== "superadmin") {
      return json({ error: "Admin access required" }, 403);
    }

    // --- Parse body ---
    const { ad_account_id, amount } = await req.json();
    if (!ad_account_id || !amount || amount <= 0) return json({ error: "ad_account_id and positive amount required" }, 400);

    // --- Fetch ad account with BM ---
    const { data: account, error: accErr } = await supabase
      .from("ad_accounts")
      .select("*, business_managers!inner(access_token, bm_id)")
      .eq("id", ad_account_id)
      .single();

    if (accErr || !account) return json({ error: "Ad account not found" }, 404);

    const bm = (account as any).business_managers;
    const bmToken = await decryptToken(bm.access_token, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const actId = account.account_id.startsWith("act_") ? account.account_id : `act_${account.account_id}`;

    // --- Get admin name ---
    const { data: userProfile } = await supabase.from("profiles").select("full_name").eq("user_id", userId).single();
    const userName = userProfile?.full_name || "Unknown";

    // --- Step 1: Fetch real-time amount_spent from Meta ---
    const metaGetRes = await fetch(
      `https://graph.facebook.com/v24.0/${actId}?fields=spend_cap,amount_spent&access_token=${encodeURIComponent(bmToken)}`,
      { method: "GET" }
    );
    const metaGetData = await metaGetRes.json();

    if (!metaGetRes.ok || metaGetData?.error) {
      return json({ error: `Failed to fetch from Meta: ${metaGetData?.error?.message || metaGetRes.status}` }, 400);
    }

    const realAmountSpentDollars = metaGetData.amount_spent !== undefined
      ? centsToDollars(Number(metaGetData.amount_spent))
      : Number(account.amount_spent);

    const currentSpendCapDollars = metaGetData.spend_cap !== undefined
      ? centsToDollars(Number(metaGetData.spend_cap))
      : Number(account.spend_cap);

    const maxWithdrawable = Math.max(0, currentSpendCapDollars - realAmountSpentDollars);

    if (amount > maxWithdrawable + 0.01) {
      return json({
        error: `Cannot withdraw $${amount}. Maximum withdrawable is $${maxWithdrawable.toFixed(2)} (spend cap $${currentSpendCapDollars.toFixed(2)} - spent $${realAmountSpentDollars.toFixed(2)})`,
        max_withdrawable: maxWithdrawable,
        real_amount_spent: realAmountSpentDollars,
        current_spend_cap: currentSpendCapDollars,
      }, 400);
    }

    // --- Step 2: Reduce spend cap on Meta ---
    const newSpendCapDollars = currentSpendCapDollars - amount;

    console.log("Withdraw attempt", {
      actId, currentSpendCapDollars, realAmountSpentDollars,
      withdrawAmount: amount, newSpendCapDollars,
    });

    const metaPostRes = await fetch(`https://graph.facebook.com/v24.0/${actId}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        spend_cap: String(newSpendCapDollars),
        access_token: bmToken,
      }),
    });
    const metaPostData = await metaPostRes.json();

    if (!metaPostRes.ok || metaPostData?.error) {
      const errMsg = metaPostData?.error?.message || `Meta HTTP ${metaPostRes.status}`;
      return json({ error: `Meta API error: ${errMsg}` }, 400);
    }

    // --- Step 3: Verify ---
    const verifyRes = await fetch(
      `https://graph.facebook.com/v24.0/${actId}?fields=spend_cap&access_token=${encodeURIComponent(bmToken)}`,
      { method: "GET" }
    );
    const verifyData = await verifyRes.json();

    if (verifyData?.spend_cap !== undefined) {
      const verifiedDollars = centsToDollars(Number(verifyData.spend_cap));
      if (Math.abs(verifiedDollars - newSpendCapDollars) > 0.02) {
        console.warn(`Verification mismatch: expected $${newSpendCapDollars}, got $${verifiedDollars}`);
      }
    }

    // --- Step 4: Find assigned client and credit wallet ---
    const { data: assignment } = await supabase
      .from("user_ad_accounts").select("user_id").eq("ad_account_id", ad_account_id).single();

    const walletUserId = assignment?.user_id;
    let walletCredited = false;

    if (walletUserId) {
      const { data: wallet } = await supabase
        .from("wallets").select("id, balance").eq("user_id", walletUserId).single();

      if (wallet) {
        const newBalance = Number(wallet.balance) + amount;
        await supabase.from("wallets").update({ balance: newBalance }).eq("id", wallet.id);

        const cleanAccountId = account.account_id.replace(/^act_/, '');
        await supabase.from("transactions").insert({
          user_id: walletUserId,
          amount: amount,
          balance_after: newBalance,
          type: "withdraw",
          description: `Withdraw from ${account.account_name}\n${cleanAccountId}`,
          reference_id: ad_account_id,
          processed_by: `admin:${userId}`,
        });

        walletCredited = true;
      }
    }

    // --- Step 5: Update DB spend cap ---
    await supabase.from("ad_accounts").update({
      spend_cap: newSpendCapDollars,
      amount_spent: realAmountSpentDollars,
    }).eq("id", ad_account_id);

    // --- Step 6: Log ---
    const bmDbId = (account as any).business_manager_id;
    if (bmDbId) {
      await supabase.from("api_call_logs").insert({
        business_manager_id: bmDbId,
        function_name: "spend-cap-withdraw",
        call_count: 3,
      });
    }

    await supabase.from("system_logs").insert({
      user_id: userId,
      user_name: userName,
      action: "Withdraw",
      details: `${account.account_name} (${actId.replace(/^act_/, '')}) — $${amount} withdrawn — Cap: $${currentSpendCapDollars} → $${newSpendCapDollars}${walletCredited ? ' — Wallet credited' : ' — No client assigned'}`,
    });

    console.log("Withdraw SUCCESS", { actId, amount, newSpendCapDollars, walletCredited });

    return json({
      success: true,
      old_spend_cap: currentSpendCapDollars,
      new_spend_cap: newSpendCapDollars,
      real_amount_spent: realAmountSpentDollars,
      max_withdrawable: maxWithdrawable,
      wallet_credited: walletCredited,
    });
  } catch (err) {
    console.error("spend-cap-withdraw error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
