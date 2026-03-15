

## Plan: Client Dashboard 4-Box + Admin Client Detail 7-Box + Total Spending Calendar

### Changes

**1. `ClientDashboard.tsx` — Reduce to 4 metric boxes only**
- Keep: Wallet Balance, Total Ad Accounts, Total Top-Up (with date range), Total Remaining Balance
- Remove: Active Ad Accounts, Disabled Ad Accounts, Total Spending
- Remove USD Rate card (client already sees it in top-up page)
- Keep frozen account banner and date range picker

**2. `ClientDetailPage.tsx` — Keep 7 boxes + Add Total Spending calendar filter**
- Keep all 7 metric boxes as-is (Wallet Balance, Total Ad Accounts, Active, Disabled, Total Top-Up, Total Remaining, Total Spending)
- Add a **second date range picker** for Total Spending — query `ad_accounts` spending filtered by calendar period (or use the same date range for both top-up and spending)
- Move USD Rate from the separate bordered section below Client Info into the **same grid as the 4 info boxes** (Full Name, Business Name, Phone, Onboarding Date) — making it a 5th box in that grid with inline edit capability

**3. Total Spending by Calendar**
- For the admin client detail page, add date-filtered spending. Since `ad_accounts.amount_spent` is a running total (not date-ranged), we'll use the existing `top_up_requests` or `transactions` table if available, OR use a single shared date range for both Total Top-Up and Total Spending display.
- Most practical: use the **same date range picker** for both metrics, and note that Total Spending is the current cumulative value (since Meta doesn't store daily breakdowns locally unless synced).

### Files
| File | Change |
|------|--------|
| `ClientDashboard.tsx` | Reduce to 4 boxes, remove Active/Disabled/Spending cards |
| `ClientDetailPage.tsx` | Move USD rate into client info grid, keep 7 boxes, add spending calendar filter |

