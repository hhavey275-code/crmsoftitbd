

## Plan: Restructure Database to Match Updated Schema

### What Changes

The user wants to restructure the database to introduce a separate `user_ad_accounts` assignment table, rename `top_up_requests` → `topups` with new columns (`old_spend_cap`, `new_spend_cap`, `meta_response`), rename `transactions` → `wallet_transactions` with a `status` column, and add `business_name` to `ad_accounts`.

### 1. Database Migration

**Drop & recreate approach** (since this is early-stage, no production data to preserve):

**`ad_accounts` table changes:**
- Add `business_name` text column (nullable)
- Remove `assigned_user_id` (moved to `user_ad_accounts`)
- Remove `user_id` (no longer needed — ownership is via `user_ad_accounts`)
- Remove `platform` (always Meta)
- Keep `spend_cap`, `amount_spent` (still needed for display/sync)

**New `user_ad_accounts` table:**
- `id` uuid PK
- `user_id` uuid (references auth.users, NOT NULL)
- `ad_account_id` uuid (FK → ad_accounts, NOT NULL)
- `assigned_at` timestamptz DEFAULT now()
- Unique constraint on (user_id, ad_account_id)
- RLS: admins full access, clients SELECT where `user_id = auth.uid()`

**Rename `top_up_requests` → `topups`:**
- Keep: `id`, `user_id`, `ad_account_id`, `amount`, `status`, `created_at`
- Add: `old_spend_cap` numeric DEFAULT 0, `new_spend_cap` numeric DEFAULT 0, `meta_response` jsonb
- Remove: `payment_method`, `payment_reference`, `proof_url`, `admin_note`, `reviewed_by`, `updated_at`

**Rename `transactions` → `wallet_transactions`:**
- Keep: `id`, `user_id`, `type`, `amount`, `created_at`, `reference_id`
- Add: `status` text DEFAULT 'completed'
- Remove: `balance_after`, `description`

**RLS policies** for new/renamed tables will mirror existing patterns (admin full access, client own-data access).

### 2. Edge Function Updates

**`sync-bm-accounts`**: Update upsert to include `business_name` field from Meta API response, remove `user_id` and `platform` fields.

**`update-spend-cap`**: Store `old_spend_cap` and `new_spend_cap` on the `topups` record, save `meta_response` JSON.

**`scheduled-sync`**: No structural changes needed.

### 3. Frontend Component Updates

**`AdminBusinessManagers.tsx`**: Update assignment to use `user_ad_accounts` table instead of `assigned_user_id` on `ad_accounts`. Show `business_name` column.

**`AdminAdAccounts.tsx`**: Query joins through `user_ad_accounts` for assignment. Assignment dropdown inserts/deletes from `user_ad_accounts` instead of updating `ad_accounts.assigned_user_id`.

**`AdminTopUp.tsx`**: Query from `topups` instead of `top_up_requests`. Show `old_spend_cap`/`new_spend_cap`. Remove payment method/reference columns.

**`AdminTransactions.tsx`**: Query from `wallet_transactions` instead of `transactions`. Add `status` column display.

**`ClientAdAccounts.tsx`**: Query through `user_ad_accounts` joined with `ad_accounts` instead of filtering by `assigned_user_id`.

**`ClientTopUp.tsx`**: Insert into `topups` instead of `top_up_requests`. Remove payment reference/method fields.

**`ClientWallet.tsx`**: Query `topups` instead of `top_up_requests`.

**`ClientTransactions.tsx`**: Query `wallet_transactions` instead of `transactions`.

**`AdminWallet.tsx`**: No table name changes needed (still uses `wallets`).

**`ClientDashboard.tsx`** and **`AdminDashboard.tsx`**: Update any references to old table names.

### 4. Implementation Order

1. Run database migration (create new tables, migrate data references, drop old)
2. Update all edge functions for new schema
3. Update all admin components
4. Update all client components
5. Update dashboard components

