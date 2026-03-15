
CREATE TABLE public.site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read site_settings" ON public.site_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert site_settings" ON public.site_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update site_settings" ON public.site_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true);

CREATE POLICY "Anyone can read logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'logos');

CREATE POLICY "Admins can upload logos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'logos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update logos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'logos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete logos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'logos' AND public.has_role(auth.uid(), 'admin'));
