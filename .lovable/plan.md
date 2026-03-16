

## Plan: Fix Billing Link, Dashboard Updates, Spend Display & Date Range

### Issues Found

1. **Billing button wrong link**: The Billings page billing button links to Meta's `billing_hub` URL — this looks correct in code. However, the `account_id` stored in DB may already lack the `act_` prefix for some accounts, making the URL incorrect. Will ensure the URL always constructs properly regardless of prefix format.

2. **Dashboard remaining limit not updating**: Root cause found — the `get-account-insights` edge function updates `ad_account_insights` table only, but the dashboard's "Remaining Limit" is computed from `ad_accounts.spend_cap - ad_accounts.amount_spent`. The `ad_accounts` table is never updated with fresh `amount_spent` from Meta. Fix: update `ad_accounts.amount_spent` in the edge function after fetching from Meta.

3. **Today's/Yesterday's spend showing "—"**: The `spendData` state resets to `null` on every page navigation. Fix: persist fetched spend data in `sessionStorage` so it survives tab switches within the dashboard. Only clear on new fetch.

4. **Date range picker**: Currently single-date picker. Change to two-date (from/to) range picker. Edge function needs to support `date_from` + `date_to` params for `time_range`.

---

### Changes

#### 1. `supabase/functions/get-account-insights/index.ts`
- Accept `date_from` and `date_to` params (in addition to existing `date`)
- When both provided, use `time_range={"since":"date_from","until":"date_to"}` for Meta API
- After fetching from Meta (source=meta, no custom date), **update `ad_accounts` table** with fresh `amount_spent` values derived from `spend_cap - (balance * 100)` or track it from the Meta response
- Actually, Meta's `act_XXX?fields=spend` gives lifetime spend. Better approach: fetch `amount_spent` from Meta account endpoint and update `ad_accounts.amount_spent`

#### 2. `src/components/admin/AdminDashboard.tsx`
- **Persist spend data**: Save `spendData` to `sessionStorage` on fetch, restore on mount. Shows last fetched data until next manual fetch.
- **Date range picker**: Replace single date picker with two date inputs (From / To). When both selected, fetch spend for that range via edge function with `date_from`/`date_to` params.
- **Invalidate after meta update**: `handleUpdateFromMeta` should also invalidate `admin-ad-accounts` (already does) — the remaining limit will auto-update once the edge function updates `ad_accounts.amount_spent`.

#### 3. `src/pages/BillingsPage.tsx`
- Ensure billing button URL handles both `act_XXXXX` and plain numeric `account_id` correctly. Use consistent URL: `https://business.facebook.com/billing_hub/accounts/details?asset_id=${numericId}`

#### 4. `src/components/admin/AdminAdAccounts.tsx`
- Same billing link fix for consistency

### Files Modified
- `supabase/functions/get-account-insights/index.ts` — date range support, update `ad_accounts.amount_spent`
- `src/components/admin/AdminDashboard.tsx` — persist spend data, date range picker (from/to)
- `src/pages/BillingsPage.tsx` — billing link fix
- `src/components/admin/AdminAdAccounts.tsx` — billing link fix (if needed)

