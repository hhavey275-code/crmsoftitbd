

## Plan: Client Dashboard Redesign + Per-Client USD Rate

### 1. Database Change
Add `usd_rate` column to `profiles` table (nullable numeric, default null). When null, fall back to global `site_settings` rate.

```sql
ALTER TABLE public.profiles ADD COLUMN usd_rate numeric DEFAULT NULL;
```

### 2. Client Dashboard (`ClientDashboard.tsx`) — Redesign metric boxes

**Remove**: Recent Transactions table, Transactions metric card, Pending Top-Ups card

**New metric cards (7 boxes)**:
| Card | Value |
|------|-------|
| Wallet Balance | `wallet.balance` |
| Total Ad Accounts | `adAccounts.length` |
| Active Ad Accounts | filtered by `status === 'active'` |
| Disabled Ad Accounts | filtered by `status !== 'active'` |
| Total Top-Up | Sum of approved `top_up_requests.amount` with date range picker (date-to-date, month-to-month) |
| Total Remaining Balance | Sum of `(spend_cap - amount_spent)` across all ad accounts |
| Total Spending | Sum of `amount_spent` across all ad accounts |

Add a date range picker (two date inputs) above or beside the "Total Top-Up" card to filter by period.

### 3. Client Detail Page (`ClientDetailPage.tsx`) — Add per-client USD rate section

**Remove**: Recent Transactions card (bottom)

**Add**: Editable "USD Rate" section in Client Information area. Admin can set a custom rate per client. Shows current rate with an inline edit input + Save button. If empty, shows "Using global rate (৳X)".

**Update metric cards**: Same 7 boxes as client dashboard but showing that specific client's data. Remove old Transactions and Pending Top-Ups cards, replace with the new ones.

### 4. Client Top-Up (`ClientTopUp.tsx`) — Use per-client rate

Change the USD rate query to first check `profile.usd_rate`. If set, use it. Otherwise fall back to global `site_settings.usd_rate`.

### Files
| File | Change |
|------|--------|
| Migration SQL | Add `usd_rate` column to profiles |
| `ClientDashboard.tsx` | Redesign with 7 metric boxes + date range top-up filter, remove transactions table |
| `ClientDetailPage.tsx` | Add editable USD rate section, update metrics to match new layout, remove transactions card |
| `ClientTopUp.tsx` | Use per-client rate with global fallback |

