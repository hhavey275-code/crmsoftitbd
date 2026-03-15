

## Plan: Billings Page — Pagination, Auto-delete Sync, Premium Billing Button

### 1. Add pagination (20 per page)
- Add `page` state, compute `totalPages` from `sorted.length / 20`
- Slice `sorted` to show only current page items
- Add pagination controls at bottom (Previous / page numbers / Next) matching the pattern already used in AdminAdAccounts

### 2. Auto-delete from billings when ad accounts are deleted
- The billings page queries `ad_accounts` table directly — when accounts are deleted from AdminAdAccounts, they're already removed from the `ad_accounts` table, so billings will automatically not show them on next query
- The `ad_account_insights` table should also cascade — need to verify. Looking at the schema, `ad_account_insights.ad_account_id` has no foreign key constraint, so deleted accounts' insights will remain as orphans but won't match any `ad_accounts` row, so they simply won't appear
- To keep it clean: after admin deletes accounts, invalidate `billings-accounts` query key too. This requires adding the invalidation in AdminAdAccounts delete mutation. Will add `queryClient.invalidateQueries({ queryKey: ["billings-accounts"] })` and also delete orphaned insights rows

### 3. Premium billing button
- Replace the plain blue button with a gradient-styled button featuring an `ExternalLink` icon
- Use a blue gradient (`bg-gradient-to-r from-blue-600 to-indigo-600`) with hover effect, rounded-full shape, and subtle shadow for a premium look

### Files to modify
- `src/pages/BillingsPage.tsx` — pagination + premium button
- `src/components/admin/AdminAdAccounts.tsx` — add billings query invalidation on delete

