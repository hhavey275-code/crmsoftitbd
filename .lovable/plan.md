

## Plan: Notification System + Enhanced Top-Up Management

### 1. Database Migration — `notifications` table

```sql
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,          -- who receives (admin user_id)
  type text NOT NULL DEFAULT 'top_up_request',
  title text NOT NULL,
  message text,
  reference_id uuid,              -- links to top_up_requests.id
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Admins see all notifications
CREATE POLICY "Admins can manage notifications" ON public.notifications
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Clients see own notifications
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Anyone authenticated can insert (needed for client creating notification for admin)
CREATE POLICY "Authenticated can insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
```

Also create a trigger: when a `top_up_request` is inserted, auto-create a notification for all admins.

```sql
CREATE OR REPLACE FUNCTION public.notify_admins_on_topup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, reference_id)
  SELECT ur.user_id, 'top_up_request', 'New Top-Up Request',
    'A client submitted a top-up request for $' || NEW.amount,
    NEW.id
  FROM public.user_roles ur WHERE ur.role = 'admin';
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_topup_request_created
  AFTER INSERT ON public.top_up_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_topup();
```

### 2. Notification Bell — `DashboardLayout.tsx` header (admin only)

- Add a bell icon with unread count badge in the top header bar
- Clicking opens a dropdown/popover showing recent notifications
- Each notification links to `/top-up` page
- "Mark all read" button
- Subscribe to realtime `notifications` table for live updates

### 3. Enhanced `AdminTopUp.tsx`

- **Filter bar**: Tabs/buttons for All | Pending | Approved | Rejected | Hold — filters the table
- **Actions**: For pending requests, show Approve / Reject / Hold buttons
- **Hold status**: New action that sets status to "hold"
- **Rejection reason**: When rejecting, show a textarea for `admin_note` (reason), saved to `top_up_requests.admin_note`
- **Reviewer column**: Show which admin approved/rejected by fetching `reviewed_by` profile name
- Update `processMutation` to support "hold" action and save `admin_note`

### 4. Client-side visibility — `ClientTopUp.tsx`

- Add a "My Requests" history section below the form
- Show status for each request with `StatusBadge`
- For rejected requests, display the `admin_note` as the rejection reason
- For hold requests, show "On Hold" status

### 5. `StatusBadge.tsx` update

- Add `hold` status: yellow/orange color, label "On Hold"

### Files to create/modify:
- **Migration**: New `notifications` table + trigger
- `src/components/StatusBadge.tsx` — add hold
- `src/components/DashboardLayout.tsx` — notification bell with popover
- `src/components/admin/AdminTopUp.tsx` — filter bar, hold action, rejection reason, reviewer name
- `src/components/client/ClientTopUp.tsx` — request history with admin_note display

