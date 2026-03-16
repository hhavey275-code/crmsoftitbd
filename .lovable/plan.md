

## Plan: Fix spend-cap-update Edge Function

### Root Cause
Two issues causing 403:
1. **Role check only looks for `admin`** (line 43-48) — misses `superadmin` role entirely
2. **When no client is assigned**, admin still hits the wallet/assignment checks and fails

### Changes

#### `supabase/functions/spend-cap-update/index.ts` — Rewrite
- Check for **both** `admin` and `superadmin` roles (query without filtering by specific role, check if role is admin or superadmin)
- When admin calls without `target_user_id` and `deduct_wallet` is false (or no assigned client), **skip wallet deduction entirely** — just update spend cap on Meta and DB
- When `deduct_wallet` is true with a `target_user_id`, proceed with wallet deduction as before
- Keep Meta Graph API v24.0 POST to update spend cap
- Keep rollback logic if Meta API fails after wallet deduction

#### `src/components/admin/AdminAdAccounts.tsx` — No change needed
Already sends `deduct_wallet: !!assignedUserId` (false when no client assigned) and `target_user_id: assignedUserId` (null when unassigned). This is correct.

### Summary of Logic Flow (Admin, no client assigned)
1. Auth check → get user
2. Role check → admin OR superadmin → `isAdmin = true`
3. `deduct_wallet` = false, `target_user_id` = null → skip wallet logic
4. Fetch ad account + BM access token
5. POST to Meta v24.0 to update spend cap
6. Update `ad_accounts.spend_cap` in DB
7. Return success

### Files Modified
- `supabase/functions/spend-cap-update/index.ts`

