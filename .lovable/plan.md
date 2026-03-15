

## Plan: Ad Account Display Updates + Meta Insights Data

### 1. Remove `act_` prefix from account ID display

In `ClientAdAccounts.tsx`, `AdminAdAccounts.tsx`, and `AdAccountDetailPage.tsx`, strip the `act_` prefix when displaying the account ID:
```tsx
{a.account_id.replace(/^act_/, '')}
```

### 2. Move Business Manager name under account ID (smaller text)

In `AdminAdAccounts.tsx`, remove the separate "Business Manager" column. Instead, show BM name as a third line under account name + ID in the Account cell, in smaller muted text.

In `ClientAdAccounts.tsx`, the client table already doesn't fetch BM name, so we need to update the query to join `business_managers(name)` and show it under the ID.

### 3. Bold the "Remaining" text in SpendProgressBar

In `SpendProgressBar.tsx`, add `font-semibold` to the "Remaining:" label text so the entire line is bold.

### 4. Fetch Today Spend, Yesterday Spend, Current Balance via Meta API

Create a new edge function `get-account-insights` that:
- Takes an `ad_account_id` (our DB uuid)
- Looks up the account and its BM access token
- Calls Meta Graph API Insights endpoint:
  - `GET /{act_id}/insights?fields=spend&date_preset=today`
  - `GET /{act_id}/insights?fields=spend&date_preset=yesterday`
- Returns `{ today_spend, yesterday_spend, current_balance }` (current_balance = spend_cap - amount_spent)

Display these 3 values in the ad account table rows. Add a new section or expand the SpendProgressBar to show:
- Today Spend: $X
- Yesterday Spend: $X  
- Current Balance: $X

### Files to modify/create

| File | Action |
|------|--------|
| `src/components/SpendProgressBar.tsx` | Bold "Remaining", add today/yesterday/balance display props |
| `src/components/client/ClientAdAccounts.tsx` | Remove `act_`, show BM name under ID, fetch+display insights |
| `src/components/admin/AdminAdAccounts.tsx` | Remove `act_`, move BM under ID (remove column), fetch+display insights |
| `src/pages/AdAccountDetailPage.tsx` | Remove `act_` prefix from display |
| `supabase/functions/get-account-insights/index.ts` | New edge function for Meta Insights API |
| `supabase/config.toml` | Register new edge function |

### Edge Function: `get-account-insights`

Accepts `{ ad_account_ids: string[] }` (batch mode for efficiency). For each account:
1. Look up `ad_accounts` + join `business_managers` to get access_token
2. Call Meta `/{act_id}/insights?fields=spend&date_preset=today` and `date_preset=yesterday`
3. Return map of account_id -> `{ today_spend, yesterday_spend, current_balance }`

The frontend will call this once on page load and display the data alongside each row.

