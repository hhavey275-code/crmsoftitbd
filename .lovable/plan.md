

# TikTok Admin Spend Cap Management + Fraud Flagging

## Requirements

1. **Admin manually sets spend cap** after unfreezing a client — this becomes the new baseline
2. **"Update Spend Cap" action** in admin TikTok accounts list (action button per account) and detail page
3. **Admin updates spend cap via API** — calls TikTok budget API to set exact spend cap, then updates CRM
4. **Client dashboard reflects** the updated spend cap in realtime
5. **Red flag on mismatched accounts** — when fraud is detected, mark the specific ad account (not just freeze client) so admin can see which accounts had issues

## Technical Plan

### 1. Add `fraud_flag` column to `ad_accounts` table
- New boolean column `fraud_flag` (default: false)
- When fraud is detected in `tiktok-sync-client` and `tiktok-verify-topup`, set `fraud_flag = true` on the specific ad account
- When admin manually updates spend cap, reset `fraud_flag = false`

### 2. Admin "Update Spend Cap" dialog
- In `AdminTikTokAccounts.tsx`: Add dropdown menu per account row with "Top Up" and "Update Spend Cap" options
- In `AdAccountDetailPage.tsx`: Add "Update Spend Cap" button alongside Top Up for TikTok accounts
- Dialog lets admin enter exact new spend cap value (not increment)
- On submit: directly update `ad_accounts.spend_cap` in DB + call TikTok API to set budget via BC, then reset `fraud_flag = false`
- Since TikTok BC API doesn't support setting spend cap for postpaid accounts, we'll update CRM only (like current top-up flow) and open TikTok billing page for manual confirmation

### 3. Red flag visual indicator
- In `AdminTikTokAccounts.tsx`: Show a red warning icon/badge next to account name when `fraud_flag = true`
- In `AdAccountDetailPage.tsx`: Show alert banner when `fraud_flag = true`
- In `ClientTikTokAccounts.tsx`: Not visible to clients (admin-only indicator)

### 4. Edge function changes
- `tiktok-sync-client`: On fraud detection, also set `fraud_flag = true` on the specific ad account
- `tiktok-verify-topup`: On mismatch, also set `fraud_flag = true` on the specific ad account

### 5. Client dashboard realtime
- Already handled via existing `refetchInterval: 120000` in `ClientTikTokAccounts.tsx`
- When admin updates `spend_cap` in DB, client's next poll (or page reload) picks it up automatically

## Files to Modify

| File | Change |
|------|--------|
| **Migration** | Add `fraud_flag boolean default false` to `ad_accounts` |
| `supabase/functions/tiktok-sync-client/index.ts` | Set `fraud_flag = true` on fraud detection |
| `supabase/functions/tiktok-verify-topup/index.ts` | Set `fraud_flag = true` on mismatch |
| `src/components/admin/AdminTikTokAccounts.tsx` | Add dropdown menu with "Update Spend Cap" action, red flag indicator |
| `src/pages/AdAccountDetailPage.tsx` | Add "Update Spend Cap" button for TikTok, fraud alert banner, reset flag on update |

## Update Spend Cap Flow

```text
Admin clicks "Update Spend Cap" on TikTok account
  → Dialog: enter exact new spend cap value
  → Submit: update ad_accounts.spend_cap = new value, fraud_flag = false
  → Open TikTok billing page for manual confirmation
  → Client sees updated spend cap on next refresh
```

