

## Plan: Ad Account Top-Up with Wallet Deduction + Spend Progress Bar

### Summary
1. Client top-up dialog shows wallet balance, prevents exceeding it
2. Client top-up deducts wallet first, then calls Meta API to increase spend cap
3. Admin top-up deducts assigned client's wallet (allows negative balance)
4. Spend progress bar on ad accounts table (green/yellow/red based on spend vs last top-up threshold)

---

### File Changes

| File | Change |
|------|--------|
| `src/components/client/ClientAdAccounts.tsx` | Show wallet balance in top-up dialog, cap max amount to wallet balance, deduct wallet + create transaction before calling API |
| `src/components/admin/AdminAdAccounts.tsx` | On top-up: find assigned client, deduct their wallet (allow negative), create transaction, then call Meta API |
| `supabase/functions/update-spend-cap/index.ts` | Add optional `user_id` + `deduct_wallet` params — function handles wallet deduction atomically alongside Meta API call |
| Both ad account components | Add a spend progress bar showing `amount_spent / spend_cap` ratio with color coding |

---

### Spend Progress Bar Logic

For each ad account row, show a horizontal bar:
- **Width** = `(amount_spent / spend_cap) * 100%`
- **Color thresholds** based on percentage of spend_cap used:
  - `≤ 20%` remaining (i.e. `≥ 80%` spent) → **Red**
  - `≤ 50%` remaining (i.e. `≥ 50%` spent) → **Yellow**  
  - `> 50%` remaining (i.e. `< 50%` spent) → **Green**
- If spend_cap is 0, show empty/gray bar

---

### Client Top-Up Flow Changes

In `ClientAdAccounts.tsx` top-up dialog:
1. Fetch client's wallet balance
2. Display "Wallet Balance: $X" in the dialog
3. Validate: amount cannot exceed wallet balance (disable button + show warning)
4. On submit: call updated edge function with `user_id` and `deduct_wallet: true`
5. Edge function deducts wallet, creates transaction, calls Meta API

### Admin Top-Up Flow Changes

In `AdminAdAccounts.tsx` top-up dialog:
1. Look up assigned client via `user_ad_accounts` for the selected account
2. Show client name + current wallet balance in dialog
3. If amount > wallet balance, show warning "Client balance will go negative by $X"
4. On submit: call edge function with assigned client's `user_id` and `deduct_wallet: true`
5. Edge function deducts wallet (allows negative), creates transaction, calls Meta API

### Edge Function Update (`update-spend-cap`)

Add logic after Meta API success:
- If `user_id` and `deduct_wallet` provided in request body:
  - Read current wallet balance
  - Deduct amount (new_balance = current - amount, can go negative)
  - Update wallet
  - Insert transaction record (type: "ad_topup", negative amount, description with account name)
- Remove admin-only restriction when client calls with their own user_id (verify `auth.uid() === user_id` OR caller is admin)

