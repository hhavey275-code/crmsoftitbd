ALTER TABLE public.ad_account_insights
  ADD COLUMN IF NOT EXISTS active_campaigns integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS today_messages integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yesterday_messages integer DEFAULT 0;