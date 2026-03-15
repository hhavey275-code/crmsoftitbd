

## Plan: Separate Columns, Billing Balance, Assigned Cards, Sortable Headers

### Requirements Understood
1. **Today Spend** and **Yesterday Spend** in separate columns (not combined)
2. **Balance** = ad account billing balance (money deposited for paying bills), NOT remaining spend cap. Fetch via Meta API `balance` field
3. **Spend Cap / Spent** progress bar should be more compact (smaller)
4. **Assigned Cards** — fetch payment methods/cards linked to each ad account from Meta API
5. **Sortable columns** — click column header with arrow icon to sort ascending/descending

### Changes

**1. `supabase/functions/get-account-insights/index.ts`** — Expand Meta API calls

Add to the existing parallel fetch:
- Fetch ad account `balance` field: `GET /{act_id}?fields=balance&access_token=...`
- Fetch funding sources/cards: `GET /{act_id}/adspixels` won't work — use `GET /{act_id}?fields=funding_source_details` to get payment card info (card type, last 4 digits, etc.)

Return new fields per account: `{ today_spend, yesterday_spend, balance, cards: [{type, display_string}] }`

**2. `src/components/SpendProgressBar.tsx`** — Make more compact

Reduce text sizes and bar height. Use `text-[10px]` instead of `text-xs`, bar height `h-1.5` instead of `h-2`, reduce min-width.

**3. `src/components/admin/AdminAdAccounts.tsx`** — Update table

New column layout:
- Account (with sort arrow on name)
- Status
- Spend Cap / Spent (compact)
- Today Spend (separate column)
- Yesterday Spend (separate column)
- Balance (billing balance from API)
- Cards (payment methods)
- Assigned To
- Actions

Add sort state: `sortField` + `sortDirection`. Clicking a header toggles asc/desc. Sort accounts array before rendering. Add `ArrowUp`/`ArrowDown` icons next to sortable column headers.

**4. `src/components/client/ClientAdAccounts.tsx`** — Same column/sort changes as admin (minus Assigned To)

### Sortable Implementation

```tsx
const [sortField, setSortField] = useState<string>("account_name");
const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

const toggleSort = (field: string) => {
  if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
  else { setSortField(field); setSortDir("asc"); }
};

const sorted = [...(accounts ?? [])].sort((a, b) => { /* compare by sortField */ });
```

Column headers get a clickable div with `ArrowUpDown` / `ArrowUp` / `ArrowDown` icon from lucide.

### Meta API for Cards

The `funding_source_details` field on an ad account returns:
```json
{ "id": "...", "display_string": "Visa *1234", "type": 1 }
```

We'll fetch `?fields=funding_source_details` alongside the other calls in the edge function and return a simplified `cards` array.

### Files

| File | Action |
|------|--------|
| `supabase/functions/get-account-insights/index.ts` | Add balance + funding_source_details fetch |
| `src/components/SpendProgressBar.tsx` | Make more compact |
| `src/components/admin/AdminAdAccounts.tsx` | Separate columns, sort, cards display |
| `src/components/client/ClientAdAccounts.tsx` | Same changes as admin |

