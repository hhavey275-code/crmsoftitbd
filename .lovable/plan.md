

## Plan: Sidebar Badge Notifications + Client Notifications on Actions

### What We're Building

1. **Red notification badges on sidebar menu items** for admins (pending top-ups, unread chats, pending clients)
2. **Client-side notifications** when their top-up is approved/rejected/held, or when admin sends a chat message
3. **Notification sound on every new notification** (already works via realtime subscription)
4. **Client notifications when their account status changes** (approved/rejected)

### Current State

- Notification bell with realtime + sound already works
- Top-up approve/reject already sends notification to client (line 219-224 in AdminTopUp.tsx)
- No sidebar badges exist yet
- No notification sent when client status changes (approved/pending)
- No notification sent on new chat message

### Changes

#### 1. Create `useSidebarBadges` hook (new file)
- For **admins**: query counts of:
  - `top_up_requests` where `status = 'pending'` → badge on "Top-Up Request" menu
  - `chat_messages` where `is_read = false` and sender is not admin → badge on "Chat Support" menu  
  - `profiles` where `status = 'pending'` → badge on "Clients" menu
- Subscribe to realtime changes on these tables for live updates
- Return a `Record<string, number>` mapping menu keys to unread counts

#### 2. Update `AppSidebar.tsx`
- Import and use `useSidebarBadges` hook
- Render red badge dot/count next to each menu item icon when count > 0

#### 3. Add client notification on profile status change (`AdminClients.tsx`)
- When admin approves a client (status change to 'active'), insert a notification for that client
- When admin rejects a client, insert a notification with reason

#### 4. Add notification on new chat message for clients
- In `AdminChat.tsx`, after admin sends a message, insert a notification for the client

#### 5. Update `NotificationBell.tsx` handleClick
- Route to correct page based on notification type (top_up → /top-up, chat → /chat, client_status → /settings)

### Files to Create/Modify

| File | Change |
|------|--------|
| `src/hooks/useSidebarBadges.ts` | **New** - hook querying pending counts with realtime |
| `src/components/AppSidebar.tsx` | Add badge rendering using hook |
| `src/components/admin/AdminClients.tsx` | Insert notification on client approve/reject |
| `src/components/admin/AdminChat.tsx` | Insert notification when admin sends chat message |
| `src/components