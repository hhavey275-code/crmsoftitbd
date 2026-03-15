

## Plan: Cache Meta Insights Data + Manual Refresh Button

### Problem
Every page load calls the Meta API for all accounts, causing slow loading and risking API rate limits.

### Solution
Store insights data in a new DB table `ad_account_insights`. Only fetch from Meta when user explicitly clicks "Update All from Meta" or selects individual accounts to update.

### 1. New DB table: `ad_account_insights`

```sql
CREATE TABLE public.ad_account_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  today_spend numeric DEFAULT 0,
  yesterday_spend numeric DEFAULT 0,
  balance numeric DEFAULT 0,
  cards jsonb DEFAULT '[]',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(ad_account_id)
);

ALTER TABLE public.ad_account_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage insights" ON public.ad_account_insights FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view assigned account insights" ON public.ad_account_insights FOR SELECT TO authenticated USING (ad_account_id IN (SELECT ad_account_id FROM user_ad_accounts WHERE user_id = auth.uid()));
```

### 2. Update Edge Function `get-account-insights`

- After fetching from Meta API, **upsert** the results into `ad_account_insights` table
- Add a new mode: `{ ad_account_ids, source: "cache" | "meta" }`
  - `source: "cache"` (default) — read from DB table only, no API calls
  - `source: "meta"` — call Meta API, save to DB, return fresh data

### 3. Update `AdminAdAccounts.tsx` and `ClientAdAccounts.tsx`

- On page load: fetch insights from DB cache (source: "cache") — fast, no API call
- Add **"Update All from Meta"** button at top of page that calls with `source: "meta"`
- Add per-row refresh icon button to update a single account from Meta
- Show `updated_at` timestamp so user knows how fresh the data is
- Remove the `useEffect` that auto-calls Meta API on every load

### 4. Remove auto-fetch from `ClientDashboard.tsx`

Client dashboard should NOT show today/yesterday/balance/cards columns — already confirmed it doesn't have them. No changes needed there.

### Files

| File | Action |
|------|--------|
| Migration | Create `ad_account_insights` table |
| `supabase/functions/get-account-insights/index.ts` | Add cache/meta mode, upsert to DB |
| `src/components/admin/AdminAdAccounts.tsx` | Load from cache, add refresh buttons |
| `src/components/client/ClientAdAccounts.tsx` | Load from cache, add refresh buttons |

