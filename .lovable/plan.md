

## Plan: Fix Client Ad Account Visibility

### Problem
The `ad_accounts` table only has admin RLS policies. When a client queries their assigned ad accounts, they can read `user_ad_accounts` (has user SELECT policy) but cannot read the corresponding rows from `ad_accounts` — so the dashboard shows nothing.

### Fix
Add one RLS policy to `ad_accounts` allowing clients to SELECT rows where their user_id appears in `user_ad_accounts`:

```sql
CREATE POLICY "Users can view assigned ad accounts"
ON public.ad_accounts
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT ad_account_id FROM public.user_ad_accounts
    WHERE user_id = auth.uid()
  )
);
```

### Files Modified

| File | Change |
|------|--------|
| Database migration | Add SELECT policy on `ad_accounts` for assigned clients |

No code changes needed — the client components already query correctly, they just get empty results due to RLS.

