

## Plan: Add "Increase Limit" and "Billing Page" Buttons to Ad Accounts

### Changes

**Both `AdminAdAccounts.tsx` and `ClientAdAccounts.tsx`:**

1. **"Increase Limit" button per row** — Opens a dialog to submit a top-up request for that specific ad account. Pre-fills the account, user enters amount. On submit, inserts into `topups` table (same flow as `ClientTopUp`).

2. **"Billing" button per row** — Links to the Meta Ads Manager billing page for that account: `https://business.facebook.com/ads/manager/account_settings/account_billing/?act={account_id}`

**Admin view** gets both buttons in a new "Actions" column.
**Client view** gets both buttons in a new "Actions" column. The "Increase Limit" button submits a top-up request (pending admin approval).

### Files Modified

| File | Change |
|------|--------|
| `src/components/admin/AdminAdAccounts.tsx` | Add Actions column with Increase Limit dialog + Billing link button |
| `src/components/client/ClientAdAccounts.tsx` | Add Actions column with Increase Limit (submits topup request) + Billing link button |

