

## Failed Top-Up System - Plan

### Problem
Currently, when a client tops up an ad account, the `spend-cap-update` edge function calls Meta API first, then deducts wallet. The user wants: **wallet deduct first**, then Meta API call. If Meta fails, the attempt goes to a "Failed Top-Up" queue with retry and cleanup options.

### New Flow
```text
Client clicks "Top Up" on ad account
  → Wallet balance deducted immediately
  → Meta API POST call
    ├── SUCCESS → Update ad_accounts.spend_cap, done
    └── FAIL → Insert into failed_topups table
              → Client/Admin sees it in Failed Top-Up section
              → Retry button → re-calls Meta API
                ├── SUCCESS → Update spend_cap, delete from failed_topups
                └── FAIL → stays in failed_topups
              → "Mark Failed & Delete" → refunds wallet, removes record
```

### Database Changes

1. **New `failed_topups` table:**
   - `id` (uuid, PK)
   - `user_id` (uuid, NOT NULL)
   - `ad_account_id` (uuid, NOT NULL)
   - `amount` (numeric, NOT NULL) — the USD amount deducted
   - `old_spend_cap` (numeric) — spend cap before attempt
   - `error_message` (text)
   - `created_at` (timestamptz, default now())
   - `status` (text, default 'pending') — 'pending' or 'resolved'
   - RLS: admins full access, clients can SELECT own rows

2. **Enable realtime** on `failed_topups` for live updates.

### Edge Function Changes

**`spend-cap-update/index.ts`** — Modify the flow:
- Move wallet deduction **before** Meta API call
- On Meta API failure: insert into `failed_topups` table, return error with `failed_topup_id`
- On Meta API success: proceed as normal (update spend_cap in DB)
- Add system_log entries for all outcomes

**New `retry-failed-topup/index.ts`** edge function:
- Takes `failed_topup_id`
- Auth check (admin or owning client)
- Fetches failed_topup record, gets ad account + BM token
- Calls Meta API with the stored amount (old_spend_cap + amount)
- On success: update ad_accounts.spend_cap, delete from failed_topups, log to system_logs
- On fail: update error_message, return error

**New `resolve-failed-topup/index.ts`** edge function:
- Takes `failed_topup_id` and `action` ('refund')
- Auth check (admin or owning client)
- Refunds wallet balance (add amount back)
- Creates refund transaction record
- Deletes from failed_topups
- Logs to system_logs

### Frontend Changes

1. **`src/components/client/ClientAdAccounts.tsx`** — Update `topUpMutation`:
   - On error response containing `failed_topup_id`, show appropriate toast
   - Invalidate failed_topups query

2. **New `src/components/FailedTopUps.tsx`** component:
   - Queries `failed_topups` table (filtered by user for clients, all for admins)
   - Shows ad account name, amount, error, timestamp
   - "Retry" button → calls `retry-failed-topup` function
   - "Refund & Delete" button → calls `resolve-failed-topup` function
   - Realtime subscription for live updates

3. **`src/components/client/ClientAdAccounts.tsx`** — Add Failed Top-Ups section above or below the accounts table

4. **`src/components/admin/AdminAdAccounts.tsx`** — Add Failed Top-Ups section for admin view

5. **`src/hooks/useSidebarBadges.ts`** — Add count of pending failed_topups for both clients and admins, show badge on "Ad Accounts" menu item

6. **`src/components/AppSidebar.tsx`** — Ensure badge renders on ad-accounts for clients too

7. **System Logs** — All actions (failed creation, retry success/fail, refund) logged to `system_logs` table with user_name, action, and details

### System Log Actions
- "Top-Up Failed" — when Meta API fails after wallet deduction
- "Failed Top-Up Retried" — when retry succeeds
- "Failed Top-Up Retry Failed" — when retry fails again
- "Failed Top-Up Refunded" — when admin/client marks as failed and refunds

