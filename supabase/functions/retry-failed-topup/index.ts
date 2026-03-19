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

    const { data: userRole } = await supabase.from("user_roles").select("role").eq("user_id", userId).single();
    const isAdmin = userRole?.role === "admin" || userRole?.role === "superadmin";

    const { failed_topup_id } = await req.json();
    if (!failed_topup_id) return json({ error: "failed_topup_id required" }, 400);

    // Fetch the failed topup record
    const { data: failedTopup, error: ftErr } = await supabase
      .from("failed_topups")
      .select("*")
      .eq("id", failed_topup_id)
      .eq("status", "pending")
      .single();

    if (ftErr || !failedTopup) return json({ error: "Failed top-up not found or already resolved" }, 404);

    // Auth check: admin or owner
    if (!isAdmin && failedTopup.user_id !== userId) return json({ error: "Forbidden" }, 403);

    // Fetch ad account with BM
    const { data: account, error: accErr } = await supabase
      .from("ad_accounts")
      .select("*, business_managers!inner(access_token, bm_id)")
      .eq("id", failedTopup.ad_account_id)
      .single();

    if (accErr || !account) return json({ error: "Ad account not found" }, 404);

    const { data: userProfile } = await supabase.from("profiles").select("full_name").eq("user_id", userId).single();
    const userName = userProfile?.full_name || "Unknown";

    const bm = (account as any).business_managers;
    const bmToken = await decryptToken(bm.access_token, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const newSpendCapDollars = Number(failedTopup.old_spend_cap) + Number(failedTopup.amount);
    const actId = account.account_id.startsWith("act_") ? account.account_id : `act_${account.account_id}`;

    console.log("Retry failed topup", { actId, newSpendCapDollars, failedTopupId: failed_topup_id });

    // Call Meta API
    const metaRes = await fetch(`https://graph.facebook.com/v24.0/${actId}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        spend_cap: String(newSpendCapDollars),
        access_token: bmToken,
      }),
    });

    let metaData: any = null;
    try { metaData = await metaRes.json(); } catch { metaData = null; }

    if (!metaRes.ok || metaData?.error) {
      const metaErrorMsg = metaData?.error?.message || `Meta HTTP ${metaRes.status}`;
      console.warn("Retry Meta POST failed", { actId, message: metaErrorMsg });

      // Update error message
      await supabase.from("failed_topups").update({ error_message: metaErrorMsg }).eq("id", failed_topup_id);

      await supabase.from("system_logs").insert({
        user_id: userId,
        user_name: userName,
        action: "Failed Top-Up Retry Failed",
        details: `${account.account_name} (${actId.replace(/^act_/, '')}) — $${failedTopup.amount} — ${metaErrorMsg}`,
      });

      return json({ error: `Meta API error: ${metaErrorMsg}` }, 400);
    }

    // Verify with GET
    const verifyRes = await fetch(
      `https://graph.facebook.com/v24.0/${actId}?fields=spend_cap&access_token=${encodeURIComponent(bmToken)}`,
      { method: "GET" },
    );
    let verifyData: any = null;
    try { verifyData = await verifyRes.json(); } catch { verifyData = null; }

    if (verifyData?.spend_cap !== undefined) {
      const verifiedDollars = centsToDollars(Number(verifyData.spend_cap));
      if (Math.abs(verifiedDollars - newSpendCapDollars) >= 0.02) {
        const mismatchMsg = `Verification mismatch: expected $${newSpendCapDollars}, got $${verifiedDollars}`;
        await supabase.from("failed_topups").update({ error_message: mismatchMsg }).eq("id", failed_topup_id);

        await supabase.from("system_logs").insert({
          user_id: userId,
          user_name: userName,
          action: "Failed Top-Up Retry Failed",
          details: `${account.account_name} (${actId.replace(/^act_/, '')}) — $${failedTopup.amount} — ${mismatchMsg}`,
        });

        return json({ error: mismatchMsg }, 400);
      }
    }

    // SUCCESS — update spend cap in DB, remove failed topup
    const currentAmountSpent = Number(account.amount_spent);
    const remainingAfterTopup = newSpendCapDollars - currentAmountSpent;
    await supabase.from("ad_accounts").update({ spend_cap: newSpendCapDollars, balance_after_topup: remainingAfterTopup }).eq("id", failedTopup.ad_account_id);
    await supabase.from("failed_topups").delete().eq("id", failed_topup_id);

    // Log API calls
    const bmDbId = (account as any).business_manager_id;
    if (bmDbId) {
      await supabase.from("api_call_logs").insert({
        business_manager_id: bmDbId,
        function_name: "retry-failed-topup",
        call_count: 2,
      });
    }

    await supabase.from("system_logs").insert({
      user_id: userId,
      user_name: userName,
      action: "Failed Top-Up Retried",
      details: `${account.account_name} (${actId.replace(/^act_/, '')}) — $${failedTopup.amount} — New cap: $${newSpendCapDollars}`,
    });

    console.log("Retry SUCCESS", { actId, newSpendCapDollars });

    return json({
      success: true,
      new_spend_cap: newSpendCapDollars,
    });
  } catch (err) {
    console.error("retry-failed-topup error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
