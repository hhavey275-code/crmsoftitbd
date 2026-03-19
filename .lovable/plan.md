

## Plan: Bank Delete Fix + Bank Stats + Telegram Image Forward

### 1. Fix Bank Delete

The delete button exists in the UI but likely fails due to foreign key constraints — `client_banks` and `top_up_requests` reference `bank_account_id`. Two options:
- **Soft delete**: Change status to `inactive` instead of hard delete (safer, preserves history)
- **Hard delete with cascade**: Delete related `client_banks` first, then the bank

Will implement **soft delete** — the delete button will set `status = 'inactive'` and hide inactive banks from the list. This preserves transaction history.

### 2. Per-Bank Total Stats (Received + Day-by-Day + Withdraw)

When admin selects a bank, show:
- **Total BDT received** (sum of approved top-up `bdt_amount` for that bank)
- **Day-by-day breakdown** table showing date, total received, number of transactions
- **Withdrawals** reduce the running total

This will query `top_up_requests` (approved, grouped by bank_account_id and date) and `transactions` (type = 'withdraw') to compute net totals. Add a new dialog/expandable section in AdminBanks that shows this data when a bank is clicked.

### 3. Forward Proof Image to Telegram Group on Top-Up Approval

When a top-up request is approved (manually or auto), forward the `proof_url` image to a Telegram group. This will be added to the `verify-topup` edge function (for auto-approvals) and the admin approval flow.

- Use the existing Telegram bot token from `site_settings`
- Call Telegram `sendPhoto` API with the proof image URL and caption (client name, amount, ref)
- Target group will be configurable via `site_settings` key `telegram_forward_group_id`

### Technical Steps

| # | Task | Files |
|---|------|-------|
| 1 | Change bank delete to soft-delete (set status = inactive), filter list to show only active | `AdminBanks.tsx` |
| 2 | Add bank detail dialog with total received stats and day-by-day breakdown | `AdminBanks.tsx` |
| 3 | Query approved top_up_requests grouped by bank_account_id + date for stats | `AdminBanks.tsx` |
| 4 | Add Telegram image forward logic to `verify-topup` (auto-approve flow) | `verify-topup/index.ts` |
| 5 | Add Telegram forward to manual admin approval flow | `AdminTopUp.tsx` + possibly new edge function |
| 6 | Add `telegram_forward_group_id` setting to admin settings | `SettingsPage.tsx` |

