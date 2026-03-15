
-- Chat conversations table
CREATE TABLE public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  last_message_at timestamptz DEFAULT now(),
  is_resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id)
);

-- Chat messages table
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS: chat_conversations
CREATE POLICY "Clients can view own conversation" ON public.chat_conversations
  FOR SELECT TO authenticated USING (client_id = auth.uid());

CREATE POLICY "Clients can insert own conversation" ON public.chat_conversations
  FOR INSERT TO authenticated WITH CHECK (client_id = auth.uid());

CREATE POLICY "Clients can update own conversation" ON public.chat_conversations
  FOR UPDATE TO authenticated USING (client_id = auth.uid());

CREATE POLICY "Admins can manage chat_conversations" ON public.chat_conversations
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Superadmins can manage chat_conversations" ON public.chat_conversations
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'superadmin'));

-- RLS: chat_messages
CREATE POLICY "Clients can view own messages" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (conversation_id IN (SELECT id FROM public.chat_conversations WHERE client_id = auth.uid()));

CREATE POLICY "Clients can insert own messages" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    conversation_id IN (SELECT id FROM public.chat_conversations WHERE client_id = auth.uid())
  );

CREATE POLICY "Admins can manage chat_messages" ON public.chat_messages
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Superadmins can manage chat_messages" ON public.chat_messages
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'superadmin'));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
