ALTER TABLE public.ad_account_insights 
ADD COLUMN today_orders integer DEFAULT 0,
ADD COLUMN yesterday_orders integer DEFAULT 0;