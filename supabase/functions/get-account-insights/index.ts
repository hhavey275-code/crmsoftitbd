import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function batchSelect(supabase: any, table: string, column: string, ids: string[], selectStr: string) {
  const batches = chunk(ids, 30);
  const results: any[] = [];
  for (const batch of batches) {
    const { data, error } = await supabase
      .from(table)
      .select(selectStr)
      .in(column, batch);
    if (error) throw error;
    if (data) results.push(...data);
  }
  return results;
}

function extractOrders(data: any) {
  const actions = data?.data?.[0]?.actions;
  if (!actions) return 0;
  const purchaseTypes = [
    "purchase",
  ];
  let total = 0;
  for (const a of actions) {
    if (purchaseTypes.includes(a.action_type)) {
      total += parseInt(a.value, 10) || 0;
    }
  }
  return total;
}

function extractMessages(data: any) {
  const actions = data?.data?.[0]?.actions;
  if (!actions) return 0;
  const messageTypes = [
    "onsite_conversion.messaging_conversation_started_7d",
    "onsite_conversion.messaging_first_reply",
    "onsite_conversion.messaging_block",
    "messaging_conversation_started_7d",
  ];
  let total = 0;
  for (const a of actions) {
    if (messageTypes.includes(a.action_type)) {
      total += parseInt(a.value, 10) || 0;
    }
  }
  return total;
}

async function fetchActiveCampaignCount(actId: string, accessToken: string): Promise<number> {
  try {
    const filterParam = encodeURIComponent(JSON.stringify([{"field":"effective_status","operator":"IN","value":["ACTIVE"]}]));
    const res = await fetch(
      `https://graph.facebook.com/v24.0/${actId}/campaigns?filtering=${filterParam}&summary=true&limit=0&access_token=${accessToken}`
    );
    const data = await res.json();
    return data?.summary?.total_count ?? 0;
  } catch {
    return 0;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ad_account_ids, source = "cache", date, date_from, date_to } = await req.json();
    if (!ad_account_ids || !Array.isArray(ad_account_ids) || ad_account_ids.length === 0) {
      return new Response(JSON.stringify({ error: "ad_account_ids required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    if (source === "cache") {
      const cached = await batchSelect(supabase, "ad_account_insights", "ad_account_id", ad_account_ids, "*");
      const insights: Record<string, any> = {};
      for (const row of cached) {
        insights[row.ad_account_id] = {
          today_spend: Number(row.today_spend),
          yesterday_spend: Number(row.yesterday_spend),
          today_orders: Number(row.today_orders ?? 0),
          yesterday_orders: Number(row.yesterday_orders ?? 0),
          active_campaigns: Number(row.active_campaigns ?? 0),
          today_messages: Number(row.today_messages ?? 0),
          yesterday_messages: Number(row.yesterday_messages ?? 0),
          balance: Number(row.balance),
          cards: row.cards ?? [],
          updated_at: row.updated_at,
        };
      }
      return new Response(JSON.stringify({ insights }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // source === "meta"
    const accounts = await batchSelect(
      supabase, "ad_accounts", "id", ad_account_ids,
      "id, account_id, amount_spent, spend_cap, business_manager_id, business_managers(access_token)"
    );

    const insights: Record<string, any> = {};
    const rateLimited: { account_id: string; account_name: string; error_code: number }[] = [];
    const emptyInsight = {
      today_spend: 0, yesterday_spend: 0,
      today_orders: 0, yesterday_orders: 0,
      active_campaigns: 0,
      today_messages: 0, yesterday_messages: 0,
      balance: 0, cards: [],
    };

    // Track amount_spent updates for ad_accounts table
    // NOTE: We do NOT sync spend_cap from Meta here. Our system (spend-cap-update function) 
    // is the source of truth for spend_cap. Meta may return 0 for accounts with no cap set,
    // which would incorrectly reset our local spend_cap values.
    const adAccountUpdates: { id: string; amount_spent: number }[] = [];

    const promises = (accounts ?? []).map(async (account: any) => {
      const rawToken = account.business_managers?.access_token;
      const actId = account.account_id;

      if (!rawToken) {
        insights[account.id] = { ...emptyInsight };
        return;
      }

      const accessToken = await decryptToken(rawToken, serviceKey);

      try {
        // Determine if this is a date range query or single date query
        const isDateRange = date_from && date_to;
        const isSingleDate = date && !isDateRange;

        let todayUrl: string;
        let yesterdayUrl: string;

        if (isDateRange) {
          // Date range: fetch spend for the range
          todayUrl = `https://graph.facebook.com/v24.0/${actId}/insights?fields=spend,actions&time_range={"since":"${date_from}","until":"${date_to}"}&access_token=${accessToken}`;
          // No meaningful "yesterday" for range, skip
          yesterdayUrl = "";
        } else if (isSingleDate) {
          todayUrl = `https://graph.facebook.com/v24.0/${actId}/insights?fields=spend,actions&time_range={"since":"${date}","until":"${date}"}&access_token=${accessToken}`;
          const d = new Date(date);
          d.setDate(d.getDate() - 1);
          const prevDate = d.toISOString().split("T")[0];
          yesterdayUrl = `https://graph.facebook.com/v24.0/${actId}/insights?fields=spend,actions&time_range={"since":"${prevDate}","until":"${prevDate}"}&access_token=${accessToken}`;
        } else {
          todayUrl = `https://graph.facebook.com/v24.0/${actId}/insights?fields=spend,actions&date_preset=today&access_token=${accessToken}`;
          yesterdayUrl = `https://graph.facebook.com/v24.0/${actId}/insights?fields=spend,actions&date_preset=yesterday&access_token=${accessToken}`;
        }

        const fetchPromises: Promise<Response>[] = [
          fetch(todayUrl),
          fetch(`https://graph.facebook.com/v24.0/${actId}?fields=balance,amount_spent,spend_cap,funding_source_details&access_token=${accessToken}`),
          fetchActiveCampaignCount(actId, accessToken).then(c => ({ json: async () => c } as any)),
        ];
        if (yesterdayUrl) {
          fetchPromises.splice(1, 0, fetch(yesterdayUrl));
        }

        const responses = await Promise.all(fetchPromises);
        
        let todayData: any, yesterdayData: any, accountData: any, activeCampaigns: number;
        
        if (yesterdayUrl) {
          todayData = await responses[0].json();
          yesterdayData = await responses[1].json();
          accountData = await responses[2].json();
          activeCampaigns = await responses[3].json();
        } else {
          todayData = await responses[0].json();
          yesterdayData = { data: [] };
          accountData = await responses[1].json();
          activeCampaigns = await responses[2].json();
        }

        // Check for Meta API rate limit errors
        const checkRateLimit = (data: any): number | null => {
          if (data?.error?.code === 17 || data?.error?.code === 32 || data?.error?.code === 4) return data.error.code;
          return null;
        };
        const rlCode = checkRateLimit(todayData) || checkRateLimit(yesterdayData) || checkRateLimit(accountData);
        if (rlCode) {
          rateLimited.push({ account_id: actId, account_name: account.account_name || actId, error_code: rlCode });
          insights[account.id] = { ...emptyInsight };
          return;
        }

        const todaySpend = todayData?.data?.[0]?.spend ? parseFloat(todayData.data[0].spend) : 0;
        const yesterdaySpend = yesterdayData?.data?.[0]?.spend ? parseFloat(yesterdayData.data[0].spend) : 0;

        const balance = accountData?.balance ? parseFloat(accountData.balance) / 100 : 0;

        // Update amount_spent and spend_cap from Meta account data (not from date-specific query)
        if (!isSingleDate && !isDateRange && accountData?.amount_spent !== undefined) {
          const metaAmountSpent = parseFloat(accountData.amount_spent) / 100;
          adAccountUpdates.push({ id: account.id, amount_spent: metaAmountSpent });
        }

        const cards: any[] = [];
        const fsd = accountData?.funding_source_details;
        if (fsd) {
          cards.push({
            id: fsd.id,
            display_string: fsd.display_string || `Card ending ${fsd.id?.slice(-4) || '****'}`,
            type: fsd.type,
          });
        }

        insights[account.id] = {
          today_spend: todaySpend,
          yesterday_spend: yesterdaySpend,
          date_spend: (isSingleDate || isDateRange) ? todaySpend : undefined,
          today_orders: extractOrders(todayData),
          yesterday_orders: extractOrders(yesterdayData),
          active_campaigns: activeCampaigns,
          today_messages: extractMessages(todayData),
          yesterday_messages: extractMessages(yesterdayData),
          balance,
          cards,
        };
      } catch (fetchErr: any) {
        // Check if it's a rate limit HTTP error
        if (fetchErr?.status === 429) {
          rateLimited.push({ account_id: actId, account_name: account.account_name || actId, error_code: 429 });
        }
        insights[account.id] = { ...emptyInsight };
      }
    });

    await Promise.all(promises);

    // Upsert all insights into DB (only for non-date queries)
    if (!date && !date_from && !date_to) {
      const upsertRows = Object.entries(insights).map(([adAccountId, data]: [string, any]) => ({
        ad_account_id: adAccountId,
        today_spend: data.today_spend,
        yesterday_spend: data.yesterday_spend,
        today_orders: data.today_orders,
        yesterday_orders: data.yesterday_orders,
        active_campaigns: data.active_campaigns,
        today_messages: data.today_messages,
        yesterday_messages: data.yesterday_messages,
        balance: data.balance,
        cards: data.cards,
        updated_at: new Date().toISOString(),
      }));

      const upsertBatches = chunk(upsertRows, 30);
      for (const batch of upsertBatches) {
        await supabase
          .from("ad_account_insights")
          .upsert(batch, { onConflict: "ad_account_id" });
      }

      // Update ad_accounts with fresh data from Meta (amount_spent + spend_cap)
      if (adAccountUpdates.length > 0) {
        const updateBatches = chunk(adAccountUpdates, 30);
        for (const batch of updateBatches) {
          for (const item of batch) {
            const updateData: any = { amount_spent: item.amount_spent };
            if (item.spend_cap !== undefined) {
              updateData.spend_cap = item.spend_cap;
            }
            await supabase
              .from("ad_accounts")
              .update(updateData)
              .eq("id", item.id);
          }
        }
      }
    }

    const now = new Date().toISOString();
    for (const key of Object.keys(insights)) {
      insights[key].updated_at = now;
    }

    return new Response(JSON.stringify({ insights, rate_limited: rateLimited }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
