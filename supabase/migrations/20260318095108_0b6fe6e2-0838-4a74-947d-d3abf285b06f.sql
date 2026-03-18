
CREATE TABLE public.system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_name text,
  action text NOT NULL,
  details text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all system_logs"
  ON public.system_logs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Superadmins can manage system_logs"
  ON public.system_logs FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Admins can insert system_logs"
  ON public.system_logs FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_system_logs_created_at ON public.system_logs (created_at DESC);
