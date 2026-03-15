
CREATE TABLE public.ad_account_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  today_spend numeric DEFAULT 0,
  yesterday_spend numeric DEFAULT 0,
  balance numeric DEFAULT 0,
  cards jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(ad_account_id)
);

ALTER TABLE public.ad_account_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage insights" ON public.ad_account_insights FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view assigned account insights" ON public.ad_account_insights FOR SELECT TO authenticated USING (ad_account_id IN (SELECT ad_account_id FROM user_ad_accounts WHERE user_id = auth.uid()));
