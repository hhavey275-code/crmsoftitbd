

## Plan: Rewrite `spend-cap-update` Edge Function from Scratch

### Root Cause Analysis

The persistent issue is a **unit mismatch** between what we send to Meta POST and what we read from Meta GET:

- **Meta GET** `spend_cap` returns **cents** (minor units) — confirmed from logs (e.g., `act_386929350848250: raw="1500000"` = $15,000 in DB ✓)
- **Meta POST** `spend_cap` also expects **cents** (per Meta Graph API docs) — but the current code sends **dollars**
- This means a $5 top-up sends `spend_cap=15005` (dollars) to POST, but Meta interprets it as 15005 cents = $150.05 — or the request fails due to rate limits before it even applies

The rate limit (Code 17) is a separate issue — that BM token is being throttled by Meta. The retry logic is fine but the **unit bug must be fixed first**.

### What Will Change

**File: `supabase/functions/spend-cap-update/index.ts`** — Complete rewrite with:

1. **Correct units everywhere**:
   - DB stores dollars → convert to cents for Meta POST: `Math.round(newSpendCapDollars * 100)`
   - Meta GET returns cents → convert to dollars for verification: `rawValue / 100`

2. **Strict Meta-first flow** (kept from current):
   - POST to Meta with cents value
   - Verify with GET, convert cents→dollars, compare to expected dollars (tolerance < $0.02)
   - Only on verified success: deduct wallet, insert transaction, update DB
   - On any failure: return error, touch nothing

3. **Rate limit retry** (kept, simplified):
   - Up to 3 retries with exponential backoff + jitter
   - Parse `Retry-After` header when available
   - Clear user-facing error message on exhaustion

4. **All existing features preserved**:
   - Auth + role check
   - Admin vs client permission
   - Wallet balance + due limit check
   - Transaction logging with account name/ID
   - `deduct_wallet` / `target_user_id` support

**No frontend changes needed** — the calling code in `AdminAdAccounts`, `ClientAdAccounts`, `ClientDashboard`, and `ClientDetailPage` already handles success/error correctly via `friendlyEdgeError`.

### Key Fix (the one line that matters)

```typescript
// BEFORE (wrong — sends dollars, Meta expects cents):
spend_cap: String(newSpendCapDollars)

// AFTER (correct — sends cents):  
spend_cap: String(Math.round(newSpendCapDollars * 100))
```

### Deployment
- Deploy updated edge function
- Test with a small top-up ($5) to verify correct behavior

