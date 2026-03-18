

## Plan: Meta API Call Tracking per Business Manager

### Problem
Currently there's no visibility into how many Meta API calls are being made per Business Manager per hour. This is critical because Meta rate limits are shared at the BM/App level.

### Solution

#### 1. New DB Table: `api_call_logs`
Track every Meta API call with BM ID, timestamp, and source function.

```text
api_call_logs
├── id (uuid, PK)
├── business_manager_id (uuid, FK → business_managers)
├── function_name (text) — e.g. "get-account-insights", "spend-cap-update", "scheduled-sync"
├── call_count (integer) — number of API calls in this batch
├── created_at (timestamptz, default now())
```

RLS: Admin-only access.

#### 2. Update Edge Functions to Log Calls
Add a small helper in each function (`get-account-insights`, `spend-cap-update`, `scheduled-sync`) that inserts a row after Meta API calls are made, recording BM ID and call count.

Functions to update:
- **get-account-insights**: Each account makes 3-4 calls → log per batch
- **spend-cap-update**: 2-3 calls per top-up → log per invocation  
- **scheduled-sync**: 1+ calls per BM → log per BM sync

#### 3. Admin Dashboard Widget
Add an "API Usage" section (new page or within Business Managers page) showing:
- Per-BM calls in the last hour / last 24h
- Simple bar chart or table with hourly breakdown
- Warning indicator if approaching Meta's ~200 calls/hour/BM threshold

#### Files Changed

| File | Change |
|------|--------|
| Migration | Create `api_call_logs` table with RLS |
| `get-account-insights/index.ts` | Add logging after Meta API batch |
| `spend-cap-update/index.ts` | Add logging after Meta API calls |
| `scheduled-sync/index.ts` | Add logging after sync calls |
| `AdminBusinessManagers.tsx` | Add API usage display per BM (calls/hour count) |

