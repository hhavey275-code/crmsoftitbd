CREATE POLICY "Authenticated users can insert system_logs"
ON public.system_logs
FOR INSERT
TO authenticated
WITH CHECK (true);