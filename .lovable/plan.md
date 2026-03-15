

## Bulk Assign/Unassign Ad Accounts to Clients

### What We're Building
Two bulk assignment features:

1. **Admin Ad Accounts page** (`AdminAdAccounts.tsx`) — When selection mode is active and accounts are selected, add an "Assign Selected" button that opens a dialog to pick a client and bulk-assign all selected accounts, plus an "Unassign Selected" button to bulk-remove assignments.

2. **Client Detail page** (`ClientDetailPage.tsx`) — Add a section/dialog to bulk-assign unassigned ad accounts to this client (multi-select from all unassigned accounts), and checkboxes on the existing ad accounts table to bulk-unassign selected accounts.

### Changes

#### 1. Admin Ad Accounts Page (`src/components/admin/AdminAdAccounts.tsx`)
- Add two new buttons in the selection toolbar (next to existing "Delete Selected" and "Update Selected"):
  - **"Assign Selected"** — Opens a dialog with a client dropdown. On confirm, inserts `user_ad_accounts` rows for each selected account (deleting existing assignments first to avoid duplicates).
  - **"Unassign Selected"** — Opens a confirmation dialog, then deletes all `user_ad_accounts` rows for the selected account IDs.
- Add bulk assign mutation: delete existing assignments for selected IDs, then insert new ones with chosen `user_id`.
- Add bulk unassign mutation: delete `user_ad_accounts` where `ad_account_id` in selected IDs.
- Invalidate `admin-user-ad-accounts` query on success.

#### 2. Client Detail Page (`src/pages/ClientDetailPage.tsx`)
- Add a **"Assign Accounts"** button next to the "Ad Accounts" card header.
- Opens a dialog showing all unassigned ad accounts (fetched by comparing all accounts vs already-assigned ones) with checkboxes for multi-select.
- On confirm, bulk-insert `user_ad_accounts` rows for this client.
- Add checkboxes to existing ad accounts table rows for bulk unassign.
- Add an **"Unassign Selected"** button that appears when accounts are checked, removes `user_ad_accounts` rows for this client + selected account IDs.
- Invalidate relevant queries on success.

### Technical Notes
- All operations go through `user_ad_accounts` table which already has proper RLS for admin access.
- Use `(supabase as any).from("user_ad_accounts")` pattern consistent with existing code.
- No database migrations needed — the `user_ad_accounts` table already exists with the right schema.

