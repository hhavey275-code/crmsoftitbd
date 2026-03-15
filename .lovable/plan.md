

## Plan: Checkbox Selection + Remove Per-Row Sync + Restore Billing Column

### Changes

**Both `AdminAdAccounts.tsx` and `ClientAdAccounts.tsx`:**

1. **Remove per-row RefreshCw button** from the Actions column -- only keep Top Up button there
2. **Add checkbox column** as the first column:
   - Add `selectedIds` state (`Set<string>`)
   - Header checkbox for select all / deselect all
   - Per-row checkbox to toggle selection
   - Clicking checkbox should NOT navigate to detail page (stopPropagation)
3. **Add "Update Selected" button** next to "Update All from Meta" in the top bar:
   - Only visible when `selectedIds.size > 0`
   - Calls the edge function with only the selected IDs using `source: "meta"`
   - Shows count like "Update 3 Selected"
4. **Restore billing link as a separate column** -- move the Facebook billing hub link (`ExternalLink` icon) from being embedded in the Ad Account name cell into its own "Billing" column, making it a standalone clickable icon link

### Column Order (Admin)
`☐ | Ad Account | Budget | Status | Balance | Today | Yesterday | Card Name | Client | Billing | Actions`

### Column Order (Client)
`☐ | Ad Account | Budget | Status | Balance | Today | Yesterday | Card Name | Billing | Actions`

### Files
| File | Change |
|------|--------|
| `AdminAdAccounts.tsx` | Add checkbox column, remove per-row refresh, add billing column, add "Update Selected" button |
| `ClientAdAccounts.tsx` | Same changes |

