import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    "offsite_conversion.fb_pixel_purchase",
    "omni_purchase",
    "onsite_web_purchase",
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
    const { ad_account_ids, source = "cache", date } = await req.json();
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
    const emptyInsight = {
      today_spend: 0, yesterday_spend: 0,
      today_orders: 0, yesterday_orders: 0,
      active_campaigns: 0,
      today_messages: 0, yesterday_messages: 0,
      balance: 0, cards: [],
    };

    const promises = (accounts ?? []).map(async (account: any) => {
      const accessToken = account.business_managers?.access_token;
      const actId = account.account_id;

      if (!accessToken) {
        insights[account.id] = { ...emptyInsight };
        return;
      }

      try {
        const [todayRes, yesterdayRes, accountRes, activeCampaigns] = await Promise.all([
          fetch(`https://graph.facebook.com/v24.0/${actId}/insights?fields=spend,actions&date_preset=today&access_token=${accessToken}`),
          fetch(`https://graph.facebook.com/v24.0/${actId}/insights?fields=spend,actions&date_preset=yesterday&access_token=${accessToken}`),
          fetch(`https://graph.facebook.com/v24.0/${actId}?fields=balance,funding_source_details&access_token=${accessToken}`),
          fetchActiveCampaignCount(actId, accessToken),
        ]);

        const todayData = await todayRes.json();
        const yesterdayData = await yesterdayRes.json();
        const accountData = await accountRes.json();

        const todaySpend = todayData?.data?.[0]?.spend ? parseFloat(todayData.data[0].spend) : 0;
        const yesterdaySpend = yesterdayData?.data?.[0]?.spend ? parseFloat(yesterdayData.data[0].spend) : 0;

        const balance = accountData?.balance ? parseFloat(accountData.balance) / 100 : 0;

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
          today_orders: extractOrders(todayData),
          yesterday_orders: extractOrders(yesterdayData),
          active_campaigns: activeCampaigns,
          today_messages: extractMessages(todayData),
          yesterday_messages: extractMessages(yesterdayData),
          balance,
          cards,
        };
      } catch {
        insights[account.id] = { ...emptyInsight };
      }
    });

    await Promise.all(promises);

    // Upsert all insights into DB
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

    const now = new Date().toISOString();
    for (const key of Object.keys(insights)) {
      insights[key].updated_at = now;
    }

    return new Response(JSON.stringify({ insights }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
