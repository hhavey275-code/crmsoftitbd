
-- Allow admins to insert chat_conversations on behalf of clients
CREATE POLICY "Admins can insert chat_conversations" ON public.chat_conversations
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Superadmins can insert chat_conversations" ON public.chat_conversations
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'superadmin'));

-- Allow admins to insert chat_messages into any conversation  
CREATE POLICY "Admins can insert chat_messages" ON public.chat_conversations
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
