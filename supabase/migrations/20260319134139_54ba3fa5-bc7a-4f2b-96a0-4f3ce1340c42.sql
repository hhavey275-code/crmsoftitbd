
-- Add seller to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'seller';

-- Create seller_transactions table
CREATE TABLE public.seller_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('usdt_received', 'bdt_payment', 'client_topup')),
  bdt_amount numeric NOT NULL DEFAULT 0,
  usdt_amount numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  description text,
  bank_account_id uuid REFERENCES public.bank_accounts(id),
  top_up_request_id uuid REFERENCES public.top_up_requests(id),
  proof_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add seller_id to bank_accounts
ALTER TABLE public.bank_accounts ADD COLUMN seller_id uuid;

-- Enable RLS
ALTER TABLE public.seller_transactions ENABLE ROW LEVEL SECURITY;

-- RLS: Sellers can view own transactions
CREATE POLICY "Sellers can view own seller_transactions"
ON public.seller_transactions FOR SELECT TO authenticated
USING (seller_id = auth.uid());

-- RLS: Admins can manage all
CREATE POLICY "Admins can manage seller_transactions"
ON public.seller_transactions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Superadmins can manage seller_transactions"
ON public.seller_transactions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'superadmin'::app_role));
