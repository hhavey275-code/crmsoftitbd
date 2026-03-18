

## Plan: Remove auto-sync from Admin Ad Accounts + Remove Failed Top-Ups section

### Problem
1. Admin Ad Accounts page auto-syncs from Meta on every page load/reload — this should only happen when "Update from Meta" button is clicked manually.
2. Failed Top-Ups section still appears at the bottom of Admin Ad Accounts page — it should only exist in the sidebar as a dedicated page.

### Changes

**`src/components/admin/AdminAdAccounts.tsx`**

1. **Remove auto-sync on mount** (lines 85-112): Delete the `hasAutoRefreshed` ref and the `useEffect` that calls `get-account-insights` with `source: "meta"` automatically. Remove the `isAutoSyncing` state and the "Syncing from Meta..." indicator. Data will only update from Meta when the admin clicks the manual "Update All from Meta" button.

2. **Remove FailedTopUps section** (lines 699-700): Remove `<FailedTopUps />` component usage and its import (line 2).

### What stays the same
- Cache-based insights query (`source: "cache"`) still loads on mount for instant display
- Manual "Update All from Meta" and "Update Selected from Meta" buttons remain functional
- Failed Top-Ups page at `/failed-topups` via sidebar remains untouched

