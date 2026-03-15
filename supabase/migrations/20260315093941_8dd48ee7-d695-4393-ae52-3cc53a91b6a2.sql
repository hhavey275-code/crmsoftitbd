
-- Update has_role function to be used in RLS policies (already supports superadmin via enum)
-- Add RLS policies for superadmin on existing tables

-- Allow superadmins same access as admins on all tables
CREATE POLICY "Superadmins can manage ad accounts" ON public.ad_accounts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmins can manage profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmins can manage user_roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmins can manage wallets" ON public.wallets
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmins can manage transactions" ON public.transactions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmins can manage top_up_requests" ON public.top_up_requests
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmins can manage notifications" ON public.notifications
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmins can manage bank_accounts" ON public.bank_accounts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmins can manage business_managers" ON public.business_managers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmins can manage site_settings" ON public.site_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmins can manage user_ad_accounts" ON public.user_ad_accounts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmins can manage client_banks" ON public.client_banks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmins can manage sync_logs" ON public.sync_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Superadmins can manage ad_account_insights" ON public.ad_account_insights
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'));
