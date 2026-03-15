

## Plan: Top Up Button Fix, Blue Styling, and Bulk Delete for Ad Accounts

### 1. Fix Top Up button overflow — make it a compact blue icon button

**Both `AdminAdAccounts.tsx` and `ClientAdAccounts.tsx`:**
- Change the Top Up button from `variant="outline"` with text to a compact blue icon-only button
- Use `variant="default"` (blue) with `size="icon"` and just the `ArrowUpCircle` icon — no text
- This removes horizontal overflow since the button becomes a small 32×32 icon instead of a wide text button
- Remove the separate "Billing" (ExternalLink) column — merge the billing link icon into the Ad Account name cell (small icon next to the account ID) to further reduce table width

### 2. Bulk Delete selected accounts (Admin only)

**`AdminAdAccounts.tsx`:**
- When `showSelect` is active and accounts are selected, show a red "Delete Selected" button alongside the existing "Update Selected" button
- Clicking opens a confirmation `AlertDialog` listing the count of selected accounts
- On confirm, delete from `ad_accounts` table using `.in('id', selectedIds)` — cascading deletes will auto-clean `user_ad_accounts` and `ad_account_insights`
- After success, invalidate queries, clear selection, show success toast

**No database migration needed** — `ad_accounts` already has `ON DELETE CASCADE` on its child tables (`user_ad_accounts`, `ad_account_insights`). The existing admin RLS policy should allow deletes.

### 3. Files to modify

- `src/components/admin/AdminAdAccounts.tsx` — blue icon Top Up button, merge billing link, add delete mutation + confirmation dialog
- `src/components/client/ClientAdAccounts.tsx` — blue icon Top Up button, merge billing link

