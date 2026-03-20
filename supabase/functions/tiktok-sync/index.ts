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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { business_manager_id } = await req.json();
    if (!business_manager_id) return json({ error: "business_manager_id required" }, 400);

    // Fetch the TikTok BC
    const { data: bm, error: bmErr } = await supabase
      .from("business_managers")
      .select("*")
      .eq("id", business_manager_id)
      .eq("platform", "tiktok")
      .single();

    if (bmErr || !bm) return json({ error: "TikTok Business Center not found" }, 404);

    const accessToken = await decryptToken(bm.access_token, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const bcId = bm.bm_id;

    // Fetch advertiser accounts using oauth2/advertiser/get
    const appId = Deno.env.get("TIKTOK_APP_ID");
    const appSecret = Deno.env.get("TIKTOK_APP_SECRET");
    const apiUrl = `https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/?app_id=${appId}&secret=${appSecret}`;

    console.log("Fetching TikTok advertisers for BC:", bcId);
    const res = await fetch(apiUrl, {
      method: "GET",
      headers: { "Access-Token": accessToken },
    });

    const rawText = await res.text();
    console.log("TikTok BC advertiser response status:", res.status, "body length:", rawText.length, "preview:", rawText.substring(0, 300));

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      return json({ error: "Invalid response from TikTok API", raw: rawText.substring(0, 500) }, 502);
    }

    if (data.code !== 0) {
      return json({ error: data.message || "TikTok API error", details: data }, 400);
    }

    // The list contains objects with advertiser_id and advertiser_name
    const advertiserList: Array<{ advertiser_id: string; advertiser_name: string }> = data.data?.list ?? [];
    console.log("Found", advertiserList.length, "advertisers");
    let syncedCount = 0;

    // Fetch balance/budget for all advertisers via BC endpoint (paginated)
    let budgetMap: Record<string, { balance: number; budget: number; budgetCost: number }> = {};
    try {
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const balanceUrl = `https://business-api.tiktok.com/open_api/v1.3/advertiser/balance/get/?bc_id=${bcId}&page=${page}&page_size=50`;
        const balanceRes = await fetch(balanceUrl, {
          headers: { "Access-Token": accessToken },
        });
        const balanceText = await balanceRes.text();
        console.log("Balance API response page", page, "status:", balanceRes.status, "preview:", balanceText.substring(0, 500));
        let balanceData;
        try { balanceData = JSON.parse(balanceText); } catch {
          console.warn("Balance parse error:", balanceText.substring(0, 200));
          break;
        }
        if (balanceData.code !== 0) {
          console.warn("Balance API error code:", balanceData.code, "msg:", balanceData.message);
          break;
        }
        const list = balanceData.data?.advertiser_account_list ?? [];
        for (const b of list) {
          budgetMap[String(b.advertiser_id)] = {
            balance: Number(b.account_balance ?? 0),
            budget: Number(b.budget ?? 0),
            budgetCost: Number(b.budget_cost ?? 0),
          };
        }
        const totalPage = Math.ceil((balanceData.data?.page_info?.total_number ?? list.length) / 50);
        hasMore = page < totalPage;
        page++;
      }
      console.log("Fetched balance for", Object.keys(budgetMap).length, "advertisers");
    } catch (e) {
      console.warn("Balance fetch error:", e);
    }

    // Upsert accounts
    for (const adv of advertiserList) {
      const advertiserId = String(adv.advertiser_id);
      const advertiserName = adv.advertiser_name || `TikTok ${advertiserId}`;
      const bal = budgetMap[advertiserId];
      // grant = total allocated, balance = remaining; spent = grant - balance
      const spendCap = bal?.grant ?? 0;
      const amountSpent = spendCap > 0 ? Math.max(0, spendCap - (bal?.balance ?? 0)) : 0;

      const { data: existing } = await supabase
        .from("ad_accounts")
        .select("id")
        .eq("account_id", advertiserId)
        .eq("platform", "tiktok")
        .maybeSingle();

      if (existing) {
        await supabase
          .from("ad_accounts")
          .update({
            account_name: advertiserName,
            business_manager_id: bm.id,
            spend_cap: spendCap,
            amount_spent: amountSpent,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("ad_accounts").insert({
          account_id: advertiserId,
          account_name: advertiserName,
          platform: "tiktok",
          business_manager_id: bm.id,
          status: "active",
          spend_cap: spendCap,
          amount_spent: amountSpent,
        });
      }
      syncedCount++;
    }

    // Update last_synced_at
    await supabase
      .from("business_managers")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", bm.id);

    return json({ success: true, synced_count: syncedCount });
  } catch (err) {
    console.error("tiktok-sync error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
