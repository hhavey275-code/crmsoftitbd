
-- Drop the RLS policy that depends on assigned_user_id
DROP POLICY IF EXISTS "Users can view assigned ad accounts" ON public.ad_accounts;

-- Now drop the column
ALTER TABLE public.ad_accounts DROP COLUMN IF EXISTS assigned_user_id;
ALTER TABLE public.ad_accounts DROP COLUMN IF EXISTS platform;
