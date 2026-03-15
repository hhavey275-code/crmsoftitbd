import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ad_account_ids, source = "cache" } = await req.json();
    if (!ad_account_ids || !Array.isArray(ad_account_ids) || ad_account_ids.length === 0) {
      return new Response(JSON.stringify({ error: "ad_account_ids required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // If source is "cache", read from DB and return
    if (source === "cache") {
      const { data: cached, error: cacheError } = await supabase
        .from("ad_account_insights")
        .select("*")
        .in("ad_account_id", ad_account_ids);

      if (cacheError) throw cacheError;

      const insights: Record<string, any> = {};
      for (const row of (cached ?? [])) {
        insights[row.ad_account_id] = {
          today_spend: Number(row.today_spend),
          yesterday_spend: Number(row.yesterday_spend),
          balance: Number(row.balance),
          cards: row.cards ?? [],
          updated_at: row.updated_at,
        };
      }

      return new Response(JSON.stringify({ insights }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // source === "meta" — fetch from Meta API and upsert to DB
    const { data: accounts, error } = await supabase
      .from("ad_accounts")
      .select("id, account_id, amount_spent, spend_cap, business_manager_id, business_managers(access_token)")
      .in("id", ad_account_ids);

    if (error) throw error;

    const insights: Record<string, any> = {};

    const promises = (accounts ?? []).map(async (account: any) => {
      const accessToken = account.business_managers?.access_token;
      const actId = account.account_id;

      if (!accessToken) {
        insights[account.id] = {
          today_spend: 0,
          yesterday_spend: 0,
          balance: 0,
          cards: [],
        };
        return;
      }

      try {
        const [todayRes, yesterdayRes, accountRes] = await Promise.all([
          fetch(
            `https://graph.facebook.com/v24.0/${actId}/insights?fields=spend&date_preset=today&access_token=${accessToken}`
          ),
          fetch(
            `https://graph.facebook.com/v24.0/${actId}/insights?fields=spend&date_preset=yesterday&access_token=${accessToken}`
          ),
          fetch(
            `https://graph.facebook.com/v24.0/${actId}?fields=balance,funding_source_details&access_token=${accessToken}`
          ),
        ]);

        const todayData = await todayRes.json();
        const yesterdayData = await yesterdayRes.json();
        const accountData = await accountRes.json();

        const todaySpend = todayData?.data?.[0]?.spend
          ? parseFloat(todayData.data[0].spend)
          : 0;
        const yesterdaySpend = yesterdayData?.data?.[0]?.spend
          ? parseFloat(yesterdayData.data[0].spend)
          : 0;

        const balance = accountData?.balance
          ? parseFloat(accountData.balance) / 100
          : 0;

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
          balance,
          cards,
        };
      } catch {
        insights[account.id] = {
          today_spend: 0,
          yesterday_spend: 0,
          balance: 0,
          cards: [],
        };
      }
    });

    await Promise.all(promises);

    // Upsert all insights into DB
    const upsertRows = Object.entries(insights).map(([adAccountId, data]: [string, any]) => ({
      ad_account_id: adAccountId,
      today_spend: data.today_spend,
      yesterday_spend: data.yesterday_spend,
      balance: data.balance,
      cards: data.cards,
      updated_at: new Date().toISOString(),
    }));

    if (upsertRows.length > 0) {
      await supabase
        .from("ad_account_insights")
        .upsert(upsertRows, { onConflict: "ad_account_id" });
    }

    // Add updated_at to response
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
