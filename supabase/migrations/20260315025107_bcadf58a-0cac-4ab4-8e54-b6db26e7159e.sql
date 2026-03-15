
-- Create bank_accounts table
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name text NOT NULL,
  account_name text NOT NULL,
  account_number text NOT NULL,
  branch text,
  routing_number text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage banks" ON public.bank_accounts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view active banks" ON public.bank_accounts FOR SELECT TO authenticated USING (status = 'active');

-- Create client_banks junction table
CREATE TABLE public.client_banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now(),
  UNIQUE(user_id, bank_account_id)
);
ALTER TABLE public.client_banks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage client_banks" ON public.client_banks FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own banks" ON public.client_banks FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Add BDT columns to top_up_requests
ALTER TABLE public.top_up_requests 
  ADD COLUMN IF NOT EXISTS bdt_amount numeric,
  ADD COLUMN IF NOT EXISTS usd_rate numeric,
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES public.bank_accounts(id);
