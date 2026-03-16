

## Plan: Redesign Spend Date Picker (Meta Ads Manager Style)

Replace the current inline From/To date pickers with a single cohesive date range picker component inspired by the screenshot — preset options on the left, two-month calendar on the right, date range display at the bottom, and an "Update" button to trigger the fetch.

### Changes

#### 1. `src/components/admin/AdminDashboard.tsx`
- Replace the "Custom Range" section (lines 264-310) with a single `Popover` that opens a rich date picker panel
- The panel will have:
  - **Left sidebar**: Preset radio buttons — Today, Yesterday, Last 7 days, Last 14 days, Last 28 days, Last 30 days, This week, Last week, This month, Last month
  - **Right side**: Two-month `Calendar` with `mode="range"` showing current and next month side by side
  - **Bottom bar**: Shows selected `From` and `To` dates + "Update" button
- Clicking a preset auto-sets `dateFrom`/`dateTo` and highlights on the calendar
- Clicking "Update" closes the popover, calls `handleFetchDateRangeSpend`, and shows the result
- The trigger button shows the currently selected range label (e.g., "Mar 1 – Mar 16, 2026")
- Result displays below as a metric showing the total spend for the selected range

#### 2. Calendar component usage
- Use `<Calendar numberOfMonths={2} mode="range" />` from shadcn (react-day-picker supports this natively)
- The `selected` prop takes `{ from: Date, to: Date }` for range mode

### UI Layout Inside Popover
```text
┌──────────────┬────────────────────────────────┐
│ ○ Today      │   March 2026      April 2026   │
│ ○ Yesterday  │   [calendar]      [calendar]   │
│ ○ Last 7d    │                                 │
│ ○ Last 14d   │                                 │
│ ○ Last 28d   │                                 │
│ ○ Last 30d   │                                 │
│ ○ This week  │                                 │
│ ○ Last week  │                                 │
│ ○ This month │                                 │
│ ○ Last month │                                 │
├──────────────┴────────────────────────────────┤
│  [Mar 16, 2026] — [Mar 16, 2026]   [Update]  │
└───────────────────────────────────────────────┘
```

### File Modified
- `src/components/admin/AdminDashboard.tsx` — replace date range section with rich popover picker

