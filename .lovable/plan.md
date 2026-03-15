

## Plan: Inactive Account Enforcement + Client Dashboard Cleanup

### Problem
1. Inactive clients can still top up ad accounts (wallet deduction + Meta API call happens)
2. Client dashboard has no frozen account notification
3. Client ad accounts table has unnecessary columns (Today, Yesterday, Balance)

### Changes

**1. `ClientAdAccounts.tsx` — Block top-up for inactive clients + remove columns**
- Import `useAuth` and check `profile?.status === "inactive"`
- Show frozen account banner at the top (same style as ClientTopUp)
- Disable/hide the "Top Up" button on each row when inactive
- Remove 3 columns: **Balance**, **Today Spend**, **Yesterday Spend** (and their sort logic, table headers, and table cells)

**2. `ClientDashboard.tsx` — Add frozen notification**
- Import `useAuth` and check `profile?.status === "inactive"`
- Show a prominent warning card at the top: "This account is frozen from admin"

**3. `update-spend-cap` edge function — Server-side inactive check**
- After verifying the caller, fetch their profile status
- If `status === "inactive"` and caller is not admin, return 403 with "Account frozen" error
- This prevents any wallet deduction and Meta API call even if the client bypasses the UI

### Column Order (Client - after removal)
`☐ | Ad Account | Budget | Status | Card Name | Billing | Actions`

### Files
| File | Change |
|------|--------|
| `ClientAdAccounts.tsx` | Remove Balance/Today/Yesterday columns, block top-up for inactive |
| `ClientDashboard.tsx` | Add frozen account notification banner |
| `update-spend-cap/index.ts` | Add server-side inactive user check before processing |

