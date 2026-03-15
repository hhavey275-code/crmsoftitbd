

## Plan: Blue "Top Up" Button with Direct Meta API Spend Cap Update

### What Changes

**Admin view (`AdminAdAccounts.tsx`):**
- Replace the "Increase Limit" outline button with a blue "Top Up" button (using `default` variant which is blue/primary)
- On submit, call the `update-spend-cap` edge function directly via `supabase.functions.invoke()` instead of inserting into `top_up_requests`
- Show success/error feedback with the old and new spend cap values
- After success, refresh the ad accounts list to reflect updated spend cap
- Keep the "Billing" button as-is

**Client view (`ClientAdAccounts.tsx`):**
- Same visual change: blue "Top Up" button
- Client submissions still insert into `top_up_requests` (pending admin approval), since the edge function is admin-only

**Edge function fix (`update-spend-cap/index.ts`):**
- Replace broken `auth.getClaims()` with `auth.getUser()` (same bug fixed in sync function earlier)
- Update CORS headers to include all required Supabase client headers
- Fix Meta API URL to include `act_` prefix: `act_{account_id}`
- The function already handles: admin role check, Meta API call, updating `ad_accounts.spend_cap`

### Files Modified

| File | Change |
|------|--------|
| `src/components/admin/AdminAdAccounts.tsx` | Blue "Top Up" button, call `update-spend-cap` edge function directly on submit |
| `src/components/client/ClientAdAccounts.tsx` | Blue "Top Up" button (still creates request for approval) |
| `supabase/functions/update-spend-cap/index.ts` | Fix auth, CORS headers, Meta API URL prefix |

