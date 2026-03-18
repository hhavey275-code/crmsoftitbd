
-- Create ad_account_requests table
CREATE TABLE public.ad_account_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_name text NOT NULL,
  email text NOT NULL,
  business_manager_id text NOT NULL,
  monthly_spend text,
  start_date text,
  status text NOT NULL DEFAULT 'pending',
  assigned_ad_account_id uuid REFERENCES public.ad_accounts(id),
  admin_note text,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_account_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own ad_account_requests" ON public.ad_account_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Clients can insert own ad_account_requests" ON public.ad_account_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage ad_account_requests" ON public.ad_account_requests
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Superadmins can manage ad_account_requests" ON public.ad_account_requests
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'superadmin'::app_role));

-- Create bm_access_requests table
CREATE TABLE public.bm_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id),
  bm_name text NOT NULL,
  bm_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bm_access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own bm_access_requests" ON public.bm_access_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Clients can insert own bm_access_requests" ON public.bm_access_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage bm_access_requests" ON public.bm_access_requests
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Superadmins can manage bm_access_requests" ON public.bm_access_requests
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'superadmin'::app_role));

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_account_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bm_access_requests;

-- Trigger for notifications when client submits ad account request
CREATE OR REPLACE FUNCTION public.notify_admins_on_ad_account_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, reference_id)
  SELECT ur.user_id, 'ad_account_request', 'New Ad Account Request',
    'A client requested a new ad account: ' || NEW.account_name,
    NEW.id
  FROM public.user_roles ur WHERE ur.role IN ('admin', 'superadmin');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_ad_account_request_created
  AFTER INSERT ON public.ad_account_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_ad_account_request();

-- Trigger for notifications when client submits BM access request
CREATE OR REPLACE FUNCTION public.notify_admins_on_bm_access_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, reference_id)
  SELECT ur.user_id, 'bm_access_request', 'New BM Access Request',
    'A client requested BM partner access (BM: ' || NEW.bm_name || ')',
    NEW.id
  FROM public.user_roles ur WHERE ur.role IN ('admin', 'superadmin');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_bm_access_request_created
  AFTER INSERT ON public.bm_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_bm_access_request();
