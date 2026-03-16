

## Plan: Telegram Polling Toggle + Retry-based Verification

### সমস্যা বোঝা

1. **pg_cron প্রতি মিনিটে চলছে** — এটা দরকার নেই। তুমি চাও একটা button দিয়ে manually on/off করবে
2. **SMS দেরিতে আসে** — payment req দেওয়ার পরে 5-7 মিনিট পরে bank SMS আসতে পারে, তাই verify-topup একবার চালিয়ে না পেলে retry করতে হবে
3. **Group এ শুধু bank SMS আসে** — random message নেই, তাই keyword filter দরকার নেই, last messages check করলেই হবে

### Bot Access

হ্যাঁ, Telegram bot connect হয়েছে (Crm softit)। Bot group এর message read করতে পারবে যদি bot কে group এ add করা থাকে এবং bot এর **group privacy mode** off করা থাকে (BotFather → `/setprivacy` → Disable)। তাহলে সব message পাবে।

---

### Changes

#### 1. Remove pg_cron — Add Manual Toggle Button
- **AdminTopUp.tsx** তে header এ একটা ছোট toggle button add করবো: "Auto-Poll: ON/OFF"
- ON করলে → `telegram-poll` function কে invoke করবে (একবার run করবে ~55 sec, তারপর আবার call করবে loop এ)
- OFF করলে → polling stop হবে
- State `site_settings` এ store করবে (`telegram_polling_active` key) — তবে polling আসলে browser থেকে invoke হবে, তাই browser tab বন্ধ করলে বন্ধ হয়ে যাবে
- **Alternative (simpler)**: Button press করলে একবার `telegram-poll` invoke করে latest messages fetch করবে। Admin চাইলে বারবার press করবে। এটা simpler এবং নির্ভরযোগ্য।

#### 2. Verify-topup with Retry Logic
- Client request submit করলে `verify-topup` call হয়
- verify-topup যদি telegram message match না পায়, তাহলে request কে `pending` রাখবে
- **Retry approach**: verify-topup function এ একটা retry loop — 3 বার try করবে, প্রতিবার 2 মিনিট gap দিয়ে (total ~6 min coverage)
- Edge function max runtime ~55 sec, তাই retry loop function এর ভেতরে হবে না। Instead:
  - Client submit → verify-topup call → match না পেলে `retry_count` track করে response দেবে
  - Client side থেকে setTimeout দিয়ে 2 min পর আবার verify-topup call করবে (max 3 retries)

#### 3. Simplify Telegram Message Search
- Time window বাড়াবো ±15 min → ±30 min (SMS delay cover করতে)
- Keyword filter দরকার নেই — group এ শুধু bank SMS আসে
- Last 50 messages check করবে time window এর মধ্যে

---

### Files to Modify

1. **`src/components/admin/AdminTopUp.tsx`**
   - Header এ "Fetch Telegram" button add করবো (ছোট button)
   - Click করলে `telegram-poll` edge function invoke করবে
   - Success/failure toast দেখাবে

2. **`src/components/client/ClientTopUp.tsx`**
   - Submit এর পর verify-topup call করবে (already done)
   - Match না পেলে 2 min পর retry করবে, max 3 বার
   - Client কে toast দেখাবে: "Verifying payment..." / "Auto-approved!" / "Pending manual review"

3. **`supabase/functions/verify-topup/index.ts`**
   - Time window ±15 min → ±30 min expand করবো
   - Response এ `retry_suggested: true` পাঠাবে যদি match না হয় কিন্তু request এখনো pending

4. **Database**: pg_cron job remove করবো (if it was created)

