
-- Add last_synced_at to business_managers
ALTER TABLE public.business_managers ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

-- Create sync_logs table
CREATE TABLE public.sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_manager_id uuid NOT NULL REFERENCES public.business_managers(id) ON DELETE CASCADE,
  synced_count int NOT NULL DEFAULT 0,
  total_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sync_logs" ON public.sync_logs
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));
