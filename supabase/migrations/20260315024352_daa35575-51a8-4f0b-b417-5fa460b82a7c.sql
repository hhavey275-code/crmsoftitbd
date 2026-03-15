CREATE POLICY "Users can view assigned ad accounts"
ON public.ad_accounts
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT ad_account_id FROM public.user_ad_accounts
    WHERE user_id = auth.uid()
  )
);