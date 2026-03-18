

## Analysis

**Telegram-poll এর সাথে Meta API এর কোনো connection নেই।** Telegram-poll শুধু:
1. Telegram `getUpdates` API call করে (bank SMS messages আনতে)
2. `verify-topup` function call করে (OCR + Telegram message matching)

Meta API আলাদা functions এ আছে (`get-account-insights`, `spend-cap-update`, `scheduled-sync`)।

### বর্তমান সমস্যা
- Cron প্রতি মিনিটে 55s long-polling চালায় — pending top-up না থাকলেও
- Client top-up submit করলে `verifyWithRetry` 5 min interval এ 5 বার retry করে — কিন্তু SMS আসতে সময় লাগে, আর cron ইতিমধ্যে message এনে রাখে

### আপনার Plan
- Payment request আসলে আগের **30 min এর message ready** রাখবে (already DB তে আছে)
- নতুন message আসার জন্য **5-10 min cron** চালাবে (প্রতি মিনিটে না)
- নতুন message ঢুকলে সাথে সাথে verify করে approve করে দিবে

## Plan

### 1. Cron interval পরিবর্তন: 1 min → 5 min
- pg_cron job update করে `*/5 * * * *` (প্রতি 5 মিনিটে)
- Long-polling timeout 55s → 280s (4 min 40s) — 5 min interval এ fit করবে, `MAX_RUNTIME_MS = 280000`

### 2. telegram-poll: নতুন message আসলে সাথে সাথে auto-verify
- বর্তমানে `autoVerifyPending()` শুধু loop শেষে চলে
- পরিবর্তন: **প্রতি batch process এর পরেই** `autoVerifyPending()` call করবে
- এতে 5 min এর মধ্যে message আসলে instantly verify হবে, loop শেষ হওয়ার জন্য wait করতে হবে না

### 3. Client submit flow optimize
- Client top-up submit করলে `fetchTelegramFirst()` (quick mode) চালিয়ে আগের 30 min এর unmatched messages ready থাকবে
- `verifyWithRetry` retry interval 5 min → **3 min**, max retries 5 → **4** (total ~12 min coverage)
- এতে 5 min cron cycle + 3 min retry = বেশিরভাগ SMS ধরা পড়বে

### Changes Summary

| File | Change |
|------|--------|
| `