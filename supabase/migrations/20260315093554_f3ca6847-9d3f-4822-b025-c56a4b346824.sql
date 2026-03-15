
-- Change default profile status to 'pending'
ALTER TABLE public.profiles ALTER COLUMN status SET DEFAULT 'pending';

-- Create menu_permissions table
CREATE TABLE public.menu_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  menu_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, menu_key)
);
ALTER TABLE public.menu_permissions ENABLE ROW LEVEL SECURITY;

-- RLS policies for menu_permissions
CREATE POLICY "Superadmins can manage menu_permissions" ON public.menu_permissions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Users can view own permissions" ON public.menu_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
