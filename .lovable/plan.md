

## Plan: Add Bank Assignment to Admin Sellers Page

### Current State
- Banks can be assigned to sellers via the **Banks page** (AdminBanks) — each bank has a "Assign to Seller" dropdown in its Add/Edit form
- The **Sellers page** (AdminSellers) shows assigned banks as read-only tags but has no way to assign/unassign banks directly

### What to Add
Add an **"Assign Bank"** button in the seller detail section (next to Record USDT / Record BDT buttons) that opens a dialog to:
1. Show a dropdown of all **unassigned active banks** (where `seller_id` is null)
2. Let admin select a bank and assign it to the current seller (updates `bank_accounts.seller_id`)
3. Add an **unassign (✕)** button on each assigned bank tag to remove the assignment

### Changes

| # | Task | File |
|---|------|------|
| 1 | Add "Assign Bank" button + dialog with unassigned bank dropdown | `AdminSellers.tsx` |
| 2 | Add unassign (✕) button on each bank tag | `AdminSellers.tsx` |
| 3 | Fetch unassigned banks query | `AdminSellers.tsx` |
| 4 | Mutations for assign (`update seller_id`) and unassign (`set seller_id = null`) | `AdminSellers.tsx` |

All changes are in a single file. No database changes needed — `bank_accounts.seller_id` column already exists.

