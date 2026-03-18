

## Plan: Web Push Notifications for Mobile (Lock Screen)

### Is it possible?
Yes — using the **Web Push API** with your existing PWA setup. When a user installs the PWA (or grants notification permission in the browser), they will receive push notifications in their phone's notification bar even when the app is closed or screen is locked. This works on **Android** fully. On **iOS**, it works for PWAs added to the home screen (iOS 16.4+).

### How it works

```text
Client approves/rejects request
        ↓
  Insert into notifications table (existing)
        ↓
  Database trigger calls Edge Function via pg_net
        ↓
  Edge Function sends Web Push to client's device
        ↓
  Service Worker shows native notification on phone
```

### Changes Required

**1. New DB table: `push_subscriptions`**
- `id`, `user_id`, `endpoint` (text), `p256dh` (text), `auth` (text), `created_at`
- Stores each user's push subscription per device
- RLS: Users can manage own subscriptions, admins can read all

**2. Generate VAPID keys (one-time secret)**
- Need to generate a VAPID key pair and store as secrets (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`)
- Public key goes in frontend code, private key stays in edge function

**3. New Edge Function: `send-push-notification`**
- Accepts `user_id`, `title`, `message`, `url`
- Fetches all push subscriptions for that user
- Sends Web Push using the `web-push` library (or raw fetch with VAPID signing)

**4. Database trigger: `notify_push_on_insert`**
- On INSERT into `notifications` table, calls the `send-push-notification` edge function via `pg_net`
- This means every notification (top-up approval/reject, ad account request, BM request, etc.) automatically triggers a push

**5. Frontend: Push subscription flow**
- Add a `usePushNotifications` hook that:
  - Checks if push is supported
  - Requests notification permission
  - Subscribes to push via service worker
  - Saves subscription to `push_subscriptions` table
- Integrate into `NotificationBell.tsx` or app layout — prompt user to enable push on first visit

**6. Custom Service Worker addition**
- Add push event listener to handle incoming push messages
- Show native notification with title, body, icon
- Handle notification click to open the relevant page

### Important Notes
- **Android**: Works perfectly — notifications appear in notification bar even when screen locked
- **iOS**: Works only when PWA is installed to home screen (iOS 16.4+). Safari browser alone does NOT support Web Push
- Need to add `web-push` npm package or implement raw VAPID signing in the edge function (Deno compatible)
- The VAPID public key needs to be stored as a site setting or environment variable accessible to the frontend

### Files to Create/Edit
- **New**: `push_subscriptions` table (migration)
- **New**: `supabase/functions/send-push-notification/index.ts`
- **New**: `src/hooks/usePushNotifications.ts`
- **New**: `public/sw-push.js` (or extend existing SW config)
- **Edit**: `src/components/NotificationBell.tsx` — add push permission prompt
- **Edit**: `vite.config.ts` — configure custom SW injection for push handler
- **New**: Database trigger on `notifications` table INSERT → call edge function

