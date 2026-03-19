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

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

function isMetaRateLimited(status: number, data: any): boolean {
  const message = String(data?.error?.message ?? "").toLowerCase();
  return (
    status === 429 ||
    data?.error?.code === 17 ||
    data?.error?.code === 32 ||
    data?.error?.code === 4 ||
    message.includes("user request limit reached") ||
    message.includes("request limit")
  );
}

function getRetryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  const retryAfterSeconds = Number(retryAfterHeader);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, 120000);
  }
  const backoffMs = [5000, 15000, 30000, 60000];
  return backoffMs[Math.min(attempt, backoffMs.length - 1)];
}

async function metaFetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<{ res: Response; data: any }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    let data: any = null;
    try { data = await res.json(); } catch { data = null; }

    const rateLimited = isMetaRateLimited(res.status, data);

    if (rateLimited && attempt < maxRetries) {
      const waitMs = getRetryDelayMs(attempt, res.headers.get("retry-after"));
      console.log(`Rate limited (attempt ${attempt + 1}/${maxRetries + 1}), waiting ${waitMs}ms...`);
      await delay(waitMs);
      continue;
    }

    if (rateLimited) {
      throw new Error("META_RATE_LIMIT_RETRY_EXHAUSTED");
    }

    return { res, data };
  }

  throw new Error("META_FETCH_RETRY_EXHAUSTED");
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

    // --- Role check ---
    const { data: userRole } = await supabase.from("user_roles").select("role").eq("user_id", userId).single();
    const isAdmin = userRole?.role === "admin" || userRole?.role === "superadmin";

    // --- Parse body ---
    const { ad_account_id, amount, deduct_wallet, target_user_id } = await req.json();
    if (!ad_account_id || !amount) return json({ error: "ad_account_id and amount required" }, 400);

    // --- Non-admin checks ---
    if (!isAdmin) {
      const { data: profile } = await supabase.from("profiles").select("status").eq("user_id", userId).single();
      if (profile?.status === "inactive") return json({ error: "Your account has been frozen." }, 403);

      const { data: assignment } = await supabase
        .from("user_ad_accounts").select("id").eq("user_id", userId).eq("ad_account_id", ad_account_id).single();
      if (!assignment) return json({ error: "Forbidden" }, 403);
    }

    // --- Fetch ad account with BM ---
    const { data: account, error: accErr } = await supabase
      .from("ad_accounts")
      .select("*, business_managers!inner(access_token, bm_id)")
      .eq("id", ad_account_id)
      .single();

    if (accErr || !account) return json({ error: "Ad account not found" }, 404);

    // --- Get user name for logging ---
    const { data: userProfile } = await supabase.from("profiles").select("full_name").eq("user_id", userId).single();
    const userName = userProfile?.full_name || "Unknown";

    // --- Determine wallet user ---
    const shouldDeductWallet = !!deduct_wallet;
    const walletUserId = target_user_id || userId;

    // ============================================
    // STEP 1: Deduct wallet FIRST (before Meta API)
    // ============================================
    let newBalance: number | null = null;
    let walletId: string | null = null;

    if (shouldDeductWallet) {
      const { data: wallet, error: walletErr } = await supabase
        .from("wallets").select("id, balance").eq("user_id", walletUserId).single();

      if (walletErr || !wallet) return json({ error: "Wallet not found for user" }, 404);

      const { data: prof } = await supabase.from("profiles").select("due_limit").eq("user_id", walletUserId).single();
      const dueLimit = Number(prof?.due_limit ?? 0);
      if (Number(wallet.balance) + dueLimit < amount) return json({ error: "Insufficient wallet balance" }, 400);

      newBalance = Number(wallet.balance) - amount;
      walletId = wallet.id;

      // Deduct wallet
      await supabase.from("wallets").update({ balance: newBalance }).eq("id", wallet.id);

      // Create transaction record
      const cleanAccountId = account.account_id.replace(/^act_/, '');
      await supabase.from("transactions").insert({
        user_id: walletUserId,
        amount: -amount,
        balance_after: newBalance,
        type: "ad_topup",
        description: `${account.account_name}\n${cleanAccountId}`,
        reference_id: ad_account_id,
        processed_by: isAdmin ? `admin:${userId}` : `client:${walletUserId}`,
      });
    }

    // ============================================
    // STEP 2: Call Meta API
    // ============================================
    const bm = (account as any).business_managers;
    const bmToken = await decryptToken(bm.access_token, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const oldSpendCapDollars = Number(account.spend_cap);
    const newSpendCapDollars = oldSpendCapDollars + amount;
    const actId = account.account_id.startsWith("act_") ? account.account_id : `act_${account.account_id}`;

    console.log("Spend cap update attempt", {
      actId, bmId: bm.bm_id, oldSpendCapDollars, amountDollars: amount,
      newSpendCapDollars, walletDeducted: shouldDeductWallet,
    });

    try {
      const { res: metaRes, data: metaData } = await metaFetchWithRetry(
        `https://graph.facebook.com/v24.0/${actId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            spend_cap: String(newSpendCapDollars),
            access_token: bmToken,
          }),
        },
      );

      if (!metaRes.ok || metaData?.error) {
        const metaErrorMsg = metaData?.error?.message || `Meta HTTP ${metaRes.status}`;
        const rateLimited = isMetaRateLimited(metaRes.status, metaData);
        console.warn("Meta POST failed", { actId, status: metaRes.status, message: metaErrorMsg });

        // Insert into failed_topups
        const { data: failedRecord } = await supabase.from("failed_topups").insert({
          user_id: walletUserId,
          ad_account_id: ad_account_id,
          amount: amount,
          old_spend_cap: oldSpendCapDollars,
          error_message: metaErrorMsg,
          status: "pending",
        }).select("id").single();

        // Log to system_logs
        await supabase.from("system_logs").insert({
          user_id: userId,
          user_name: userName,
          action: "Top-Up Failed",
          details: `${account.account_name} (${actId.replace(/^act_/, '')}) — $${amount} — ${metaErrorMsg}`,
        });

        const errorCode = rateLimited ? "META_RATE_LIMIT" : "META_API_ERROR";
        return json({
          error: rateLimited
            ? "Meta API is busy (rate limit reached). Amount deducted from wallet. You can retry from Failed Top-Ups."
            : `Meta API error: ${metaErrorMsg}. Amount deducted from wallet. You can retry from Failed Top-Ups.`,
          code: errorCode,
          failed_topup_id: failedRecord?.id,
          wallet_charged: shouldDeductWallet,
        }, rateLimited ? 429 : 400);
      }

      // Verify with GET
      const { res: verifyRes, data: verifyData } = await metaFetchWithRetry(
        `https://graph.facebook.com/v24.0/${actId}?fields=spend_cap&access_token=${encodeURIComponent(bmToken)}`,
        { method: "GET" },
      );

      if (!verifyRes.ok || verifyData?.error) {
        const verifyErrorMsg = verifyData?.error?.message || `Meta verify HTTP ${verifyRes.status}`;
        console.warn("Meta verification failed", { actId, message: verifyErrorMsg });

        // Insert into failed_topups
        const { data: failedRecord } = await supabase.from("failed_topups").insert({
          user_id: walletUserId,
          ad_account_id: ad_account_id,
          amount: amount,
          old_spend_cap: oldSpendCapDollars,
          error_message: `Verification failed: ${verifyErrorMsg}`,
          status: "pending",
        }).select("id").single();

        await supabase.from("system_logs").insert({
          user_id: userId,
          user_name: userName,
          action: "Top-Up Failed",
          details: `${account.account_name} (${actId.replace(/^act_/, '')}) — $${amount} — Verification failed: ${verifyErrorMsg}`,
        });

        return json({
          error: `Meta verification failed. Amount deducted from wallet. You can retry from Failed Top-Ups.`,
          failed_topup_id: failedRecord?.id,
          wallet_charged: shouldDeductWallet,
        }, 400);
      }

      if (verifyData?.spend_cap !== undefined) {
        const verifiedDollars = centsToDollars(Number(verifyData.spend_cap));
        if (Math.abs(verifiedDollars - newSpendCapDollars) < 0.02) {
          console.log(`Meta verified: $${verifiedDollars} (expected $${newSpendCapDollars})`);
        } else {
          const mismatchMsg = `Verification mismatch: expected $${newSpendCapDollars}, got $${verifiedDollars}`;
          console.warn(mismatchMsg);

          const { data: failedRecord } = await supabase.from("failed_topups").insert({
            user_id: walletUserId,
            ad_account_id: ad_account_id,
            amount: amount,
            old_spend_cap: oldSpendCapDollars,
            error_message: mismatchMsg,
            status: "pending",
          }).select("id").single();

          await supabase.from("system_logs").insert({
            user_id: userId,
            user_name: userName,
            action: "Top-Up Failed",
            details: `${account.account_name} (${actId.replace(/^act_/, '')}) — $${amount} — ${mismatchMsg}`,
          });

          return json({
            error: `${mismatchMsg}. Amount deducted from wallet. You can retry from Failed Top-Ups.`,
            failed_topup_id: failedRecord?.id,
            wallet_charged: shouldDeductWallet,
          }, 400);
        }
      } else {
        const failMsg = "Verification GET returned no spend_cap";
        console.warn(failMsg, verifyData);

        const { data: failedRecord } = await supabase.from("failed_topups").insert({
          user_id: walletUserId,
          ad_account_id: ad_account_id,
          amount: amount,
          old_spend_cap: oldSpendCapDollars,
          error_message: failMsg,
          status: "pending",
        }).select("id").single();

        await supabase.from("system_logs").insert({
          user_id: userId,
          user_name: userName,
          action: "Top-Up Failed",
          details: `${account.account_name} (${actId.replace(/^act_/, '')}) — $${amount} — ${failMsg}`,
        });

        return json({
          error: `${failMsg}. Amount deducted from wallet. You can retry from Failed Top-Ups.`,
          failed_topup_id: failedRecord?.id,
          wallet_charged: shouldDeductWallet,
        }, 400);
      }
    } catch (err) {
      const metaErrorMsg = err instanceof Error ? err.message : "Network error";
      console.warn("Meta network error", metaErrorMsg);

      // Insert into failed_topups
      const { data: failedRecord } = await supabase.from("failed_topups").insert({
        user_id: walletUserId,
        ad_account_id: ad_account_id,
        amount: amount,
        old_spend_cap: oldSpendCapDollars,
        error_message: metaErrorMsg,
        status: "pending",
      }).select("id").single();

      await supabase.from("system_logs").insert({
        user_id: userId,
        user_name: userName,
        action: "Top-Up Failed",
        details: `${account.account_name} (${actId.replace(/^act_/, '')}) — $${amount} — ${metaErrorMsg}`,
      });

      return json({
        error: `Meta API error: ${metaErrorMsg}. Amount deducted from wallet. You can retry from Failed Top-Ups.`,
        failed_topup_id: failedRecord?.id,
        wallet_charged: shouldDeductWallet,
      }, 500);
    }

    // ============================================
    // STEP 3: Meta succeeded — log API calls
    // ============================================
    const bmId = bm.bm_id;
    const bmDbId = (account as any).business_manager_id;
    if (bmDbId) {
      await supabase.from("api_call_logs").insert({
        business_manager_id: bmDbId,
        function_name: "spend-cap-update",
        call_count: 2,
      });
    }

    // ============================================
    // STEP 4: Update DB spend cap
    // ============================================
    const currentAmountSpent = Number(account.amount_spent);
    const remainingAfterTopup = newSpendCapDollars - currentAmountSpent;
    await supabase.from("ad_accounts").update({ spend_cap: newSpendCapDollars, balance_after_topup: remainingAfterTopup }).eq("id", ad_account_id);

    // Log success
    await supabase.from("system_logs").insert({
      user_id: userId,
      user_name: userName,
      action: "Spend Cap Updated",
      details: `${account.account_name} (${actId.replace(/^act_/, '')}) — $${oldSpendCapDollars} → $${newSpendCapDollars}`,
    });

    console.log("Spend cap update SUCCESS", { actId, oldSpendCapDollars, newSpendCapDollars });

    return json({ success: true, old_spend_cap: oldSpendCapDollars, new_spend_cap: newSpendCapDollars });
  } catch (err) {
    console.error("spend-cap-update error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
