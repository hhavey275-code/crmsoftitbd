
-- Create business_managers table
CREATE TABLE public.business_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bm_id text NOT NULL UNIQUE,
  name text NOT NULL,
  access_token text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage business managers" ON public.business_managers
  FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_business_managers_updated_at
  BEFORE UPDATE ON public.business_managers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Alter ad_accounts: add business_manager_id, assigned_user_id, spend_cap, amount_spent
ALTER TABLE public.ad_accounts
  ADD COLUMN business_manager_id uuid REFERENCES public.business_managers(id) ON DELETE CASCADE,
  ADD COLUMN assigned_user_id uuid,
  ADD COLUMN spend_cap numeric NOT NULL DEFAULT 0,
  ADD COLUMN amount_spent numeric NOT NULL DEFAULT 0;

-- Drop old client insert/update policies (clients no longer add accounts manually)
DROP POLICY IF EXISTS "Users can insert own ad accounts" ON public.ad_accounts;
DROP POLICY IF EXISTS "Users can update own ad accounts" ON public.ad_accounts;

-- Update client SELECT policy to use assigned_user_id
DROP POLICY IF EXISTS "Users can view own ad accounts" ON public.ad_accounts;
CREATE POLICY "Users can view assigned ad accounts" ON public.ad_accounts
  FOR SELECT TO public USING (auth.uid() = assigned_user_id);

-- Alter top_up_requests: add ad_account_id
ALTER TABLE public.top_up_requests
  ADD COLUMN ad_account_id uuid REFERENCES public.ad_accounts(id);
