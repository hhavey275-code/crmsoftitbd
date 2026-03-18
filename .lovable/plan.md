

## Plan: Ad Account & Business Manager Request System

### Overview
Build a request system where clients can request new ad accounts and BM partner access. Admins review, assign/approve, and the system handles the rest.

### Database Changes (2 new tables via migration)

**1. `ad_account_requests` table**
- `id` uuid PK
- `user_id` uuid (requester)
- `account_name` text
- `email` text
- `business_manager_id` text (Meta BM ID)
- `monthly_spend` text
- `start_date` text
- `status` text (pending/approved/rejected) default 'pending'
- `assigned_ad_account_id` uuid nullable (admin assigns an existing ad account)
- `admin_note` text nullable
- `reviewed_by` uuid nullable
- `created_at`, `updated_at` timestamps

RLS: Clients see own requests, admins see all + manage.

**2. `bm_access_requests` table**
- `id` uuid PK
- `user_id` uuid (requester)
- `ad_account_id` uuid (which ad account)
- `bm_name` text
- `bm_id` text (Meta BM ID)
- `status` text (pending/approved/rejected) default 'pending'
- `admin_note` text nullable
- `reviewed_by` uuid nullable
- `created_at`, `updated_at` timestamps

RLS: Clients see own requests, admins see all + manage.

### Frontend Changes

**3. Client Dashboard — "Request New Ad Account" button**
- Add a button in `ClientDashboard.tsx`
- Opens a dialog form: Account Name, Email, Business Manager ID, Monthly Approx Spending, Start Date
- Submits to `ad_account_requests` table

**4. Client Ad Accounts — Three-dot menu with "BM Request"**
- In `ClientAdAccounts.tsx`, add a DropdownMenu (three dots) on each ad account row
- "Request BM Access" option opens a dialog form: BM Name, BM ID
- Submits to `bm_access_requests` table with the ad_account_id

**5. New page: Requests Page (`/requests`)**
- Admin-only page with two tabs: "Ad Account Requests" and "BM Access Requests"
- **Ad Account Requests tab**: Shows pending requests. Admin can search/select an existing ad account from the system, assign it, and approve. On approval, the ad account gets assigned to the client via `user_ad_accounts`.
- **BM Access Requests tab**: Shows pending BM requests. Admin approves → calls `manage-ad-account-partners` edge function (or a new edge function) to add partner access via Meta API.

**6. Sidebar update**
- Add "Requests" menu item for both admin (to manage) and client (to view own)
- Add notification badge for pending requests (admin side)

**7. Notifications**
- When client submits a request → notify admins
- When admin approves/rejects → notify client

### Edge Function (for BM partner access approval)

**8. New edge function or extend `manage-ad-account-partners`**
- Add an `add_partner` action that calls Meta Graph API: `POST /{act_id}/agencies?business={bm_id}&permitted_tasks=['ADVERTISE']` to grant partial access

### Technical Details

- Ad account request approval flow: Admin searches existing ad accounts → selects one → assigns to client (insert into `user_ad_accounts`) → updates request status to 'approved'
- BM access approval flow: Admin approves → edge function calls Meta API to add partner BM with partial (ADVERTISE) access → updates request status to 'approved'
- Both request tables get realtime enabled for live badge updates

