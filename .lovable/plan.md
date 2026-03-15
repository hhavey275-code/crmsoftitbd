

## Plan: Bank System, USD Rate, Sidebar Spacing & Dashboard Improvements

### Summary
1. Move sidebar logo section down with more top padding
2. Make dashboard metric boxes more colorful (gradient backgrounds)
3. Add bank accounts system — admin creates banks, assigns to clients for payment
4. Add USD rate setting — admin sets BDT→USD rate, client pays in BDT, converted to USD in wallet
5. Show USD rate on dashboard

---

### Database Changes

**New table `bank_accounts`** — admin-managed bank details:
```sql
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name text NOT NULL,
  account_name text NOT NULL,
  account_number text NOT NULL,
  branch text,
  routing_number text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage banks" ON public.bank_accounts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view active banks" ON public.bank_accounts FOR SELECT TO authenticated USING (status = 'active');
```

**New table `client_banks`** — junction table assigning banks to clients:
```sql
CREATE TABLE public.client_banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now(),
  UNIQUE(user_id, bank_account_id)
);
ALTER TABLE public.client_banks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage client_banks" ON public.client_banks FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own banks" ON public.client_banks FOR SELECT TO authenticated USING (user_id = auth.uid());
```

**USD rate** — stored in existing `site_settings` table with key `usd_rate` (e.g., value "120" meaning 1 USD = 120 BDT).

**Modify `top_up_requests`** — add columns for BDT workflow:
```sql
ALTER TABLE public.top_up_requests 
  ADD COLUMN IF NOT EXISTS bdt_amount numeric,
  ADD COLUMN IF NOT EXISTS usd_rate numeric,
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES public.bank_accounts(id);
```

---

### File Changes

| File | Change |
|------|--------|
| `src/components/AppSidebar.tsx` | Add `mt-4` padding above logo section to push it down |
| `src/components/admin/AdminDashboard.tsx` | Add gradient/colorful backgrounds to metric cards; add USD Rate metric box |
| `src/components/client/ClientDashboard.tsx` | Add USD Rate display box |
| `src/components/admin/AdminBanks.tsx` | **New** — Admin CRUD for bank accounts + assign banks to clients |
| `src/components/client/ClientTopUp.tsx` | Rework: show assigned banks, client enters BDT amount, auto-converts to USD using rate, uploads proof, submits top-up request to add wallet balance |
| `src/components/admin/AdminTopUp.tsx` | Update: on approval, add USD amount to client wallet (not deduct), create transaction |
| `src/pages/BanksPage.tsx` | **New** — page for bank management |
| `src/App.tsx` | Add `/banks` route |
| `src/components/AppSidebar.tsx` | Add "Banks" nav item for admin |
| `src/pages/SettingsPage.tsx` | Add USD Rate setting card for admin |

### Flow

**Admin side:**
1. Admin adds bank accounts in Banks page (bank name, account name, number, branch)
2. Admin assigns specific banks to specific clients
3. Admin sets USD rate in Settings (e.g., 1 USD = 120 BDT)
4. When client submits top-up request with BDT payment proof, admin approves → wallet balance increases by converted USD amount

**Client side:**
1. Client sees assigned banks with payment details
2. Client enters BDT amount, sees auto-calculated USD equivalent
3. Client uploads payment proof and submits top-up request
4. On admin approval, wallet balance increases

**Top-up to ad account (existing flow stays):**
- When client requests ad account top-up, wallet balance deducts and spend cap increases via Meta API

### Metric Cards Enhancement
Add subtle gradient backgrounds to each metric card for a more colorful look:
- Total Clients: blue gradient
- Platform Balance: green gradient  
- Pending Top-Ups: orange gradient
- Active Accounts: emerald gradient
- Disabled Accounts: red gradient
- Remaining Limit: purple gradient
- USD Rate: cyan gradient (new)

