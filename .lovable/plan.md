

## Withdraw Feature — Admin Ad Accounts

### সমস্যা
Ad account এর spend cap কমিয়ে remaining balance wallet এ ফেরত আনার কোনো option নেই।

### সমাধান
Admin Ad Accounts page এ Withdraw feature add করা। Actions column এ existing Top Up button কে একটা DropdownMenu তে রাখা (3-dot/more icon) যাতে row বড় না হয় এবং horizontal scroll না লাগে।

### পরিবর্তন

**1. Edge Function: `supabase/functions/spend-cap-withdraw/index.ts`**
- Auth + admin role check
- Ad account fetch (with BM token)
- Meta GET দিয়ে real-time `amount_spent` fetch করবে (cents → dollars convert)
- Validate: `withdraw_amount ≤ (spend_cap - amount_spent)`
- Meta POST: নতুন `spend_cap = current - withdraw_amount`
- Meta GET verify
- Success → wallet balance += withdraw_amount, transaction insert (type: "withdraw"), system log
- Fail → error return (wallet untouched since we reduce cap first)

**2. Config: `supabase/config.toml`**
- `[functions.spend-cap-withdraw]` entry add

**3. UI: `AdminAdAccounts.tsx`**
- Desktop table: Actions column এ single Top Up icon button replace করে **DropdownMenu** (MoreHorizontal icon) — items: "Top Up" ও "Withdraw"
- Mobile cards: Top Up button এর পাশে DropdownMenu অথবা দুটো ছোট button
- নতুন state: `withdrawAccount`, `withdrawAmount`, `maxWithdrawable`
- **Withdraw Dialog**: 
  - Shows current spend cap, real-time amount spent (Meta থেকে fetch), max withdrawable
  - Amount input (max capped)
  - Assigned client info + wallet balance
  - "Withdraw" button → calls edge function
- System log: "Withdraw" action

**4. SystemLogsPage.tsx**
- "Withdraw" action color add

### Row Width সমাধান
Actions column এ আগে 1টা icon button ছিল (Top Up)। এখন DropdownMenu (1টা MoreHorizontal icon) দিয়ে দুটো option (Top Up + Withdraw) দেখাবে — column width একই থাকবে, row বড় হবে না।

### Flow
```text
Admin clicks ⋯ → "Withdraw" → Dialog opens
→ Meta থেকে real-time amount_spent fetch হয়
→ Max withdrawable দেখায় (spend_cap - amount_spent)
→ Admin amount দেয় → Submit
→ Edge function: Meta POST (lower cap) → verify → wallet credit → transaction → log
```

