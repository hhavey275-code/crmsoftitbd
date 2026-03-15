

## Plan: Fetch All Ad Accounts (Owned + Client) from Business Manager

### Problem

The current sync function only calls the Meta API endpoint `/{bm_id}/owned_ad_accounts`, which returns only accounts **owned** by the Business Manager. Many BMs also have **client ad accounts** (shared/managed accounts) that are accessed via a separate endpoint: `/{bm_id}/client_ad_accounts`.

### Fix

**Edge Function (`sync-bm-accounts/index.ts`)**:
1. Fetch from **both** Meta API v24.0 endpoints with pagination:
   - `/{bm_id}/owned_ad_accounts` — accounts the BM owns
   - `/{bm_id}/client_ad_accounts` — accounts shared with the BM
2. Deduplicate by `account_id` before upserting (an account could appear in both)
3. Upsert all combined results into the `ad_accounts` table

**Database Migration**:
- Make `ad_accounts.user_id` nullable (it's currently NOT NULL but no longer semantically needed since assignments moved to `user_ad_accounts`). The edge function currently sets it to the admin's user ID as a workaround, but making it nullable is cleaner.

### Changes

| File | Change |
|------|--------|
| `supabase/functions/sync-bm-accounts/index.ts` | Add second fetch loop for `client_ad_accounts`, merge + deduplicate results |
| Database migration | `ALTER TABLE ad_accounts ALTER COLUMN user_id DROP NOT NULL` |

