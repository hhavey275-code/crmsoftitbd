
-- Create invoices table
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  top_up_request_id uuid NOT NULL REFERENCES public.top_up_requests(id) ON DELETE CASCADE,
  invoice_number text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  bdt_amount numeric,
  usd_rate numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own invoices" ON public.invoices FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage invoices" ON public.invoices FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Superadmins can manage invoices" ON public.invoices FOR ALL TO authenticated USING (has_role(auth.uid(), 'superadmin'::app_role));

-- Sequence for invoice numbers
CREATE SEQUENCE public.invoice_number_seq START 1;

-- Function to generate invoice number
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text
LANGUAGE sql
SET search_path TO 'public'
AS $$
  SELECT 'INV-' || lpad(nextval('public.invoice_number_seq')::text, 4, '0')
$$;
