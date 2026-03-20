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

    // Parse body
    const { ad_account_id, amount, old_spend_cap } = await req.json();
    if (!ad_account_id || !amount || old_spend_cap === undefined) {
      return json({ error: "ad_account_id, amount, and old_spend_cap required" }, 400);
    }

    // Verify client owns this account
    const { data: assignment } = await supabase
      .from("user_ad_accounts").select("id").eq("user_id", userId).eq("ad_account_id", ad_account_id).single();
    if (!assignment) return json({ error: "Forbidden" }, 403);

    // Fetch ad account with BM info
    const { data: account, error: accErr } = await supabase
      .from("ad_accounts")
      .select("*, business_managers(bm_id, access_token)")
      .eq("id", ad_account_id)
      .eq("platform", "tiktok")
      .single();

    if (accErr || !account) return json({ error: "TikTok ad account not found" }, 404);

    const bm = (account as any).business_managers;
    if (!bm?.access_token || !bm?.bm_id) {
      return json({ error: "Business Center not configured for this account" }, 400);
    }

    // Decrypt token
    const accessToken = await decryptToken(bm.access_token, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const bcId = bm.bm_id;

    // Call TikTok API to get current budget for this advertiser
    const balanceUrl = `https://business-api.tiktok.com/open_api/v1.3/advertiser/balance/get/?bc_id=${bcId}&page=1&page_size=50`;
    const balanceRes = await fetch(balanceUrl, {
      headers: { "Access-Token": accessToken },
    });

    const balanceText = await balanceRes.text();
    console.log("Verify: Balance API response:", balanceText.substring(0, 500));

    let balanceData;
    try { balanceData = JSON.parse(balanceText); } catch {
      return json({ error: "Invalid response from TikTok API" }, 502);
    }

    if (balanceData.code !== 0) {
      return json({ error: "TikTok API error: " + (balanceData.message || "Unknown") }, 400);
    }

    // Find this specific advertiser's budget
    const advList = balanceData.data?.advertiser_account_list ?? [];
    // May need to paginate if >50 advertisers
    let totalPages = Math.ceil((balanceData.data?.page_info?.total_number ?? advList.length) / 50);
    let allAdvs = [...advList];
    
    for (let page = 2; page <= totalPages; page++) {
      const pageUrl = `https://business-api.tiktok.com/open_api/v1.3/advertiser/balance/get/?bc_id=${bcId}&page=${page}&page_size=50`;
      const pageRes = await fetch(pageUrl, { headers: { "Access-Token": accessToken } });
      const pageText = await pageRes.text();
      try {
        const pageData = JSON.parse(pageText);
        if (pageData.code === 0) {
          allAdvs.push(...(pageData.data?.advertiser_account_list ?? []));
        }
      } catch { /* skip */ }
    }

    const advData = allAdvs.find((a: any) => String(a.advertiser_id) === account.account_id);
    if (!advData) {
      return json({ error: "Advertiser not found in TikTok BC balance data" }, 404);
    }

    const currentBudget = Number(advData.budget ?? 0);
    const currentBudgetCost = Number(advData.budget_cost ?? 0);
    const expectedNewCap = old_spend_cap + amount;

    console.log(`Verify: old_cap=${old_spend_cap}, amount=${amount}, expected=${expectedNewCap}, actual_budget=${currentBudget}`);

    const { data: userProfile } = await supabase.from("profiles").select("full_name").eq("user_id", userId).single();
    const userName = userProfile?.full_name || "Unknown";

    if (currentBudget === expectedNewCap) {
      // ✅ Match — update CRM spend cap
      const remainingAfterTopup = currentBudget - currentBudgetCost;
      await supabase.from("ad_accounts").update({
        spend_cap: currentBudget,
        amount_spent: currentBudgetCost,
        balance_after_topup: remainingAfterTopup,
        fraud_flag: false,
      }).eq("id", ad_account_id);

      await supabase.from("system_logs").insert({
        user_id: userId,
        user_name: userName,
        action: "TikTok Top-Up Verified ✅",
        details: `${account.account_name} (${account.account_id}) — Verified: $${old_spend_cap} → $${currentBudget}`,
      });

      return json({ success: true, verified: true, new_spend_cap: currentBudget });
    } else {
      // ❌ Mismatch — freeze client account
      await supabase.from("profiles").update({ status: "inactive" }).eq("user_id", userId);
      await supabase.from("ad_accounts").update({ fraud_flag: true }).eq("id", ad_account_id);

      // DISABLE all running campaigns (Phase 1)
      let disabledCount = 0;
      try {
        const campUrl = `https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=${account.account_id}&filtering={"status":"CAMPAIGN_STATUS_ENABLE"}&page_size=100`;
        const campRes = await fetch(campUrl, { headers: { "Access-Token": accessToken } });
        const campData = await campRes.json();
        if (campData.code === 0 && campData.data?.list?.length > 0) {
          const campaignIds = campData.data.list.map((c: any) => String(c.campaign_id));
          // Batch disable in groups of 20
          for (let i = 0; i < campaignIds.length; i += 20) {
            const batch = campaignIds.slice(i, i + 20);
            const disableRes = await fetch("https://business-api.tiktok.com/open_api/v1.3/campaign/update/status/", {
              method: "POST",
              headers: { "Access-Token": accessToken, "Content-Type": "application/json" },
              body: JSON.stringify({ advertiser_id: account.account_id, campaign_ids: batch, opt_status: "DISABLE" }),
            });
            const disableData = await disableRes.json();
            if (disableData.code === 0) disabledCount += batch.length;
            else console.error("Campaign disable batch failed:", disableData.message);
          }
        }
        console.log(`Disabled ${disabledCount} campaigns for ${account.account_id}`);
      } catch (campErr) {
        console.error("Campaign disable error (best-effort):", campErr);
      }

      const campaignNote = disabledCount > 0 ? ` ${disabledCount} campaigns disabled.` : "";

      await supabase.from("system_logs").insert({
        user_id: userId,
        user_name: userName,
        action: "TikTok Top-Up Mismatch ❌ — Account Frozen",
        details: `${account.account_name} (${account.account_id}) — Expected cap $${expectedNewCap}, actual $${currentBudget}. Client account frozen.${campaignNote}`,
      });

      // Notify all admins
      const { data: adminUsers } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "superadmin"]);
      if (adminUsers) {
        for (const admin of adminUsers) {
          await supabase.from("notifications").insert({
            user_id: admin.user_id,
            type: "topup_mismatch",
            title: "TikTok Top-Up Mismatch ⚠️",
            message: `Client ${userName} top-up mismatch on ${account.account_name}. Expected $${expectedNewCap}, actual $${currentBudget}. Account frozen.${campaignNote}`,
            reference_id: ad_account_id,
          });
        }
      }

      return json({
        success: false,
        verified: false,
        mismatch: true,
        expected: expectedNewCap,
        actual: currentBudget,
        campaigns_disabled: disabledCount,
        error: "Spending cap mismatch detected. Your account has been frozen. Please contact admin.",
      });
    }
  } catch (err) {
    console.error("tiktok-verify-topup error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
