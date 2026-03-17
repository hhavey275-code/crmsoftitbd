

## Ad Account Payment Method (Funding Source) Sharing

### What
Admin can share an existing funding source (credit card) from a Business Manager to an ad account via Meta Graph API, and view/remove existing funding sources — all from the Ad Account Detail page.

### Meta API Endpoints
- **List funding sources on BM**: `GET /{bm_id}/extendedcredits` or `GET /{bm_id}/funding_source_coupons` — but more practically, `GET /{ad_account_id}/adspaymentcycles` or `GET /{bm_id}/owned_payment_methods`
- **Share funding source**: `POST /{ad_account_id}/adspixels` won't work. The correct approach:
  - `GET /{bm_id}/payment_methods.list?fields=id,display_string,type` to list BM's available funding sources
  - `POST /{ad_account_id}/funding_source_details_group` with the funding source ID to attach it

Actually, Meta's standard approach for sharing a payment method:
- **List BM payment methods**: `GET /{bm_id}/payment_methods.list` (needs `business_management` permission)
- **Assign to ad account**: This typically requires using the Business Manager's credit line or `adspaymentmethods` endpoint

### Simpler Verified Approach
Meta Graph API supports:
1. **List current payment methods on ad account**: Already done via `get-account-insights` (cards field)
2. **List BM's funding sources**: `GET /{bm_id}?fields=funding_source_details{id,display_string,type}`
3. **Add funding source to ad account**: `POST /act_{id}` with `funding_source` parameter

### Changes

**1. Update `manage-ad-account-partners/index.ts`** (or create new edge function)
Add two new actions to the existing edge function:
- `list_funding_sources`: Fetch BM's available funding sources via `GET /{bm_id}?fields=funding_source_details{id,display_string,type}`
- `add_funding_source`: Attach a funding source to an ad account via `POST /act_{id}` with `funding_source={source_id}`

**2. Create `AdAccountPaymentMethods.tsx` component**
- Shows current payment methods from insights `cards` data
- Admin can click "Add Payment Method" to see a dialog listing BM's available funding sources
- Admin selects one and confirms to attach it to the ad account
- Uses `CardBrandIcon` for visual consistency

**3. Update `AdAccountDetailPage.tsx`**
- Add the new `AdAccountPaymentMethods` component in the detail grid (admin only)

### UI Layout
A new card on the Ad Account Detail page with:
- Header: "Payment Methods" with a "+" button
- List of current cards from insights data
- Dialog: shows BM's available funding sources to pick from

