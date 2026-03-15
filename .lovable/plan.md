

## Plan: Multiple Feature Implementation

This is a large set of changes spanning 6 distinct features. Here's the plan broken into sections.

---

### 1. Replace Header Text with Scrolling Announcement Ticker

**What**: Remove the static "Meta Ad Top-Up" text from the header bar and replace it with a CSS marquee-style scrolling announcement that clients can see. Admins configure the text from Settings.

**How**:
- Add a new `site_settings` key `"header_announcement"` (no DB migration needed — `site_settings` already supports arbitrary key-value pairs)
- Update `useSiteSettings` hook to fetch `header_announcement`
- In `DashboardLayout.tsx`, replace the `<span>Meta Ad Top-Up</span>` with a `<marquee>`-style CSS animation showing the announcement text (using CSS `@keyframes` for smooth scrolling)
- Add a new "Header Announcement" card in `SettingsPage.tsx` (admin-only) with a textarea input to set the ticker text

---

### 2. Welcome Message on Client Dashboard

**What**: When a client logs in, show a welcome greeting on their dashboard.

**How**:
- In `ClientDashboard.tsx`, add a welcome banner at the top: "Welcome back, {profile.full_name}!" with a subtle card/gradient style
- Show current date and a friendly message

---

### 3. Notification Sound

**What**: Play a sound when a new notification arrives. Sound can be toggled on/off from Settings.

**How**:
- Add a `site_settings` key `"notification_sound_enabled"` (per-user preference stored in `localStorage` since it's a client-side preference)
- In `NotificationBell.tsx`, inside the realtime subscription callback, play an audio beep using `new Audio()` with a base64-encoded short notification sound
- In `SettingsPage.tsx`, add a "Notification Sound" toggle (Switch component) that reads/writes to `localStorage`

---

### 4. Client Signup Approval System

**What**: When a new client signs up, they go into a "pending" state. Admin must approve them before they can use the platform.

**How**:
- **DB Migration**: The `profiles` table already has a `status` column (default `'active'`). Change the default to `'pending'` so new signups start as pending
- **Auth flow**: In `ProtectedRoute.tsx`, after checking `user` exists, also check `profile.status`. If `"pending"`, show a "Your account is pending approval" screen instead of the dashboard
- **Admin UI**: In `AdminClients.tsx`, add a tab/filter for "Pending Approval" clients. Add an "Approve" button that sets status to `"active"`
- **Auth page**: Update signup success message to say "Account created! Please wait for admin approval."

---

### 5. Super Admin Role & Menu Access Control

**What**: Add a `superadmin` role. Superadmin can promote clients to admin and control which menu items each admin can access.

**How**:
- **DB Migration**: 
  - Add `'superadmin'` to the `app_role` enum
  - Create a `menu_permissions` table: `id, user_id, menu_key text, granted boolean, created_at`
  - Add RLS: superadmin can manage all, users can read their own
- **Update your role**: Run a migration to set your current user's role to `superadmin`
- **Auth Context**: Update to recognize `superadmin` as having admin-level access (superadmin is a superset of admin)
- **Sidebar**: For admin users (not superadmin), filter `navItems` based on their `menu_permissions`
- **Admin UI**: Add a section in client detail or a new management area where superadmin can:
  - Promote a client to `admin` role
  - Toggle menu access checkboxes for each admin user
- **Navigation**: Superadmin sees all menus. Admin sees only permitted menus. Client sees client menus.

---

### 6. Password Change in Settings

**What**: Allow clients (and all users) to change their password from the Settings page.

**How**:
- In `SettingsPage.tsx`, add a "Change Password" card with two fields: new password and confirm password
- Use `supabase.auth.updateUser({ password: newPassword })` to update the password
- Show success/error toast

---

### Files to Create/Modify

| File | Action |
|------|--------|
| `src/hooks/useSiteSettings.ts` | Add `headerAnnouncement` field |
| `src/components/DashboardLayout.tsx` | Replace text with scrolling ticker |
| `src/components/client/ClientDashboard.tsx` | Add welcome banner |
| `src/components/NotificationBell.tsx` | Add sound playback on new notification |
| `src/pages/SettingsPage.tsx` | Add announcement, sound toggle, password change cards |
| `src/components/ProtectedRoute.tsx` | Add pending approval check |
| `src/pages/Auth.tsx` | Update signup message |
| `src/components/admin/AdminClients.tsx` | Add pending tab + approve button |
| `src/contexts/AuthContext.tsx` | Handle superadmin role |
| `src/components/AppSidebar.tsx` | Filter menus by permissions for admin users |
| DB Migration | Change profiles default status, add superadmin enum, create menu_permissions table |

### Database Migrations Needed

```sql
-- 1. Change default profile status to 'pending'
ALTER TABLE public.profiles ALTER COLUMN status SET DEFAULT 'pending';

-- 2. Add superadmin to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superadmin';

-- 3. Create menu_permissions table
CREATE TABLE public.menu_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  menu_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, menu_key)
);
ALTER TABLE public.menu_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage menu_permissions" ON public.menu_permissions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Users can view own permissions" ON public.menu_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
```

