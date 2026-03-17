

## Client Dashboard Redesign

### Changes

#### 1. Metric Cards Container — White wrapper with premium styling
Wrap the 4 metric cards in a white card container with subtle gradient border and refined shadow for a premium look.

#### 2. Replace Recent Transactions with Ad Accounts Section
- Remove the entire "Recent Transactions" card and the `transactions` query from `ClientDashboard.tsx`
- Add an "Ad Accounts" section showing the user's ad accounts in a clean card/list layout
- Each ad account shows: name, BM name, account ID (without `act_` prefix), spend progress bar, status badge
- **Ad Account ID click → opens Ads Manager** using the URL pattern:
  `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act={account_id_without_act_}&nav_source=flyout_menu`
  (extracted from user's reference link)

#### 3. Keep Date Range & Top-Up Period as-is

### Files to Modify
- **`src/components/client/ClientDashboard.tsx`**:
  - Remove `transactions` query and the Recent Transactions table
  - Wrap metric cards grid in a white Card with premium styling (subtle border gradient, refined shadows)
  - Add Ad Accounts section below, reusing the existing `adAccounts` query
  - Each account row: icon + name + BM name + account ID (clickable → Ads Manager) + spend bar + status
- **`src/components/MetricCard.tsx`** — No changes needed, styling will be on the wrapper

### Design Notes
- White wrapper card: `bg-white dark:bg-card border border-border/40 shadow-sm rounded-xl p-6`
- Ad account ID links to: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act={id_without_act_}`
- Reuse existing `SpendProgressBar` and `StatusBadge` components

