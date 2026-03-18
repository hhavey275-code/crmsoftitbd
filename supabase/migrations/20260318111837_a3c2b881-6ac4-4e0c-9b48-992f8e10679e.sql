
-- Create failed_topups table
CREATE TABLE public.failed_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  old_spend_cap numeric DEFAULT 0,
  error_message text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.failed_topups ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins can manage failed_topups" ON public.failed_topups FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Superadmins can manage failed_topups" ON public.failed_topups FOR ALL TO authenticated USING (has_role(auth.uid(), 'superadmin'::app_role));

-- Clients can view own
CREATE POLICY "Users can view own failed_topups" ON public.failed_topups FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.failed_topups;
