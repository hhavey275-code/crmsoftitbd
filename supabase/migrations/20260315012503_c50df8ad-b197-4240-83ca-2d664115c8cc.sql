
-- Add unique constraint on account_id for upsert support
ALTER TABLE public.ad_accounts ADD CONSTRAINT ad_accounts_account_id_key UNIQUE (account_id);
