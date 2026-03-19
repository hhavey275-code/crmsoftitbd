ALTER TABLE public.transactions ADD COLUMN bank_account_id uuid REFERENCES public.bank_accounts(id);
ALTER TABLE public.bank_accounts ADD COLUMN telegram_group_id text;