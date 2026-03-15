

## Plan: Add Per-Account Top Up Button in Ad Accounts Table

### What
Add a blue "Top Up" button next to each ad account row in the Ad Accounts table on the admin Client Detail page. Clicking it opens the existing top-up dialog with that account pre-selected.

### Changes — `ClientDetailPage.tsx` only

**Ad Accounts table (lines 497-521)**:
- Add a 5th column header: "Action"
- Add a `TableCell` per row with a small blue "Top Up" button
- On click: set `selectedAccountId` to that account's `id`, open `topUpDialogOpen`

This reuses the existing top-up dialog and mutation — no new logic needed. Admin can exceed wallet balance since the edge function already allows admins to go negative.

