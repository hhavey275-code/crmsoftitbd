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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Check if user is frozen
    const { data: profile } = await supabase.from("profiles").select("status, full_name").eq("user_id", userId).single();
    const userName = profile?.full_name || "Unknown";

    // Get user's TikTok ad accounts
    const { data: assignments } = await supabase
      .from("user_ad_accounts")
      .select("ad_account_id")
      .eq("user_id", userId);

    if (!assignments?.length) return json({ success: true, synced: 0 });

    const accountIds = assignments.map(a => a.ad_account_id);

    const { data: accounts } = await supabase
      .from("ad_accounts")
      .select("*, business_managers(bm_id, access_token)")
      .in("id", accountIds)
      .eq("platform", "tiktok");

    if (!accounts?.length) return json({ success: true, synced: 0 });

    // Group accounts by BC
    const bcGroups: Record<string, { accessToken: string; bcId: string; accounts: any[] }> = {};
    for (const acc of accounts) {
      const bm = (acc as any).business_managers;
      if (!bm?.access_token || !bm?.bm_id) continue;
      const key = bm.bm_id;
      if (!bcGroups[key]) {
        const decrypted = await decryptToken(bm.access_token, serviceKey);
        bcGroups[key] = { accessToken: decrypted, bcId: bm.bm_id, accounts: [] };
      }
      bcGroups[key].accounts.push(acc);
    }

    let totalSynced = 0;
    const fraudAlerts: string[] = [];

    for (const group of Object.values(bcGroups)) {
      // Fetch all advertisers' balances from this BC
      let allAdvs: any[] = [];
      const balanceUrl = `https://business-api.tiktok.com/open_api/v1.3/advertiser/balance/get/?bc_id=${group.bcId}&page=1&page_size=50`;
      const balanceRes = await fetch(balanceUrl, { headers: { "Access-Token": group.accessToken } });
      const balanceData = await balanceRes.json();

      if (balanceData.code === 0) {
        allAdvs = [...(balanceData.data?.advertiser_account_list ?? [])];
        const totalPages = Math.ceil((balanceData.data?.page_info?.total_number ?? allAdvs.length) / 50);
        for (let page = 2; page <= totalPages; page++) {
          const pageUrl = `https://business-api.tiktok.com/open_api/v1.3/advertiser/balance/get/?bc_id=${group.bcId}&page=${page}&page_size=50`;
          const pageRes = await fetch(pageUrl, { headers: { "Access-Token": group.accessToken } });
          try {
            const pageData = await pageRes.json();
            if (pageData.code === 0) allAdvs.push(...(pageData.data?.advertiser_account_list ?? []));
          } catch { /* skip */ }
        }
      }

      for (const acc of group.accounts) {
        const advData = allAdvs.find((a: any) => String(a.advertiser_id) === acc.account_id);
        if (!advData) continue;

        const actualBudget = Number(advData.budget ?? 0);
        const budgetCost = Number(advData.budget_cost ?? 0);
        const crmSpendCap = Number(acc.spend_cap ?? 0);

        // Update amount_spent (NOT spend_cap — only wallet top-ups update spend_cap)
        await supabase.from("ad_accounts").update({
          amount_spent: budgetCost,
          balance_after_topup: actualBudget > 0 ? actualBudget - budgetCost : null,
        }).eq("id", acc.id);

        totalSynced++;

        // Fraud check: actual budget > CRM spend_cap OR unlimited (0) when CRM had a cap
        const isFraud = crmSpendCap > 0 && (actualBudget > crmSpendCap || actualBudget === 0);

        if (isFraud && profile?.status !== "inactive") {
          // Phase 1: First detection — freeze + DISABLE campaigns
          await supabase.from("profiles").update({ status: "inactive" }).eq("user_id", userId);

          let disabledCount = 0;
          try {
            const campUrl = `https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=${acc.account_id}&filtering={"status":"CAMPAIGN_STATUS_ENABLE"}&page_size=100`;
            const campRes = await fetch(campUrl, { headers: { "Access-Token": group.accessToken } });
            const campData = await campRes.json();
            if (campData.code === 0 && campData.data?.list?.length > 0) {
              const campaignIds = campData.data.list.map((c: any) => String(c.campaign_id));
              for (let i = 0; i < campaignIds.length; i += 20) {
                const batch = campaignIds.slice(i, i + 20);
                const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/campaign/update/status/", {
                  method: "POST",
                  headers: { "Access-Token": group.accessToken, "Content-Type": "application/json" },
                  body: JSON.stringify({ advertiser_id: acc.account_id, campaign_ids: batch, opt_status: "DISABLE" }),
                });
                const d = await res.json();
                if (d.code === 0) disabledCount += batch.length;
              }
            }
          } catch (e) { console.error("Campaign disable error:", e); }

          const note = disabledCount > 0 ? ` ${disabledCount} campaigns disabled.` : "";
          fraudAlerts.push(`${acc.account_name}: budget $${actualBudget} > CRM cap $${crmSpendCap}.${note}`);

          await supabase.from("system_logs").insert({
            user_id: userId, user_name: userName,
            action: "TikTok Fraud Detected ❌ — Account Frozen",
            details: `${acc.account_name} (${acc.account_id}) — TikTok budget $${actualBudget} vs CRM cap $${crmSpendCap}. Account frozen.${note}`,
          });

          // Notify admins
          const { data: admins } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "superadmin"]);
          if (admins) {
            for (const admin of admins) {
              await supabase.from("notifications").insert({
                user_id: admin.user_id, type: "fraud_alert",
                title: "TikTok Fraud Alert ⚠️",
                message: `Client ${userName}: ${acc.account_name} budget manually changed ($${actualBudget} vs CRM $${crmSpendCap}). Account frozen.${note}`,
                reference_id: acc.id,
              });
            }
          }
        } else if (isFraud && profile?.status === "inactive") {
          // Phase 2: Already frozen — DELETE disabled campaigns
          let deletedCount = 0;
          try {
            const campUrl = `https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=${acc.account_id}&filtering={"status":"CAMPAIGN_STATUS_DISABLE"}&page_size=100`;
            const campRes = await fetch(campUrl, { headers: { "Access-Token": group.accessToken } });
            const campData = await campRes.json();
            if (campData.code === 0 && campData.data?.list?.length > 0) {
              const campaignIds = campData.data.list.map((c: any) => String(c.campaign_id));
              for (let i = 0; i < campaignIds.length; i += 20) {
                const batch = campaignIds.slice(i, i + 20);
                const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/campaign/update/status/", {
                  method: "POST",
                  headers: { "Access-Token": group.accessToken, "Content-Type": "application/json" },
                  body: JSON.stringify({ advertiser_id: acc.account_id, campaign_ids: batch, opt_status: "DELETE" }),
                });
                const d = await res.json();
                if (d.code === 0) deletedCount += batch.length;
              }
            }
          } catch (e) { console.error("Campaign delete error:", e); }

          if (deletedCount > 0) {
            await supabase.from("system_logs").insert({
              user_id: userId, user_name: userName,
              action: "TikTok Campaigns Deleted 🗑️",
              details: `${acc.account_name} (${acc.account_id}) — ${deletedCount} disabled campaigns permanently deleted (repeat fraud).`,
            });

            const { data: admins } = await supabase.from("user_roles").select("user_id").in("role", ["admin", "superadmin"]);
            if (admins) {
              for (const admin of admins) {
                await supabase.from("notifications").insert({
                  user_id: admin.user_id, type: "fraud_alert",
                  title: "TikTok Campaigns Deleted 🗑️",
                  message: `${deletedCount} campaigns permanently deleted on ${acc.account_name} (${userName}) — repeat fraud detected.`,
                  reference_id: acc.id,
                });
              }
            }
          }
        }
      }
    }

    return json({
      success: true,
      synced: totalSynced,
      fraud_alerts: fraudAlerts.length > 0 ? fraudAlerts : undefined,
      account_frozen: fraudAlerts.length > 0,
    });
  } catch (err) {
    console.error("tiktok-sync-client error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
