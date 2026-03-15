

## Plan: Admin Top-Up Button, Wallet +/- Controls, Due Limit, Editable Fields, Transaction History

### Summary
Add admin top-up capability from client detail page, wallet balance add/deduct with history, due limit per client, editable business name & phone, and detailed transaction history visible to both admin and client.

---

### 1. Database Migration

```sql
-- Add due_limit column to profiles (nullable, default null = no due allowed)
ALTER TABLE public.profiles ADD COLUMN due_limit numeric DEFAULT NULL;
```

Update `transactions` table description field usage — no schema change needed, but we'll store richer descriptions.

### 2. `ClientDetailPage.tsx` — Major updates

**A. Blue "Top Up" button** at the top of the page. Opens a dialog where admin selects an ad account from the client's list, enters USD amount, and submits. This calls `update-spend-cap` edge function with `target_user_id` set to the client. Wallet deduction happens, negative balance allowed for admin.

**B. Wallet Balance +/- controls**: Next to the Wallet Balance metric card, add `+` and `−` buttons. Each opens a dialog with amount input + note field. On submit:
- Updates wallet balance directly
- Creates a `transactions` record with type `admin_credit` or `admin_debit`, storing `balance_after`, and description

**C. Business Name & Phone editable**: Make these two info boxes inline-editable (click to edit, save button) similar to the existing USD Rate field.

**D. Due Limit field**: Add a 6th box in the client info grid for "Due Limit" — inline editable by admin. Stored in `profiles.due_limit`. Shows "No due limit" when null.

**E. Transaction History table**: Add a card at the bottom showing all `transactions` for this client, with columns: Date, Type, Description, Amount, Balance After. Ordered by newest first.

### 3. `update-spend-cap/index.ts` — Due limit support

Currently clients are blocked if `wallet.balance < amount`. Update logic:
- Fetch client's `due_limit` from profiles
- If `due_limit` is set, allow top-up if `wallet.balance + due_limit >= amount` (i.e., balance can go negative up to `-due_limit`)
- If `due_limit` is null/0, keep existing behavior (balance must cover full amount)

### 4. `ClientAdAccounts.tsx` — Update wallet validation

Update the client-side top-up dialog to also consider `due_limit`:
- Fetch `due_limit` from profile
- `exceedsBalance` check becomes: `parsedAmount > walletBalance + (dueLimit ?? 0)`
- Show warning text like "Using $X from due limit" when going negative

### 5. `ClientDashboard.tsx` — Add Transaction History

Add a transaction history table at the bottom of the client dashboard showing their `transactions` records with columns: Date, Type, Description (includes account name), Amount, Balance After.

### 6. Transaction records — Richer descriptions

When admin or client tops up an ad account via `update-spend-cap`, the transaction description will include:
- Account name: `"Ad account top-up: $500 → {account_name}"`
- The `balance_after` is already recorded

When admin adds/deducts balance manually, description includes admin note.

### 7. `AdminTransactions.tsx` & `ClientTransactions.tsx` — Fix

Both currently query `wallet_transactions` table which doesn't exist. Update to query `transactions` table instead, with proper columns: Date, Type, Client (admin only), Description, Amount, Balance After.

---

### Files to modify

| File | Change |
|------|--------|
| Migration SQL | Add `due_limit` to profiles |
| `ClientDetailPage.tsx` | Add top-up button, wallet +/-, editable business name & phone, due limit field, transaction history |
| `update-spend-cap/index.ts` | Check due_limit for clients, richer transaction description with account name |
| `ClientAdAccounts.tsx` | Update wallet validation to consider due_limit |
| `ClientDashboard.tsx` | Add transaction history table |
| `AdminTransactions.tsx` | Fix to use `transactions` table, add proper columns |
| `ClientTransactions.tsx` | Fix to use `transactions` table, add proper columns |

