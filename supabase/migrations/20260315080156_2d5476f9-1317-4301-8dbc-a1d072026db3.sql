
DROP POLICY "Authenticated can insert notifications" ON public.notifications;

CREATE POLICY "Trigger and admins can insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());
