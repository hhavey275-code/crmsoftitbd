

## Plan: 3 Changes

### 1. Spend Overview — Persist data & add date picker instead of "Total Spent All Time" (`AdminDashboard.tsx`)
- Keep `spendData` in state so it persists until next fetch (already works)
- Replace "Total Spent (All Time)" section with a **date picker** (Popover + Calendar from shadcn) that lets admin pick a date range
- When fetching, pass the selected date range to the edge function (or calculate from cached data)
- Since the edge function currently only returns today/yesterday spend, we'll add the calendar UI but note that custom date range spend requires the insights to support it. For now, the calendar will be a placeholder for future date-range filtering, and we keep today + yesterday display as-is after fetch.

**Actually** — looking at this more carefully, the user wants a calendar to view spend by date. Since the Meta API insights endpoint supports `time_range`, we should pass the selected date to the edge function. But the current `get-account-insights` function structure may not support arbitrary dates easily.

**Simpler approach**: Replace "Total Spent (All Time)" with a date picker. When a date is selected, we show "Selected Date's Spend" by fetching insights with that date parameter. For MVP, we'll keep today/yesterday as-is and add a third metric that shows spend for a calendar-picked date.

### 2. Bulk Actions Dropdown (`AdminAdAccounts.tsx`)
Currently when accounts are selected, 4 separate buttons appear: Delete, Assign, Unassign, Update. Combine these into a single **DropdownMenu** with 4 items:
- Update Selected
- Assign Selected  
- Unassign Selected
- Delete Selected (with destructive styling)

### 3. "Last synced X min ago" relative time (`AdminAdAccounts.tsx`)
Replace the absolute timestamp `lastUpdated.toLocaleString()` with a relative time display like "1 min ago", "5 min ago". Use a simple helper function + `setInterval` to keep it updating every 30 seconds.

### Files Modified
- `src/components/admin/AdminDashboard.tsx` — date picker replaces "Total Spent All Time", data persists between fetches
- `src/components/admin/AdminAdAccounts.tsx` — bulk actions dropdown, relative "last synced" time
- `supabase/functions/get-account-insights/index.ts` — may need minor update to accept a `date` parameter for calendar-based spend lookup

