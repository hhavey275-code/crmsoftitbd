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

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

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
  const purchaseTypes = ["purchase"];
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

async function fetchBudgetTotalByEdge(actId: string, accessToken: string, edge: "campaigns" | "adsets"): Promise<number> {
  try {
    const filterParam = encodeURIComponent(JSON.stringify([{"field":"effective_status","operator":"IN","value":["ACTIVE"]}]));
    let url = `https://graph.facebook.com/v24.0/${actId}/${edge}?fields=daily_budget,name&filtering=${filterParam}&limit=200&access_token=${accessToken}`;
    let total = 0;
    let pageGuard = 0;
    const debugItems: any[] = [];

    while (url && pageGuard < 5) {
      const res = await fetch(url);
      const data = await res.json();
      if (data?.error) {
        console.log(`DEBUG_BUDGET_ERROR[${actId}/${edge}]:`, JSON.stringify(data.error));
        return 0;
      }

      for (const row of data?.data ?? []) {
        const rawVal = row?.daily_budget;
        debugItems.push({ name: row?.name, daily_budget_raw: rawVal, id: row?.id });
        if (rawVal !== undefined && rawVal !== null) {
          const parsed = parseFloat(String(rawVal));
          if (Number.isFinite(parsed) && parsed > 0) {
            // Meta returns daily_budget in cents (minor units)
            total += parsed / 100;
          }
        }
      }

      url = data?.paging?.next ?? "";
      pageGuard += 1;
    }

    console.log(`DEBUG_BUDGET[${actId}/${edge}]: items=${JSON.stringify(debugItems)}, total=${total}`);
    return Number(total.toFixed(2));
  } catch {
    return 0;
  }
}

async function fetchActiveDailyBudget(actId: string, accessToken: string): Promise<number> {
  const [campaignBudgetTotal, adsetBudgetTotal] = await Promise.all([
    fetchBudgetTotalByEdge(actId, accessToken, "campaigns"),
    fetchBudgetTotalByEdge(actId, accessToken, "adsets"),
  ]);

  return Number(Math.max(campaignBudgetTotal, adsetBudgetTotal).toFixed(2));
}

// Check for Meta API rate limit errors
function checkRateLimit(data: any): number | null {
  if (data?.error?.code === 17 || data?.error?.code === 32 || data?.error?.code === 4) return data.error.code;
  return null;
}

function extractNumericValue(input: any): number | null {
  if (input === null || input === undefined) return null;

  if (typeof input === "number") {
    return Number.isFinite(input) ? input : null;
  }

  if (typeof input === "string") {
    const n = Number(input);
    return Number.isFinite(n) ? n : null;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      const n = extractNumericValue(item);
      if (n !== null) return n;
    }
    return null;
  }

  if (typeof input === "object") {
    const preferredKeys = [
      "amount",
      "value",
      "threshold_amount",
      "daily_spend_limit",
      "adtrust_dsl",
      "min_billing_threshold",
    ];

    for (const key of preferredKeys) {
      if (key in input) {
        const n = extractNumericValue(input[key]);
        if (n !== null) return n;
      }
    }

    if ("data" in input) {
      const n = extractNumericValue(input.data);
      if (n !== null) return n;
    }

    for (const val of Object.values(input)) {
      const n = extractNumericValue(val);
      if (n !== null) return n;
    }
  }

  return null;
}

function normalizeCurrency(raw: number | null): number {
  if (raw === null || !Number.isFinite(raw) || raw <= 0) return 0;

  // Meta may return either minor units (e.g. "2500") or major units (e.g. "25.00")
  if (Number.isInteger(raw) && raw >= 100) return raw / 100;
  return raw;
}

function extractCurrencyFromPayload(payload: any, field: string): number {
  if (!payload || payload.error) return 0;

  const direct = extractNumericValue(payload?.[field]);
  if (direct !== null) return normalizeCurrency(direct);

  if (Array.isArray(payload?.data)) {
    for (const row of payload.data) {
      const n = extractNumericValue(row?.[field] ?? row);
      if (n !== null) return normalizeCurrency(n);
    }
  } else if (payload?.data) {
    const n = extractNumericValue(payload.data?.[field] ?? payload.data);
    if (n !== null) return normalizeCurrency(n);
  }

  return 0;
}

// Process a single account's Meta API calls
async function processAccount(
  account: any,
  serviceKey: string,
  date?: string,
  date_from?: string,
  date_to?: string,
): Promise<{
  id: string;
  insight: any;
  rateLimit?: { account_id: string; account_name: string; error_code: number };
  adAccountUpdate?: { id: string; amount_spent: number; spend_cap?: number };
}> {
  const emptyInsight = {
    today_spend: 0, yesterday_spend: 0,
    today_orders: 0, yesterday_orders: 0,
    active_campaigns: 0,
    today_messages: 0, yesterday_messages: 0,
    balance: 0, daily_spend_limit: 0, billing_threshold: 0, cards: [],
  };

  const rawToken = account.business_managers?.access_token;
  const actId = account.account_id;

  if (!rawToken) {
    return { id: account.id, insight: { ...emptyInsight } };
  }

  const accessToken = await decryptToken(rawToken, serviceKey);

  try {
    const isDateRange = date_from && date_to;
    const isSingleDate = date && !isDateRange;

    let todayUrl: string;
    let yesterdayUrl: string;

    if (isDateRange) {
      todayUrl = `https://graph.facebook.com/v24.0/${actId}/insights?fields=spend,actions&time_range={"since":"${date_from}","until":"${date_to}"}&access_token=${accessToken}`;
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

    // Main account data fetch (without adtrust_dsl which may not exist)
    const accountFieldsUrl = `https://graph.facebook.com/v24.0/${actId}?fields=balance,amount_spent,spend_cap,funding_source_details,is_prepay_account&access_token=${accessToken}`;
    
    const fetchPromises: Promise<Response>[] = [
      fetch(todayUrl),
      fetch(accountFieldsUrl),
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

    const rlCode = checkRateLimit(todayData) || checkRateLimit(yesterdayData) || checkRateLimit(accountData);
    if (rlCode) {
      return {
        id: account.id,
        insight: { ...emptyInsight },
        rateLimit: { account_id: actId, account_name: account.account_name || actId, error_code: rlCode },
      };
    }

    const todaySpend = todayData?.data?.[0]?.spend ? parseFloat(todayData.data[0].spend) : 0;
    const yesterdaySpend = yesterdayData?.data?.[0]?.spend ? parseFloat(yesterdayData.data[0].spend) : 0;

    const balance = accountData?.balance ? parseFloat(accountData.balance) / 100 : 0;

    // ---- DEBUG: Log all raw field values ----
    let debugInfo: any = { actId };

    // Fetch adtrust_dsl separately
    let adtrustDsl: any = null;
    try {
      const dslRes = await fetch(`https://graph.facebook.com/v24.0/${actId}?fields=adtrust_dsl&access_token=${accessToken}`);
      const dslData = await dslRes.json();
      adtrustDsl = dslData;
      debugInfo.adtrust_dsl_raw = dslData;
    } catch (e: any) { debugInfo.adtrust_dsl_error = e.message; }

    // Fetch min_campaign_group_spend_cap separately
    let cgData: any = null;
    try {
      const cgRes = await fetch(`https://graph.facebook.com/v24.0/${actId}?fields=min_campaign_group_spend_cap&access_token=${accessToken}`);
      cgData = await cgRes.json();
      debugInfo.min_campaign_group_spend_cap_raw = cgData;
    } catch (e: any) { debugInfo.min_campaign_group_spend_cap_error = e.message; }

    // Fetch min_daily_budget separately
    let mdbData: any = null;
    try {
      const mdbRes = await fetch(`https://graph.facebook.com/v24.0/${actId}?fields=min_daily_budget&access_token=${accessToken}`);
      mdbData = await mdbRes.json();
      debugInfo.min_daily_budget_raw = mdbData;
    } catch (e: any) { debugInfo.min_daily_budget_error = e.message; }

    // Log account data fields
    debugInfo.account_spend_cap_raw = accountData?.spend_cap;
    debugInfo.account_balance_raw = accountData?.balance;
    debugInfo.account_amount_spent_raw = accountData?.amount_spent;
    debugInfo.funding_source_details_raw = accountData?.funding_source_details;

    console.log(`DEBUG_META_FIELDS[${actId}]:`, JSON.stringify(debugInfo));

    // ---- Daily Spending Limit ----
    // Priority: 1) Sum of active campaign/adset daily budgets (what Ads Manager shows)
    //           2) adtrust_dsl (account-level trust limit, often unavailable)
    //           3) spend_cap as last resort
    let dailySpendLimit = 0;

    // Priority 1: Sum of all ACTIVE campaign/adset daily budgets
    dailySpendLimit = await fetchActiveDailyBudget(actId, accessToken);

    // Priority 2: adtrust_dsl
    if (!dailySpendLimit && adtrustDsl?.adtrust_dsl !== undefined && !adtrustDsl?.error) {
      const raw = parseFloat(String(adtrustDsl.adtrust_dsl));
      if (Number.isFinite(raw) && raw > 0) {
        dailySpendLimit = raw / 100;
      }
    }

    // Priority 3: spend_cap (account level)
    if (!dailySpendLimit && accountData?.spend_cap) {
      const raw = parseFloat(String(accountData.spend_cap));
      if (Number.isFinite(raw) && raw > 0) {
        dailySpendLimit = raw / 100;
      }
    }

    console.log(`DEBUG_DSL_FINAL[${actId}]: activeBudget=${dailySpendLimit}`);

    // ---- Billing Threshold ----
    let billingThreshold = 0;
    const fsd = accountData?.funding_source_details;
    if (fsd) {
      const thresholdCandidates = [
        fsd.billing_activity_threshold,
        fsd.current_balance,
        fsd.amount,
      ];
      for (const candidate of thresholdCandidates) {
        if (candidate !== undefined && candidate !== null) {
          const parsed = parseFloat(String(candidate));
          if (Number.isFinite(parsed) && parsed > 0) {
            billingThreshold = parsed / 100;
            break;
          }
        }
      }
    }

    console.log(`DEBUG_COMPUTED[${actId}]: dailySpendLimit=${dailySpendLimit}, billingThreshold=${billingThreshold}`);

    

    let adAccountUpdate: any = undefined;
    if (!isSingleDate && !isDateRange && accountData?.amount_spent !== undefined) {
      const metaAmountSpent = parseFloat(accountData.amount_spent) / 100;
      const rawSpendCap = accountData?.spend_cap;
      const metaSpendCap = rawSpendCap ? parseFloat(rawSpendCap) / 100 : 0;
      adAccountUpdate = { id: account.id, amount_spent: metaAmountSpent };
      if (metaSpendCap > 0) {
        adAccountUpdate.spend_cap = metaSpendCap;
      }
    }

    const cards: any[] = [];
    if (fsd) {
      cards.push({
        id: fsd.id,
        display_string: fsd.display_string || `Card ending ${fsd.id?.slice(-4) || '****'}`,
        type: fsd.type,
      });
    }


    return {
      id: account.id,
      insight: {
        today_spend: todaySpend,
        yesterday_spend: yesterdaySpend,
        date_spend: (isSingleDate || isDateRange) ? todaySpend : undefined,
        today_orders: extractOrders(todayData),
        yesterday_orders: extractOrders(yesterdayData),
        active_campaigns: activeCampaigns,
        today_messages: extractMessages(todayData),
        yesterday_messages: extractMessages(yesterdayData),
        balance,
        daily_spend_limit: dailySpendLimit,
        billing_threshold: billingThreshold,
        cards,
      },
      adAccountUpdate,
    };
  } catch (fetchErr: any) {
    if (fetchErr?.status === 429) {
      return {
        id: account.id,
        insight: { ...emptyInsight },
        rateLimit: { account_id: actId, account_name: account.account_name || actId, error_code: 429 },
      };
    }
    return { id: account.id, insight: { ...emptyInsight } };
  }
}

// ====== MAIN ======
// Process accounts in small batches (5 at a time) with 300ms delay between batches
// to avoid Meta API rate limits. Each account makes 3-4 API calls, so batch of 5 = ~20 calls.
const META_BATCH_SIZE = 20;
const META_BATCH_DELAY_MS = 300;

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

    // Limit accounts per request to prevent timeout
    const MAX_ACCOUNTS = 100;
    if (source === "meta" && ad_account_ids.length > MAX_ACCOUNTS) {
      return new Response(JSON.stringify({ error: `Too many accounts (${ad_account_ids.length}). Maximum ${MAX_ACCOUNTS} per request. Please use smaller batches.` }), {
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
          daily_spend_limit: Number(row.daily_spend_limit ?? 0),
          billing_threshold: Number(row.billing_threshold ?? 0),
          cards: row.cards ?? [],
          updated_at: row.updated_at,
        };
      }
      return new Response(JSON.stringify({ insights }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // source === "meta" — fetch from Meta API in controlled batches
    const accounts = await batchSelect(
      supabase, "ad_accounts", "id", ad_account_ids,
      "id, account_id, amount_spent, spend_cap, business_manager_id, business_managers(access_token)"
    );

    const insights: Record<string, any> = {};
    const rateLimited: { account_id: string; account_name: string; error_code: number }[] = [];
    const adAccountUpdates: { id: string; amount_spent: number; spend_cap?: number }[] = [];

    // Process in small batches with delay to avoid Meta rate limits
    const accountBatches = chunk(accounts ?? [], META_BATCH_SIZE);
    let hitRateLimit = false;

    console.log(`Processing ${accounts?.length ?? 0} accounts in ${accountBatches.length} batches of ${META_BATCH_SIZE}`);

    for (let i = 0; i < accountBatches.length; i++) {
      const batch = accountBatches[i];

      // If we already hit a rate limit, skip remaining Meta calls and return empty
      if (hitRateLimit) {
        for (const account of batch) {
          insights[account.id] = {
            today_spend: 0, yesterday_spend: 0,
            today_orders: 0, yesterday_orders: 0,
            active_campaigns: 0,
            today_messages: 0, yesterday_messages: 0,
            balance: 0, daily_spend_limit: 0, billing_threshold: 0, cards: [],
          };
        }
        continue;
      }

      // Process batch concurrently (small batch = safe)
      const results = await Promise.all(
        batch.map((account: any) => processAccount(account, serviceKey, date, date_from, date_to))
      );

      for (const result of results) {
        insights[result.id] = result.insight;
        if (result.rateLimit) {
          rateLimited.push(result.rateLimit);
          hitRateLimit = true;
        }
        if (result.adAccountUpdate) {
          adAccountUpdates.push(result.adAccountUpdate);
        }
      }

      // Add delay between batches (skip after last batch)
      if (i < accountBatches.length - 1 && !hitRateLimit) {
        await delay(META_BATCH_DELAY_MS);
      }
    }

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
        daily_spend_limit: data.daily_spend_limit,
        billing_threshold: data.billing_threshold,
        cards: data.cards,
        updated_at: new Date().toISOString(),
      }));

      const upsertBatches = chunk(upsertRows, 30);
      for (const batch of upsertBatches) {
        await supabase
          .from("ad_account_insights")
          .upsert(batch, { onConflict: "ad_account_id" });
      }

      if (adAccountUpdates.length > 0) {
        const updateBatches = chunk(adAccountUpdates, 30);
        for (const batch of updateBatches) {
          for (const item of batch) {
            const updateData: any = { amount_spent: item.amount_spent };
            if (item.spend_cap !== undefined) {
              updateData.spend_cap = item.spend_cap;
            }
            await supabase.from("ad_accounts").update(updateData).eq("id", item.id);
          }
        }
      }
    }

    // Log API calls per BM
    if (source === "meta") {
      const bmCallMap: Record<string, { bmDbId: string; count: number }> = {};
      for (const account of (accounts ?? [])) {
        const bmDbId = account.business_manager_id;
        if (bmDbId) {
          if (!bmCallMap[bmDbId]) bmCallMap[bmDbId] = { bmDbId, count: 0 };
          bmCallMap[bmDbId].count += 4; // ~3-4 API calls per account
        }
      }
      const logRows = Object.values(bmCallMap).map(({ bmDbId, count }) => ({
        business_manager_id: bmDbId,
        function_name: "get-account-insights",
        call_count: count,
      }));
      if (logRows.length > 0) {
        await supabase.from("api_call_logs").insert(logRows);
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
