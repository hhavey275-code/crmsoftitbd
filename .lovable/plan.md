

## Plan: Real-time Chat Support System

### Overview
Create a real-time chat system where clients can message admins and get instant responses. Clients see a floating chat widget; admins see a dedicated chat inbox with all client conversations.

---

### 1. Database Tables

**`chat_conversations`** — one conversation per client
```sql
CREATE TABLE public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at timestamptz DEFAULT now(),
  is_resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id)
);
```

**`chat_messages`** — individual messages
```sql
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
```

**RLS Policies:**
- Clients can SELECT/INSERT on their own conversation and messages
- Admins/superadmins have full access to all conversations and messages

**Realtime:** Enable both tables for realtime via `ALTER PUBLICATION supabase_realtime ADD TABLE`.

---

### 2. Client Side — Floating Chat Widget

**New file: `src/components/ChatWidget.tsx`**
- A floating bubble (bottom-right corner) with a `MessageCircle` icon and unread badge
- Clicking opens a chat panel (slide-up card) with:
  - Message history (scrollable)
  - Text input + send button
- Auto-creates a conversation on first message
- Subscribes to realtime `chat_messages` inserts for instant updates
- Shows "online" indicator and timestamps

**Placement:** Rendered inside `DashboardLayout.tsx` for non-admin users only.

---

### 3. Admin Side — Chat Inbox

**New file: `src/components/admin/AdminChat.tsx`**
- Left panel: list of client conversations sorted by `last_message_at`, showing client name, last message preview, unread count
- Right panel: selected conversation's full message thread + reply input
- Realtime subscription for new messages across all conversations
- "Resolve" button to mark conversations as resolved

**New page: `src/pages/ChatPage.tsx`**
- Wraps `AdminChat` in `DashboardLayout`
- Route: `/chat`

**Sidebar update:** Add "Chat Support" nav item with `MessageCircle` icon for admin/superadmin users.

---

### 4. Files to Create/Modify

| File | Action |
|------|--------|
| DB Migration | Create `chat_conversations` + `chat_messages` tables with RLS + realtime |
| `src/components/ChatWidget.tsx` | New — floating chat for clients |
| `src/components/admin/AdminChat.tsx` | New — admin chat inbox |
| `src/pages/ChatPage.tsx` | New — chat page wrapper |
| `src/App.tsx` | Add `/chat` route |
| `src/components/AppSidebar.tsx` | Add "Chat Support" to admin nav |
| `src/components/DashboardLayout.tsx` | Render `ChatWidget` for clients |

