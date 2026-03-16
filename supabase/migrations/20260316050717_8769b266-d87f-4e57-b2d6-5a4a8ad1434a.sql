
-- Telegram polling state (singleton)
CREATE TABLE public.telegram_bot_state (
  id int PRIMARY KEY CHECK (id = 1),
  update_offset bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.telegram_bot_state (id, update_offset) VALUES (1, 0);

-- Incoming Telegram messages
CREATE TABLE public.telegram_messages (
  update_id bigint PRIMARY KEY,
  chat_id bigint NOT NULL,
  text text,
  raw_update jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_telegram_messages_chat_id ON public.telegram_messages (chat_id);
CREATE INDEX idx_telegram_messages_created_at ON public.telegram_messages (created_at);

-- RLS
ALTER TABLE public.telegram_bot_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;

-- Only admins can read telegram tables
CREATE POLICY "Admins can manage telegram_bot_state" ON public.telegram_bot_state FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Superadmins can manage telegram_bot_state" ON public.telegram_bot_state FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Admins can manage telegram_messages" ON public.telegram_messages FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Superadmins can manage telegram_messages" ON public.telegram_messages FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'superadmin'));
