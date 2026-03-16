## পরিবর্তনের সারসংক্ষেপ

আপনার ৪টি প্রধান চাহিদা:

1. **সময়ের উইন্ডো পরিবর্তন**: Request এর আগে 30 মিনিট এবং পরে 10 মিনিট পর্যন্ত Telegram message দেখবে (বর্তমানে: আগে 30 মিনিট থেকে এখন পর্যন্ত)
2. **Matching ক্রম ঠিক করা**: প্রথমে OCR ref → submitted ref, তারপর OCR BDT amount → submitted BDT amount, তারপর BDT amount + last 4 digit → Telegram SMS match
3. **Bank charge tolerance**: BDT amount match এ ~10 টাকা tolerance রাখা (bank transfer charge)
4. **Verification log**: কী কী match হয়েছে সেটার log payment এর পাশে দেখানো

---

## Technical Plan

### 1. `verify-topup` Edge Function আপডেট

**Time window পরিবর্তন:**

- `windowStart` = `request.created_at - 30 min` (আগের মতোই)
- `windowEnd` = `request.created_at + 10 min` (বর্তমানে `new Date()` — এটা পরিবর্তন হবে)

**Matching logic নতুন ক্রম:**

1. **Step 1 — OCR ref match**: Screenshot থেকে extracted ref === submitted `payment_reference`
2. **Step 2 — OCR amount match**: Screenshot থেকে extracted BDT amount ≈ submitted `bdt_amount` (±10 BDT tolerance)
3. **Step 3 — Telegram SMS match**: Telegram message এ `last 4 digit` + `BDT amount` (±10 BDT tolerance) খুঁজবে
4. তিনটা step pass করলেই auto-approve
5. bangladeshi timzone hisebe match korbe ,karon sms bangladeshi timezone e ase 

**Bank charge tolerance fix:**

- Amount match এ fixed ±15 BDT tolerance ব্যবহার করবে (percentage এর বদলে) — এতে 10 টাকা charge cover হবে
- OCR amount match এও একই ±15 BDT tolerance

**Verification log সংরক্ষণ:**

- `top_up_requests` table এ `admin_note` field এ detailed log লিখবে, যেমন:
  ```
  Auto-approved: ✅ OCR Ref matched (ABC123), ✅ OCR Amount matched (13000 vs 13010 BDT), ✅ Telegram SMS matched (last4: 1001, amount: 13000)
  ```

### 2. `top_up_requests.admin_note` — UI তে দেখানো

AdminTopUp component এ যেখানে status দেখায়, সেখানে `admin_note` ও দেখাবে — approved request এর পাশে কী কী match হয়েছে সেটা readable format এ।

### 3. কোন Database পরিবর্তন নেই

`admin_note` column আগে থেকেই আছে — নতুন কোনো table/column লাগবে না।

---

## ফাইল পরিবর্তন


| ফাইল                                       | কাজ                                                  |
| ------------------------------------------ | ---------------------------------------------------- |
| `supabase/functions/verify-topup/index.ts` | Time window, matching order, tolerance, detailed log |
| `src/components/admin/AdminTopUp.tsx`      | admin_note দেখানো UI তে                              |
