

## Plan: Simplify `spend-cap-update` Edge Function

### Changes to `supabase/functions/spend-cap-update/index.ts`:

1. **API version v25.0 → v24.0** — both POST and GET URLs
2. **Remove all retry logic** — no loop, no `MAX_RETRIES`, no backoff. Single attempt only.
3. **Remove `isRateLimitError` helper** — no longer needed
4. **Keep Meta-first safety** — if Meta POST or verification fails, return error immediately without touching wallet or DB

### What stays the same:
- Auth, role checks, wallet balance pre-check
- POST sends cents, GET returns cents, DB stores dollars
- Wallet deduction + transaction only after verified Meta success
- Token decryption, all existing features

### Summary of the simplified flow:
1. Auth + permission checks
2. Single Meta POST call (v24.0, cents)
3. Single Meta GET verification (v24.0, cents→dollars comparison)
4. If either fails → return error, wallet untouched
5. If success → deduct wallet, record transaction, update DB

