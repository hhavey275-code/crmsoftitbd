
Goal: ad account top-up আবার stable করা — $10 দিলে $10-ই যোগ হবে, $10,000 হবে না; আর top-up fail হলে wallet থেকে টাকা কাটবে না।

What I found (root cause)
1) Backend `spend-cap-update` এখন Meta POST fail হলেও “success” ধরে নিচ্ছে।
- Logs এ দেখা গেছে:
  - `Meta spend cap POST failed ... code: 17 (User request limit reached)`
  - তারপরও `Verification: Meta cap IS 1500000 (>= 310). Treating as success.`
- মানে request fail হলেও wallet deduction + transaction insert + local cap update হচ্ছে।

2) `spend_cap` unit handling inconsistent (কিছু জায়গায় cents, কিছু জায়গায় dollars হিসেবে ধরা হচ্ছে)।
- এই mismatch থেকেই 100x/odd cap jump হচ্ছে।
- Sync functions আর top-up verification একই unit follow করছে না।

3) এই কারণে “hotath ulta palta” হয়েছে:
- সাম্প্রতিক logic change + permissive fallback verification (>= check) + Meta rate-limit error (code 17) একসাথে hit করেছে।

Implementation plan
Phase 1 — Immediate hard fix (top-up safety first)
- File: `supabase/functions/spend-cap-update/index.ts`
1. Single unit standard enforce করব (internal USD, Meta API payload/response normalized with explicit helper conversion)।
2. “POST failed কিন্তু cap বড় আছে তাই success” logic সম্পূর্ণ remove করব।
3. Verification rule strict করব:
   - expected cap (normalized) == verified cap (small tolerance only for rounding) হলে তবেই success।
4. POST বা verification fail হলে:
   - wallet deduction হবে না
   - transaction insert হবে না
   - clear error code/message return হবে (বিশেষ করে rate-limit code 17/32/4)।
5. Meta rate-limit এ user-friendly failure return করব (retry guidance সহ)।

Phase 2 — Sync consistency fix (100x drift বন্ধ)
- Files:
  - `supabase/functions/scheduled-sync/index.ts`
  - `supabase/functions/sync-bm-accounts/index.ts`
  - `supabase/functions/get-account-insights/index.ts`
1. তিনটা function-এ `spend_cap` parse/update একই helper দিয়ে normalize করব।
2. `amount_spent` এবং `spend_cap` conversion policy unify করব (no mixed assumptions)।
3. Sync overwrite behavior safe রাখব (0 cap overwrite guard বজায় রেখে)।

Phase 3 — Data repair (already impacted data ঠিক করা)
1. Targeted correction:
- Garden Glow 02/03 এর cap intended value এ set করা।
2. Wallet recovery:
- confirmed failed-but-charged attempts (recent code-17 window) reverse credit করা।
- reversal transaction আলাদা type/note দিয়ে audit-safe রাখা।
3. Quick reconciliation query চালিয়ে suspicious recent top-up attempts list বের করব (failed external update but charged locally pattern) এবং manual review list তৈরি করব।

Phase 4 — UI/UX error clarity
- Files:
  - `src/components/admin/AdminAdAccounts.tsx`
  - `src/components/client/ClientAdAccounts.tsx`
  - `src/components/client/ClientDashboard.tsx`
  - `src/pages/ClientDetailPage.tsx`
  - `src/lib/utils.ts`
1. Edge function error payload থেকে meaningful message দেখাব।
2. বিশেষভাবে rate-limit case এ:
- “Top-up হয়নি, wallet কাটেনি, কিছুক্ষণ পরে retry করুন” message দেখানো হবে।

Technical details (implementation specifics)
- Add explicit converters:
  - `toMetaMinorUnits(usd: number): number`
  - `fromMetaMinorUnits(raw: number): number`
- `spend-cap-update` success gate:
  - Meta POST ok + verify expected normalized cap match
  - then wallet update + transaction insert + local DB update
- Remove permissive check:
  - `actualCap >= newSpendCap` (এই condition আর থাকবে না)
- Keep atomic sequence to prevent phantom deductions.

Validation plan (must pass before close)
1. Admin থেকে $10 top-up → local cap +10, wallet -10, transaction 1টা।
2. Client থেকে $10 top-up → same expected behavior।
3. Forced Meta failure/rate-limit scenario → cap unchanged, wallet unchanged, no ad_topup transaction।
4. Update-from-Meta + Sync-all run করার পরেও cap 100x jump না হওয়া।
5. End-to-end manual verify (admin + client + mobile view)।

Expected outcome
- 100x inflation বন্ধ।
- top-up fail হলে টাকা কাটা বন্ধ।
- error message clear হবে।
- historical damaged rows/wallets controlledভাবে recover করা যাবে।
