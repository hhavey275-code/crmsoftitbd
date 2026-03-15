

## Plan: Redesign Admin Dashboard with Colorful Metrics, Donut Chart & Top Spenders

### Overview
Complete UI overhaul of `AdminDashboard.tsx` with colorful metric boxes, a donut chart for high-spending clients, and a real-time top 3 spenders list.

### Changes

**1. Update `MetricCard` component** — Add support for custom background/icon colors so each card can have a distinct color scheme (blue, green, orange, red, purple, teal).

**2. Rewrite `AdminDashboard.tsx`** with:

- **6 colorful metric boxes** in a 3×2 grid:
  - Total Clients (blue) — from `profiles` count
  - Platform Balance (green) — sum of `wallets.balance`
  - Pending Top-Ups (orange) — `top_up_requests` where status=pending
  - Active Ad Accounts (emerald) — `ad_accounts` where status=active
  - Disabled Ad Accounts (red) — `ad_accounts` where status!=active
  - Remaining Limit (purple) — sum of `(spend_cap - amount_spent)` across all ad accounts

- **Donut/pie chart** using Recharts (already installed) showing top spending clients by `amount_spent` across their ad accounts. Colorful segments with labels.

- **Top 3 High Spenders list** — A card showing the 3 clients with highest total `amount_spent`, with rank badges, client name, and spend amount. Uses realtime subscription on `ad_accounts` for live updates.

- Fix existing broken queries (currently querying non-existent `topups` and `wallet_transactions` tables — should be `top_up_requests` and `transactions`)

### Files Modified

| File | Change |
|------|--------|
| `src/components/MetricCard.tsx` | Add `colorScheme` prop for bg/icon color variants |
| `src/components/admin/AdminDashboard.tsx` | Full rewrite: 6 colored metrics, donut chart, top 3 spenders with realtime |

### Color Scheme for Metric Cards
- Total Clients: `bg-blue-50 text-blue-600`
- Platform Balance: `bg-green-50 text-green-600`
- Pending Top-Ups: `bg-orange-50 text-orange-600`
- Active Accounts: `bg-emerald-50 text-emerald-600`
- Disabled Accounts: `bg-red-50 text-red-600`
- Remaining Limit: `bg-purple-50 text-purple-600`

