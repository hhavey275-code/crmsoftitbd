

## Plan: Business Manager Integration & Enhanced Top-Up Flow

### Overview
Transform the platform from a simple wallet/top-up system into a Meta Business Manager-connected platform where admins manage BMs and ad accounts, assign accounts to clients, and top-ups trigger Meta API spend cap updates.

---

### 1. Database Schema Changes

**New table: `business_managers`**
- `id` (uuid, PK), `bm_id` (text, Meta BM ID), `name` (text), `access_token` (text, encrypted), `status` (text: active/inactive), `created_at`, `updated_at`
- Admin-only RLS (read/write)

**Modify `ad_accounts`**
- Add `business_manager_id` (uuid, FK → business_managers)
- Add `assigned_user_id` (uuid, nullable) — the client this account is assigned to
- Keep `user_id` for backwards compat but deprecate in favor of `assigned_user_id`
- Add `spend_cap` (numeric), `amount_spent` (numeric), `meta_account_id` (text)

**Modify `top_up_requests`**
- Add `ad_account_id` (uuid, FK → ad_accounts) — which ad account the top-up targets

RLS: Admins full access on `business_managers`. Clients can SELECT ad_accounts where `assigned_user_id = auth.uid()`.

---

### 2. New Admin Pages & Components

**Business Managers page** (`/business-managers`)
- List all connected BMs with status
- "Connect BM" dialog: enter BM ID + access token + name
- Per-BM: expand to see its ad accounts (synced from Meta API)
- "Sync Accounts" button per BM → calls edge function to fetch ad accounts from Meta Graph API
- Assign/unassign ad accounts to clients via dropdown

**Updated Admin Ad Accounts**
- Show BM name column, assigned client column
- Inline assign client dropdown

**Updated Admin Top-Up**
- Show target ad account in the requests table
- On approve: deduct wallet, call Meta API to update spend_cap

**Sidebar update**
- Add "Business Managers" nav item (admin-only, conditionally rendered)

---

### 3. Updated Client Flow

**Client Ad Accounts**
- Remove manual "Add Account" — accounts are now admin-assigned
- Show only accounts where `assigned_user_id = user.id`
- Display spend cap and amount spent per account

**Client Top-Up**
- Add ad account selector (dropdown of assigned accounts)
- Client picks account + enters amount → submits request

---

### 4. Edge Functions

**`sync-bm-accounts`** — Admin triggers manually
- Receives `business_manager_id`
- Fetches ad accounts from Meta Graph API (`GET /{bm_id}/owned_ad_accounts`)
- Upserts into `ad_accounts` table

**`update-spend-cap`** — Called on top-up approval
- Receives `ad_account_id` and `amount`
- Calls Meta API (`POST /act_{id}` with `spend_cap` parameter)
- Logs result

**`scheduled-sync`** — Background worker (cron every 15 min)
- Iterates active BMs, syncs ad account data (spend, status)
- Updates `amount_spent` on each ad account

---

### 5. Implementation Order

1. Run database migration (new table + alter existing tables)
2. Create edge functions (sync-bm-accounts, update-spend-cap, scheduled-sync)
3. Build Admin Business Managers page + components
4. Update Admin Ad Accounts and Top-Up components
5. Update Client Ad Accounts and Top-Up to use new schema
6. Add Business Managers to sidebar (admin-only)
7. Update dashboard metrics to reflect BM data

---

### Technical Notes
- Meta Graph API access token will be stored per BM in the `business_managers` table. The edge functions use the service role key to read tokens server-side (never exposed to client).
- The scheduled sync edge function will be configured via `supabase/config.toml` cron schedule.
- Wallet deduction on top-up approval happens atomically with the spend_cap API call — if Meta API fails, the transaction rolls back.

