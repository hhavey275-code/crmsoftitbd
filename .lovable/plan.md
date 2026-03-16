

## Problem Analysis

I found **two critical issues** preventing auto-approval:

### Issue 1: Time Window Too Narrow
The pending top-up request was submitted at **05:54**, so the ±30 min Telegram search window is **05:24 → 06:24**. But the City Bank SMS was only fetched into the database at **06:49** — 25 minutes outside the window. The SMS itself says "Received At: 12:40 pm" (local time), but the `created_at` in the database reflects when it was *fetched*, not when the bank sent it.

### Issue 2: No Re-trigger After Fetch
The verify-topup retries (3 attempts × 2 min intervals) all finished by ~06:00. When the Telegram message was finally fetched at 06:49, nothing re-triggered verification. The pending request just sits there.

### Issue 3: OCR Step May Block Unnecessarily  
The OCR step requires an exact reference match. If the bank SMS screenshot doesn't contain the exact reference "TXN-26031683014", it blocks before even reaching Telegram matching. For human-forwarded bank SMS, this is an extra unnecessary gate.

---

## Plan

### 1. Fix Time Window — Use Current Time Instead of Request Time
Change the Telegram search window from `request.created_at ± 30min` to search from `request.created_at - 30min` up to **now** (current time). This way, even if Telegram messages arrive late, they'll still be found.

### 2. Add Auto-Verify on Telegram Fetch
After the `telegram-poll` function successfully fetches new messages, automatically scan all `pending` top-up requests and re-run verification against the newly fetched messages. This eliminates the "missed window" problem entirely.

**In `telegram-poll/index.ts`**: After saving messages, call `verify-topup` for each pending request.

### 3. Add Manual "Re-verify" Button (Admin)  
Add a button on pending top-up requests in the Admin panel so admin can manually trigger re-verification after fetching Telegram messages.

### 4. Make OCR Optional for Telegram-Only Match
If OCR fails or there's no proof screenshot, still attempt the Telegram bank SMS match (amount + last 4 digits). OCR adds confidence but shouldn't be a hard gate when Telegram confirmation alone is sufficient.

---

## Files to Change

| File | Change |
|------|--------|
| `supabase/functions/verify-topup/index.ts` | Fix time window to use `now()` as end; make OCR optional (proceed to Telegram match even if OCR fails); add logging |
| `supabase/functions/telegram-poll/index.ts` | After fetching messages, auto-verify all pending top-up requests |
| `src/components/admin/AdminTopUp.tsx` | Add "Re-verify" button on pending requests |

