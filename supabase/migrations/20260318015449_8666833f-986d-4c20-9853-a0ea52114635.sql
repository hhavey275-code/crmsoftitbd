
CREATE TABLE public.api_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_manager_id uuid REFERENCES public.business_managers(id) ON DELETE CASCADE NOT NULL,
  function_name text NOT NULL,
  call_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage api_call_logs" ON public.api_call_logs FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Superadmins can manage api_call_logs" ON public.api_call_logs FOR ALL TO authenticated USING (has_role(auth.uid(), 'superadmin'::app_role));

CREATE INDEX idx_api_call_logs_bm_created ON public.api_call_logs (business_manager_id, created_at DESC);
