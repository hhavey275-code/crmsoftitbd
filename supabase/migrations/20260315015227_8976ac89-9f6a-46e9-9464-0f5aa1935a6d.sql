
-- Add business_name column to ad_accounts if it doesn't exist
ALTER TABLE public.ad_accounts ADD COLUMN IF NOT EXISTS business_name text;

-- Create user_ad_accounts junction table
CREATE TABLE IF NOT EXISTS public.user_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ad_account_id)
);

-- Enable RLS
ALTER TABLE public.user_ad_accounts ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins can manage user_ad_accounts" ON public.user_ad_accounts
  FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));

-- Clients can view their own assignments
CREATE POLICY "Users can view own ad account assignments" ON public.user_ad_accounts
  FOR SELECT TO public USING (auth.uid() = user_id);
