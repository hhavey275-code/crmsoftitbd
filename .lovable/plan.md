

## Plan: Billings Page Column Reorder + Update from Meta Button

### Changes — `src/pages/BillingsPage.tsx` only

**1. Reorder columns** to: Account → Current Balance (sortable) → Status → How you'll pay → Billing (button with label)

**2. Tighten column widths** — remove excessive fixed widths, let data drive spacing.

**3. "Billing" button column** — replace the icon-only `ExternalLink` with a labeled button/link saying "Billing".

**4. Add "Update from Meta" button** at the top header area — a mutation that calls `get-account-insights` with `source: "meta"`, then refetches the cache query. Show last synced time. Uses same pattern as AdminAdAccounts.

No other files need changes. All other pages already use cache-first with manual "Update from Meta" buttons.

