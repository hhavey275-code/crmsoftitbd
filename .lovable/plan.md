

## Plan: Ad Account Detail Page Mobile Fix + System Log Menu

### Issue 1: Ad Account Detail Page Mobile View
AdAccountDetailPage এর header section (`flex items-center justify-between`) mobile এ overflow হচ্ছে কারণ "Back to Ad Accounts" button এবং "Update from Meta" button একই row তে fit হচ্ছে না। এছাড়া metric cards এর grid ও ঠিকমতো responsive না হতে পারে।

**Fix:**
- Header row কে mobile এ `flex-col` করবো (back button উপরে, update button নিচে)
- "Back to Ad Accounts" text mobile এ শুধু "Back" করবো
- Account header card এর rename input width mobile এ adjust করবো
- Grid sections mobile friendly করবো (`grid-cols-1` on small screens)

**File:** `src/pages/AdAccountDetailPage.tsx`

---

### Issue 2: System Log Menu + Feature

একটি নতুন **System Log** page তৈরি করবো যেখানে CRM এর সব activity log থাকবে — কে, কখন, কী করেছে।

**Database:**
- নতুন `system_logs` table তৈরি করবো:
  - `id`, `user_id`, `user_name`, `action` (text), `details` (text), `created_at`
- RLS: Admin/Superadmin can view all, clients can view own logs
- Edge function বা trigger দিয়ে important actions log করবো (top-up approve/reject, ad account assign, spend cap update, etc.)

**UI:**
- নতুন `SystemLogsPage.tsx` — table view with filters (date range, user, action type)
- প্রতিটি row তে: Time, User Name, Action, Details
- Admin sidebar এ "System Log" menu add করবো (Settings এর আগে)

**Logging Points (initially):**
- Top-up request approve/reject
- Spend cap update
- Ad account assign/unassign
- Client status change
- Bank account add/edit

**Files to create/modify:**

| File | Change |
|------|--------|
| `src/pages/AdAccountDetailPage.tsx` | Mobile responsive fix |
| Migration | Create `system_logs` table with RLS |
| `src/pages/SystemLogsPage.tsx` | **New** — Log viewer page |
| `src/App.tsx` | Add `/system-logs` route |
| `src/components/AppSidebar.tsx` | Add "System Log" menu item |
| Edge functions (verify-topup, spend-cap-update, etc.) | Add log insert calls |

