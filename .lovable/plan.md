

## Meta Ad Top-Up Platform — Implementation Plan

### Design System
- Apply the Meta-inspired color palette (#0064E0 primary, #F8FAFC background, #10B981 success)
- Use Inter font throughout
- Clean, enterprise-grade UI with thin borders, subtle shadows, and snappy transitions

### Authentication & Roles
- Supabase auth with email/password login and signup
- Role-based system: **Admin** and **Client** roles stored in a `user_roles` table
- Auth-protected routes with role-based redirects
- Profiles table for user details (name, company)

### Database Tables
- **profiles** — user info (name, email, company)
- **user_roles** — role assignments (admin/client)
- **ad_accounts** — Meta ad account records linked to clients
- **wallets** — balance tracking per client
- **top_up_requests** — client submits request, admin approves/rejects
- **transactions** — ledger of all wallet movements (top-ups, ad spend deductions)
- RLS policies on all tables using `has_role()` security definer function

### Sidebar Navigation (collapsible)
- Dashboard, Wallet, Ad Accounts, Top-Up, Transaction History, Settings
- Active route highlighting, responsive (collapses on mobile)

### Admin Dashboard
- **Dashboard**: Overview cards (total clients, total platform balance, pending top-up requests) + recent activity feed
- **Wallet**: View all client wallets and balances
- **Ad Accounts**: Manage all ad accounts across clients
- **Top-Up**: Review and approve/reject pending top-up requests
- **Transaction History**: Full platform transaction log with filters
- **Settings**: Platform settings, manage users

### Client Dashboard
- **Dashboard**: Balance card, active ad accounts count, recent transactions summary
- **Wallet**: Personal balance with top-up history
- **Ad Accounts**: View own linked ad accounts
- **Top-Up**: Submit new top-up request (enter amount, upload proof of payment, select bank transfer)
- **Transaction History**: Own transaction log
- **Settings**: Profile settings

### Top-Up Flow (Manual/Bank Transfer)
1. Client submits a top-up request with amount and optional payment proof/reference
2. Request appears as "Pending" in client's view
3. Admin sees pending requests, can approve (credits wallet) or reject (with reason)
4. Transaction logged automatically on approval

### Key UI Patterns
- Metric cards with clean typography and status indicators
- Borderless tables with hover states and status badges (Active, Pending, Failed, Approved)
- Modal confirmations for approvals/rejections
- Responsive layout with constrained max-width (1440px)

