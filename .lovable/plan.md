# Spend Cap 100x Inflation Bug — Analysis & Fix Plan

## Problem

Garden Glow 02 এবং 03 এর spend cap $610 হওয়ার কথা ছিল কিন্তু হয়ে গেছে $61,000 (100x inflated)। Database এবং Meta দুইটাতেই ভুল value আছে।

**Current state:**

- Garden Glow 02: DB = $61,000 | Meta = $61,000 (should be ~$610)
- Garden Glow 03: DB = $21,000 | Meta = $21,000 (should be ~$210)

## Root Cause

At some point, a spend_cap value was stored in the DB as **cents instead of dollars** (e.g., 61000 cents written as 61000 dollars). Then `spend-cap-update` read that inflated DB value, added the top-up amount, and sent `(61000 + amount) × 100` to Meta — compounding the 100x error onto Meta as well.

Additionally, the **broken rollback mechanism** (PostgREST `.delete().order().limit()` doesn't work) has been silently eating wallet funds on failed top-ups.

## Fix Plan

### 1. Rewrite `spend-cap-update` — "Meta First" approach

Instead of deducting wallet first and rolling back on failure, flip the order:

- Authenticate and validate request
- Call Meta API to update spend cap **first**
- Verify with GET request that Meta actually updated
- **Only on confirmed success**: deduct wallet, create transaction, update DB
- If Meta fails → return error immediately, wallet untouched

This eliminates the broken rollback problem entirely.

### 2. Add safety guard against 100x errors

Add a sanity check in `spend-cap-update`: if `newSpendCap > 100000` (or some reasonable threshold), log a warning. Also add a debug log showing old/new values and the exact cents value being sent to Meta.

### 3. Fix inflated accounts (manual correction)

Since we can't programmatically fix Meta values (permissions issues with this BM token), the correction needs to happen in two parts:

- **DB fix**: Update the `ad_accounts` table to set correct spend_cap values
- **Meta fix**: This requires fixing the BM token permissions first, then sending the correct spend_cap via the updated edge function

### 4. Update `scheduled-sync` to v25.0

The `scheduled-sync` still uses Meta API **v21.0** while everything else uses v24.0. Align it for consistency.

## Technical Details

### `spend-cap-update/index.ts` — New flow:

```text
1. Auth + role check (unchanged)
2. Parse body, validate
3. Fetch ad account + BM token
4. Calculate newSpendCap = oldSpendCap + amount
5. POST to Meta API (newSpendCap × 100 cents)
6. GET from Meta to verify actual spend_cap
7. IF verified success:
   a. Deduct wallet (if requested)
   b. Create transaction record
   c. Update DB spend_cap
   d. Return success
8. IF Meta failed:
   a. Return error (no wallet touched)
```

### Files to change:

- `supabase/functions/spend-cap-update/index.ts` — Full rewrite with Meta-first approach
- `supabase/functions/scheduled-sync/index.ts` — Update API version to v24.0

### DB corrections needed (one-time):

- Garden Glow 02 (`act_386929350848250`): Set spend_cap to correct value
- Garden Glow 03 (`act_3617213511879915`): Set spend_cap to correct value
- Credit back affected wallets for failed/phantom deductions