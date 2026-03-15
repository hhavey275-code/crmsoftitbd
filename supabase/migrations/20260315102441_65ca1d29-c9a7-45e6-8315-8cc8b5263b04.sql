DROP POLICY IF EXISTS "Anyone can read site_settings" ON public.site_settings;
CREATE POLICY "Anyone can read site_settings" ON public.site_settings
  FOR SELECT TO anon, authenticated
  USING (true);