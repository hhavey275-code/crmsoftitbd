

## Plan: Search/Filter Bar + Hidden Select Toggle for Billings, Admin Ad Accounts, and Client Ad Accounts

### Changes Overview

All three pages (BillingsPage, AdminAdAccounts, ClientAdAccounts) get the same search/filter toolbar pattern.

### 1. Search & Filter Bar (all 3 files)

Add a toolbar row between the header and the table card with:

- **Search input** — filters by `account_name` or `account_id` (text match, case-insensitive)
- **Status dropdown** — filter by Active / Disabled / Unsettled / All (uses the `status` field on `ad_accounts`)
- **Card dropdown** — filter by card name from insights data (collects unique `display_string` values across all accounts, lets user pick one or "All")

All filters are client-side `useMemo` on top of the existing sorted array.

### 2. Hidden Select Checkbox (all 3 files)

Currently the select checkboxes (header + per-row) are always visible. Change to:

- Hide the checkbox column by default
- Add a small icon button (e.g. `ListChecks` or `CheckSquare` icon) in the toolbar area
- Clicking it toggles a `showSelect` boolean state
- When `showSelect` is true, the checkbox column appears; when false, it hides and clears `selectedIds`
- The "Update X Selected" button only shows when `showSelect && selectedIds.size > 0`

### 3. Files to modify

- `src/pages/BillingsPage.tsx` — add search input, status filter, card filter (no select checkboxes exist here, so no toggle needed)
- `src/components/admin/AdminAdAccounts.tsx` — add search/status/card filters + hide select toggle
- `src/components/client/ClientAdAccounts.tsx` — add search/status/card filters + hide select toggle

### 4. UI Layout

```text
┌─────────────────────────────────────────────────────────┐
│ [🔍 Search by name or ID...] [Status ▼] [Card ▼] [☑ icon] │
└─────────────────────────────────────────────────────────┘
```

- Search: standard `Input` with `Search` icon
- Status/Card: `Select` dropdowns from existing UI components
- Select toggle: small ghost icon button using `ListChecks` from lucide-react

No database changes needed. Pure frontend filtering.

