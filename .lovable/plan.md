

## Admin Top-Up Summary Boxes with Date Picker

### What We're Building
A row of 4 summary metric cards at the top of the Admin Top-Up page, filtered by a calendar date picker that supports Today, Yesterday, and custom date range selection.

### Metrics
1. **Total Top Up (USD)** — sum of `amount` from approved requests in selected period
2. **Total Payment Received (BDT)** — sum of `bdt_amount` from approved requests in selected period
3. **Auto Approved** — count of approved requests where `admin_note` contains "Auto Approved by System" in selected period
4. **Manual Approved** — count of approved requests that are approved but NOT auto-approved in selected period

### Date Picker
- Quick presets: **Today**, **Yesterday** buttons
- **Date Range** picker using Calendar popover for custom from/to selection
- Default: Today

### Layout
- Date picker row at top (below heading, above tabs)
- 4 metric cards in a 2x2 grid on mobile, 4-column row on desktop
- Cards use existing MetricCard style or simple Card with icon + value + label

### File Changes

**`src/components/admin/AdminTopUp.tsx`**
- Add date state (from/to) with Today as default
- Add preset buttons (Today, Yesterday) + date range popover with Calendar
- Filter approved requests by selected date range
- Compute 4 metrics from filtered data
- Render 4 summary Cards between the header and the Tabs
- All data comes from the already-fetched `requests` array (no new queries needed)

