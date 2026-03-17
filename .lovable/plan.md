

## Plan: Meta API Rate Limit Error Detection & Popup Notification

### Problem
When Meta API returns rate limit errors (HTTP 429 or error code 17/32), accounts silently fail and return empty insights. The admin has no idea which accounts were skipped.

### Solution

#### 1. Edge Function: Detect rate limit errors and return failure info
**File: `supabase/functions/get-account-insights/index.ts`**

- In the `catch` block (line 247) and after API responses, check for Meta rate limit errors:
  - HTTP 429 status
  - Meta error codes 17 (user request limit), 32 (app request limit), 4 (too many calls)
- Track failed account IDs and error reasons in a `rateLimitedAccounts` array
- Return `{ insights, rate_limited: [...] }` in the response so the frontend knows which accounts failed

#### 2. Frontend: Show popup/toast when rate-limited accounts exist
**Files: `src/components/admin/AdminAdAccounts.tsx`, `src/components/client/ClientAdAccounts.tsx`**

- In `refreshAllMutation.onSuccess` and `refreshSelectedMutation.onSuccess`, check if `data.rate_limited` has entries
- If yes, show a warning toast/dialog listing:
  - How many accounts were rate-limited
  - Suggestion to retry after a few minutes
- If all accounts failed, show an error toast instead of success

### Technical Details

**Edge function changes:**
- After each Meta API `fetch()`, check `response.status === 429` or parse error body for `code: 17/32/4`
- Collect failed accounts: `{ account_id, account_name, error_code }`
- Still return successful insights for accounts that worked

**Frontend toast example:**
```
⚠️ 45/400 accounts could not be updated due to Meta API rate limits. 
Please retry after a few minutes.
```

