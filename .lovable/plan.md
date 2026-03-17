

## Problem Analysis

Current flow in `spend-cap-update`:
1. Wallet balance deducted
2. Transaction record created
3. Meta API called to update spend cap
4. **If Meta API returns error** → rollback wallet + delete transaction
5. If success → update DB spend cap

**The bug**: Meta API sometimes actually succeeds (spend cap increases on Meta's side) but the response fails due to network timeout, server issues, or ambiguous error responses. The function treats this as failure, rolls back the wallet, but the spend cap is already increased on Meta. Result: client gets free spend cap increase.

## Solution: Verification Before Rollback

After receiving a Meta API error, **verify the actual spend cap from Meta** with a GET request before deciding to rollback. If the spend cap was actually updated, treat it as success.

### Changes

**1. Update `supabase/functions/spend-cap-update/index.ts`**

After the Meta API POST returns an error, add a verification step:
- GET `https://graph.facebook.com/v24.0/{actId}?fields=spend_cap&access_token=...`
- Compare the returned `spend_cap` with the expected `newSpendCap * 100` (Meta uses cents)
- If Meta's actual spend cap matches or exceeds the expected new value → treat as success (don't rollback, update DB)
- If Meta's spend cap is still the old value → proceed with rollback as before
- If the verification GET also fails → log the issue, still rollback but flag for manual review

Also wrap the Meta API POST in a try-catch for network timeouts, applying the same verification logic.

### Flow After Fix

```text
1. Deduct wallet
2. Create transaction
3. POST to Meta API
4. If error/timeout:
   4a. GET Meta API to verify actual spend cap
   4b. If spend cap actually increased → treat as SUCCESS
   4c. If spend cap unchanged → ROLLBACK wallet
5. If success → update DB spend cap
```

This is a minimal, targeted fix that prevents the "free spend cap" exploit without changing the overall architecture.

