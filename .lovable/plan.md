

# TikTok Fraud Detection: Disable → Delete Campaigns + Admin Notify

## Overview

When fraud is detected (spending cap mismatch during verify or sync), the system will:
1. **First**: DISABLE all running campaigns (immediate spend stop)
2. **If fraud persists on next sync**: DELETE the disabled campaigns
3. **Notify admins** with campaign details at each step

## Implementation

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/tiktok-verify-topup/index.ts` | Add campaign DISABLE logic on mismatch + admin notification with campaign count |
| `supabase/functions/tiktok-sync-client/index.ts` | Add fraud check: if campaigns still found after freeze, DELETE them + notify |

### Campaign Management Flow

```text
Mismatch Detected (verify-topup or sync-client)
  │
  ├─ 1st time: Freeze account + DISABLE campaigns
  │     GET /campaign/get/ (filter: CAMPAIGN_STATUS_ENABLE)
  │     POST /campaign/update/status/ (opt_status: "DISABLE")
  │     → Log: "Disabled X campaigns"
  │     → Notify admins: "Fraud detected, X campaigns disabled"
  │
  └─ Next sync (account already frozen): DELETE disabled campaigns
        GET /campaign/get/ (filter: CAMPAIGN_STATUS_DISABLE)
        POST /campaign/update/status/ (opt_status: "DELETE")
        → Log: "Deleted X campaigns"
        → Notify admins: "X campaigns permanently deleted"
```

### TikTok API Calls

1. **Fetch campaigns**: `GET /open_api/v1.3/campaign/get/?advertiser_id={id}&filtering={"status":"CAMPAIGN_STATUS_ENABLE"}&page_size=100`
2. **Update status**: `POST /open_api/v1.3/campaign/update/status/` with body `{advertiser_id, campaign_ids[], opt_status: "DISABLE" or "DELETE"}`
3. Batch limit: 20 campaign IDs per call

### Key Details

- Campaign disable/delete uses the same BC access token already available
- If API call fails, account freeze still proceeds — campaign action is best-effort with error logging
- Admin notifications include: client name, account name, campaign count, action taken (disabled/deleted)
- `tiktok-verify-topup`: On mismatch → freeze + DISABLE campaigns
- `tiktok-sync-client`: On already-frozen account with disabled campaigns found → DELETE them

