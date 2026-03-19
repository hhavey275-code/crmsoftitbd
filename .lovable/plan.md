

## Plan: TikTok Ad Accounts Tab (Postpaid / Spend Cap)

### Overview
Add a "TikTok Ad Accounts" tab next to "All Ad Accounts" (Meta) on the Ad Accounts page. TikTok accounts are postpaid with spend cap — same model as Meta. Admin can add TikTok Business Centers, sync accounts, and top up. Clients see their assigned TikTok accounts and can top up from wallet.

### Steps

**1. Database Migration — Add `platform` column**
```sql
ALTER TABLE ad_accounts ADD COLUMN platform TEXT NOT NULL DEFAULT 'meta';
ALTER TABLE business_managers ADD COLUMN platform TEXT NOT NULL DEFAULT 'meta';
```
Existing data stays as `meta`. TikTok records will have `platform = 'tiktok'`.

**2. Update `AdAccountsPage.tsx` — Tab wrapper**
- Two tabs: "Meta Ad Accounts" | "TikTok Ad Accounts"
- Meta tab renders existing `AdminAdAccounts` / `ClientAdAccounts` (no changes)
- TikTok tab renders new components

**3. Create `AdminTikTokAccounts.tsx`**
- Add TikTok Business Center (bc_id, name, access_token stored in `business_managers` with `platform: 'tiktok'`)
- Sync button → calls `tiktok-sync` edge function
- Table: Account Name, Spend Cap, Amount Spent, Status, Top Up button
- Top up calls `tiktok-topup` edge function (same wallet-first pattern as Meta)

**4. Create `ClientTikTokAccounts.tsx`**
- Shows assigned TikTok accounts (filtered by `platform = 'tiktok'`)
- Same columns: Account Name, Spend Cap, Amount Spent, Status
- Top Up button → wallet deduction + TikTok API call

**5. Create Edge Function `tiktok-sync/index.ts`**
- Fetches TikTok ad accounts via `GET /open_api/v1.3/bc/advertiser/get/`
- Gets balance/status via `GET /open_api/v1.3/advertiser/balance/get/`
- Upserts into `ad_accounts` with `platform = 'tiktok'`

**6. Create Edge Function `tiktok-topup/index.ts`**
- Same wallet-first deduction pattern as `spend-cap-update`
- Calls TikTok `POST /open_api/v1.3/bc/transfer/` with `transfer_type: "RECHARGE"`
- On failure → logs to `failed_topups`
- On success → updates `ad_accounts.spend_cap`

**7. Add `TIKTOK_ACCESS_TOKEN` secret**
- Will request via `add_secret` tool for TikTok Business API authentication

### Technical Notes
- TikTok uses `advertiser_id` (numeric, no `act_` prefix)
- TikTok API uses dollar amounts directly (not cents)
- Since postpaid with spend cap — same `SpendProgressBar` component works
- Existing Meta queries will add `platform = 'meta'` filter (or no filter since default is `meta`)
- `failed_topups` table works as-is — no schema change needed
- RLS policies unchanged — `platform` is just a column filter

