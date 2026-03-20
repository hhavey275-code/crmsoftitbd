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

    // Fetch advertiser accounts from TikTok BC
    const apiUrl = `https://business-api.tiktok.com/open_api/v1.3/bc/advertiser/get/?bc_id=${bcId}&page=1&page_size=100`;

    console.log("Fetching TikTok BC advertisers, bcId:", bcId, "url:", apiUrl);
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

    const advertisers = data.data?.list ?? [];
    let syncedCount = 0;

    for (const adv of advertisers) {
      const advertiserId = String(adv.advertiser_id);
      const advertiserName = adv.advertiser_name || `TikTok ${advertiserId}`;
      const status = adv.status === "STATUS_ENABLE" ? "active" 
        : adv.status === "STATUS_DISABLE" ? "disabled" 
        : "pending";

      // Fetch budget info for this advertiser
      let spendCap = 0;
      let amountSpent = 0;

      try {
        const budgetUrl = new URL("https://business-api.tiktok.com/open_api/v1.3/advertiser/budget/get/");
        budgetUrl.searchParams.set("advertiser_ids", JSON.stringify([advertiserId]));
        const budgetRes = await fetch(budgetUrl.toString(), {
          headers: { "Access-Token": accessToken },
        });
        const budgetData = await budgetRes.json();
        if (budgetData.code === 0 && budgetData.data?.list?.length > 0) {
          const budget = budgetData.data.list[0];
          spendCap = Number(budget.budget ?? 0);
          amountSpent = Number(budget.spent ?? 0);
        }
      } catch (e) {
        console.warn(`Failed to fetch budget for ${advertiserId}:`, e);
      }

      // Upsert into ad_accounts
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
            status,
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
          status,
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
