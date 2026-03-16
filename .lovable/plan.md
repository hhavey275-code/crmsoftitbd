

## Problem Identified

The `telegram-poll` function is **timing out** when called from the browser. Here's why:

1. The function uses **long polling** with a 50-second timeout to Telegram API
2. The browser/edge function caller cancels the request before it completes
3. Result: only the first call worked (caught "Start" immediately), but subsequent calls with no pending messages hang for 50 seconds and get killed

**Proof**: Direct curl to the function returned `context canceled` (timeout). Logs show only one successful run at 06:38.

The "Start" message WAS captured successfully - so the bot token and Group Privacy settings are correct now.

## Plan

### 1. Fix `telegram-poll` Edge Function (timeout issue)

Change the function to accept a `quick` mode parameter. When called from the browser (manual fetch), use `timeout: 0` (instant response, no long polling). Keep long polling only for cron-based background runs.

**Key change in `supabase/functions/telegram-poll/index.ts`**:
- Parse request body for `{ quick: true }`
- If `quick` mode: single `getUpdates` call with `timeout: 0`, no while loop
- If normal mode: keep existing long-polling loop (for future cron setup)

### 2. Update Frontend Calls

Update both `AdminTopUp.tsx` and `ClientTopUp.tsx` to pass `{ quick: true }` in the function invocation body so manual fetches return instantly.

### 3. Result

After this fix:
- "Fetch Telegram" button will return in ~1-2 seconds instead of timing out
- All messages sent after the "Start" message will be fetched
- Bank SMS matching will work for the pending top-up request

