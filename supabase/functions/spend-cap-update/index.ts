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

// ====== UNIT CONVERSION HELPERS ======
// Meta API spend_cap is in CENTS (minor currency units).
// Our local DB stores in DOLLARS.
// These helpers make conversions explicit and prevent 100x bugs.

/** Convert USD dollars to Meta cents */
function toMetaCents(usd: number): number {
  return Math.round(usd * 100);
}

/** Convert Meta cents to USD dollars */
function fromMetaCents(cents: number): number {
  return cents / 100;
}

/** GET the current spend_cap from Meta, returned in DOLLARS */
async function getMetaSpendCapDollars(actId: string, accessToken: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${actId}?fields=spend_cap&access_token=${encodeURIComponent(accessToken)}`
    );
    const data = await res.json();
    if (data.error || data.spend_cap === undefined) return null;
    return fromMetaCents(Number(data.spend_cap));
  } catch {
    return null;
  }
}

/** Check if a Meta error is a rate limit */
function isRateLimitError(code: number | undefined): boolean {
  return code === 17 || code === 32 || code === 4 || code === 429;
}

function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) return null;

  const asSeconds = Number(headerValue);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return Math.round(asSeconds * 1000);
  }

  const asDateMs = Date.parse(headerValue);
  if (!Number.isNaN(asDateMs)) {
    const delta = asDateMs - Date.now();
    return delta > 0 ? delta : null;
  }

  return null;
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

    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized - invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // --- Role check ---
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
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
        .eq("user_id", userId)
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
        .eq("user_id", userId)
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

    // --- Check wallet balance BEFORE Meta call (but don't deduct yet) ---
    const shouldDeductWallet = !!deduct_wallet && !!target_user_id;
    const walletUserId = target_user_id || userId;

    if (shouldDeductWallet && !isAdmin) {
      const { data: wallet } = await supabase
        .from("wallets")
        .select("id, balance")
        .eq("user_id", walletUserId)
        .single();

      if (!wallet) {
        return new Response(
          JSON.stringify({ error: "Wallet not found for user" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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

    // --- Calculate new spend cap (all in DOLLARS) ---
    const bm = (account as any).business_managers;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const bmToken = await decryptToken(bm.access_token, serviceKey);
    const oldSpendCapDollars = Number(account.spend_cap);
    const newSpendCapDollars = oldSpendCapDollars + amount;

    const actId = account.account_id.startsWith("act_")
      ? account.account_id
      : `act_${account.account_id}`;

    // --- Safety guard ---
    if (newSpendCapDollars > 100000) {
      console.warn("SAFETY WARNING: spend cap exceeding $100k", {
        actId, oldSpendCapDollars, amount, newSpendCapDollars,
      });
    }

    // Meta POST expects dollars (account currency), GET returns cents
    console.log("Spend cap update attempt", {
      actId,
      bmId: bm.bm_id,
      oldSpendCapDollars,
      amountDollars: amount,
      newSpendCapDollars,
      sentToMeta_dollars: newSpendCapDollars,
    });

    // ============================================
    // STEP 1: Call Meta API FIRST (before wallet)
    // With retry on rate limit (up to 3 attempts)
    // ============================================
    let metaSuccess = false;
    let metaErrorMsg = "";
    let metaErrorCode: number | null = null;
    let isRateLimit = false;
    let retryAfterSeconds: number | null = null;
    const MAX_RETRIES = 4;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      metaSuccess = false;
      metaErrorMsg = "";
      metaErrorCode = null;
      isRateLimit = false;
      retryAfterSeconds = null;

      try {
        const metaRes = await fetch(`https://graph.facebook.com/v25.0/${actId}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            spend_cap: String(newSpendCapDollars),
            access_token: bmToken,
          }),
        });

        let metaData: any = null;
        try {
          metaData = await metaRes.json();
        } catch {
          metaData = null;
        }

        if (metaRes.ok && !metaData?.error) {
          // POST reported success — now VERIFY with GET
          const verifiedDollars = await getMetaSpendCapDollars(actId, bmToken);
          if (verifiedDollars !== null && Math.abs(verifiedDollars - newSpendCapDollars) < 0.02) {
            metaSuccess = true;
            console.log(`Meta POST success, verified cap: $${verifiedDollars} (expected $${newSpendCapDollars})`);
          } else {
            metaErrorMsg = `Meta POST reported success but verification failed. Expected $${newSpendCapDollars}, got $${verifiedDollars}`;
            console.warn(metaErrorMsg);
          }
          break;
        }

        metaErrorMsg = metaData?.error?.message || `Meta HTTP ${metaRes.status}`;
        metaErrorCode = typeof metaData?.error?.code === "number"
          ? metaData.error.code
          : (metaRes.status === 429 ? 429 : null);
        isRateLimit = isRateLimitError(metaErrorCode ?? undefined) || metaRes.status === 429;

        const retryAfterMs = parseRetryAfterMs(metaRes.headers.get("retry-after"));
        if (retryAfterMs) {
          retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
        }

        console.warn(`Meta spend cap POST failed (attempt ${attempt + 1})`, {
          actId,
          bmId: bm.bm_id,
          status: metaRes.status,
          message: metaErrorMsg,
          code: metaErrorCode,
          subcode: metaData?.error?.error_subcode,
          retryAfterSeconds,
        });

        const hasMoreAttempts = attempt < MAX_RETRIES - 1;
        if (isRateLimit && hasMoreAttempts) {
          const waitMs = retryAfterMs ?? (Math.pow(2, attempt + 1) * 1000 + Math.random() * 1000);
          console.log(`Rate limit retry ${attempt + 1}/${MAX_RETRIES}, waiting ${Math.round(waitMs)}ms...`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }

        break;
      } catch (err) {
        metaErrorMsg = err instanceof Error ? err.message : "Network error calling Meta API";
        console.warn("Meta spend cap request network error", { actId, message: metaErrorMsg });
        break;
      }
    }

    // --- If Meta failed, return error immediately. NO wallet deduction. ---
    if (!metaSuccess) {
      console.log(`Meta update FAILED for ${actId}. Wallet NOT touched. Returning error.`);

      const errorResponse: any = {
        error: isRateLimit
          ? "Meta API rate limit reached. Top-up was NOT processed and your wallet was NOT charged. Please try again in a few minutes."
          : `Meta API error: ${metaErrorMsg}`,
        meta_error_code: metaErrorCode,
        is_rate_limit: isRateLimit,
        ad_account_id: actId,
        business_manager_id: bm?.bm_id ?? null,
        wallet_charged: false,
      };

      if (isRateLimit && retryAfterSeconds) {
        errorResponse.retry_after_seconds = retryAfterSeconds;
      }

      if (!isRateLimit) {
        errorResponse.hint = "Grant this token owner ad account admin/manage permission for the target ad account.";
      }

      return new Response(
        JSON.stringify(errorResponse),
        { status: isRateLimit ? 429 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // STEP 2: Meta succeeded — now deduct wallet
    // ============================================
    let newBalance: number | null = null;

    if (shouldDeductWallet) {
      const { data: wallet, error: walletErr } = await supabase
        .from("wallets")
        .select("id, balance")
        .eq("user_id", walletUserId)
        .single();

      if (walletErr || !wallet) {
        console.error("CRITICAL: Meta updated but wallet not found!", { actId, walletUserId });
        return new Response(
          JSON.stringify({ error: "Wallet not found. Meta spend cap was updated but wallet deduction failed. Contact admin." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      newBalance = Number(wallet.balance) - amount;

      await supabase
        .from("wallets")
        .update({ balance: newBalance })
        .eq("id", wallet.id);

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
    // STEP 3: Update DB spend cap
    // ============================================
    await supabase
      .from("ad_accounts")
      .update({ spend_cap: newSpendCapDollars })
      .eq("id", ad_account_id);

    console.log("Spend cap update SUCCESS", { actId, oldSpendCapDollars, newSpendCapDollars });

    return new Response(
      JSON.stringify({
        success: true,
        old_spend_cap: oldSpendCapDollars,
        new_spend_cap: newSpendCapDollars,
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
