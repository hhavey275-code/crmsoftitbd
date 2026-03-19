

## Plan: Bank Reactivation + Withdraw in Stats + Per-Bank Telegram Forward

### 1. Reactivate Deactivated Banks

Currently the bank list only shows `status = 'active'` banks, with no way to view or reactivate inactive ones.

**Changes in `AdminBanks.tsx`:**
- Add a toggle/tab to switch between "Active" and "Inactive" banks
- Show inactive banks with a "Reactivate" button that sets `status = 'active'`
- The deactivate (trash) button stays on active banks

### 2. Withdraw Option in Bank Stats

The current `BankStatsDialog` only shows approved top-up totals. There's no withdraw tracking per bank because the `transactions` table doesn't have a `bank_account_id` column — withdrawals aren't linked to specific banks.

**Two approaches:**
- **Option A**: Add a "Record Withdraw" button in the bank stats dialog that creates a transaction of type `withdraw` linked to the bank. This requires adding a `bank_account_id` column to the `transactions` table.
- **Option B**: Add a manual "withdraw" entry system directly on the bank stats, storing withdraw records in a new simple table or using a convention in existing tables.

Will go with **Option A** — add `bank_account_id` column to `transactions` table, add a "Record Withdraw" button in bank stats, and subtract withdrawals from the net total.

**Database migration:**
```sql
ALTER TABLE public.transactions ADD COLUMN bank_account_id uuid;
```

**Changes in `AdminBanks.tsx` (BankStatsDialog):**
- Query withdrawals from `transactions` where `bank_account_id = bankId` and `type = 'withdraw'`
- Show net balance (total received - total withdrawn)
- Add "Record Withdraw" button with amount input
- Include withdrawals in day-by-day breakdown

### 3. Per-Bank Telegram Forward (Different Groups per Bank)

Instead of one global `telegram_forward_group_id`, each bank account will have its own Telegram group ID. When a top-up is approved (manual or auto), the proof image forwards to the Telegram group configured for that specific bank.

**Database migration:**
```sql
ALTER TABLE public.bank_accounts ADD COLUMN telegram_group_id text;
```

**Changes in `AdminBanks.tsx`:**
- Add "Telegram Group ID" field in the Add/Edit bank dialogs

**Changes in `verify-topup/index.ts` (auto-approve):**
- Instead of reading `telegram_forward_group_id` from `site_settings`, read `telegram_group_id` from the bank account used in the top-up request

**Changes in `AdminTopUp.tsx` (manual approve):**
- Same: read `telegram_group_id` from the request's bank account instead of global setting

**Note:** The global `telegram_forward_group_id` setting can be kept as a fallback if a bank doesn't have its own group configured.

### Technical Steps

| # | Task | Files |
|---|------|-------|
| 1 | Add `bank_account_id` to `transactions` and `telegram_group_id` to `bank_accounts` | DB migration |
| 2 | Add Active/Inactive toggle + Reactivate button | `AdminBanks.tsx` |
| 3 | Add withdraw tracking + Record Withdraw in bank stats | `AdminBanks.tsx` |
| 4 | Add Telegram Group ID field to bank Add/Edit forms | `AdminBanks.tsx` |
| 5 | Update auto-approve to use per-bank Telegram group | `verify-topup/index.ts` |
| 6 | Update manual approve to use per-bank Telegram group | `AdminTopUp.tsx` |

