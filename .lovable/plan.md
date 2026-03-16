

## Plan: Multiple Improvements Across Admin Dashboard

### Summary of Changes

1. **No auto-update** — Remove automatic data fetching; only manual "Update from Meta" triggers refresh
2. **Ad Account update → Dashboard remaining limit also updates**
3. **Client assign/unassign dialog: searchable client list**
4. **Billings: add "last synced X ago" + remove auto-update**
5. **Ad Account "Update from Meta" also updates Billing data**
6. **Business Manager sync → selective account import (not auto-add all)**
7. **Prevent duplicate accounts across Ad Accounts and Billings**

---

### File-by-File Changes

#### 1. `src/components/admin/AdminAdAccounts.tsx`

**a) Update All from Meta → also invalidate dashboard remaining limit**
- In `refreshAllMutation.onSuccess` and `refreshSelectedMutation.onSuccess`, add `queryClient.invalidateQueries({ queryKey: ["admin-ad-accounts"] })` (already there) + invalidate billings queries (`billings-accounts`, `billings-insights`) so Billings page picks up fresh data too.

**b) Assign/Unassign dialog: searchable client list**
- Add a `clientSearch` state variable
- In the Assign dialog, replace the plain `Select` with an `Input` search field above the `Select` dropdown, filtering clients by name/email as the admin types
- Use `Command` (cmdk) component or simply filter the `SelectItem` list based on search text

#### 2. `src/components/admin/AdminDashboard.tsx`

**a) No auto-update changes needed** — currently data only refreshes on manual button clicks (Fetch Live, Update from Meta). The realtime subscription on `ad_accounts` table just invalidates the query cache which re-reads from DB, not Meta. This is fine.

**b) Remaining Limit updates** — already computed from `adAccounts` query which gets invalidated when ad accounts update. No change needed here.

#### 3. `src/pages/BillingsPage.tsx`

**a) Add "Synced X min ago" relative time** (same pattern as AdminAdAccounts)
- Add `useEffect` with `setInterval` to compute relative time string from `lastUpdated`
- Display next to "Update from Meta" button

**b) Remove auto-update** — currently it only loads from cache on mount and manual "Update from Meta" button. No auto-update exists, so no change needed.

**c) Share data with Ad Accounts** — When Ad Accounts page does "Update from Meta", it should invalidate `billings-insights` query too. This is handled in AdminAdAccounts changes above.

#### 4. `src/components/admin/AdminBusinessManagers.tsx` — Major Change

**Current behavior**: Sync fetches all accounts from Meta and auto-upserts them into `ad_accounts` table.

**New behavior**: 
- Sync fetches accounts from Meta but shows them in a **selection dialog** instead of auto-inserting
- Admin can filter by status (active/disabled) and select which accounts to import
- Only selected accounts get inserted into `ad_accounts`
- Prevent duplicates: check existing `account_id` values and skip/warn for already-imported accounts

**Implementation**:
- After `syncMutation` succeeds, store the returned synced accounts in local state instead of auto-inserting
- Show a new `Dialog` with a table of synced accounts, checkboxes, status filter (active/disabled), and an "Import Selected" button
- The "Import Selected" button inserts only chosen accounts into `ad_accounts`
- Accounts already in `ad_accounts` table are marked as "Already imported" and excluded

#### 5. `supabase/functions/sync-bm-accounts/index.ts` — Modify to return data without auto-inserting

**Current**: Fetches from Meta API and upserts all accounts into `ad_accounts`
**New**: Fetches from Meta API and **returns the accounts list** without upserting. The frontend handles selective import.

- Remove the batch upsert logic
- Return the raw account data (id, name, status, spend_cap, amount_spent, business_name) so the frontend can display them for selection
- Keep sync_logs for tracking

#### 6. New import logic in `AdminBusinessManagers.tsx`

- After admin selects accounts from the sync results dialog, call a simple Supabase insert for the selected accounts
- Before inserting, query existing `ad_accounts` by `account_id` to prevent duplicates
- Show count of "X new accounts imported, Y already exist"

---

### Technical Details

**Searchable client list** — Filter `clients` array with a text input in the Assign dialog. Simple approach: add an `Input` above the `Select`, filter `SelectItem` entries by `full_name` or `email` matching the search term.

**Relative time for Billings** — Same pattern as AdminAdAccounts: `useEffect` + `setInterval(30s)` computing "just now", "X min ago", etc.

**Selective sync flow**:
```text
Admin clicks "Sync" on BM
  → Edge function fetches Meta accounts, returns JSON list (no DB insert)
  → Frontend shows dialog with account list + checkboxes + active/disabled filter
  → Admin selects accounts, clicks "Import Selected"
  → Frontend inserts selected into ad_accounts table (checking for duplicates)
```

**Cross-page cache invalidation** — When AdminAdAccounts updates from Meta, also invalidate `billings-insights` and `billings-accounts` query keys so Billings page shows fresh data.

### Files Modified
- `src/components/admin/AdminBusinessManagers.tsx` — selective import dialog, no auto-insert
- `src/components/admin/AdminAdAccounts.tsx` — cross-invalidate billings, searchable client assign
- `src/pages/BillingsPage.tsx` — relative sync time display
- `supabase/functions/sync-bm-accounts/index.ts` — return data instead of auto-upserting

