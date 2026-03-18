

## Plan: Business Managers + Admin Clients Page Mobile Optimization

### 1. `AdminBusinessManagers.tsx` — Mobile-friendly card layout

Currently the BM page has no mobile optimization (no `useIsMobile`). Changes:

**Header area (mobile)**
- Stack title + buttons vertically
- Shorter button labels: "Sync All" → icon-only, "Connect BM" → "Add BM"
- Hide "Encrypt Tokens" button on mobile (keep in overflow or remove)

**BM Cards (mobile)**
- Each BM card: compact header with BM name + status badge + account count
- Chevron + Building2 icon smaller
- Action buttons row: icon-only buttons (Edit, Delete, Logs, Sync) in a horizontal row with smaller sizing
- Last synced info below name in smaller text

**Expanded account list (mobile)**
- Replace table with card-based layout matching ClientDashboard pattern:
  - Account name + Status badge header
  - Progress bar (Remaining balance)
  - Spent/Limit row
  - Assigned To dropdown (full width)

**Import Dialog (mobile)**
- Make it full-screen on mobile (`max-w-full h-full` or `sm:max-w-3xl`)
- Card-based import list instead of table

### 2. `AdminClients.tsx` — Match ClientDashboard design

Currently has basic mobile cards. Update to match ClientDashboard's premium design:

**Add summary metrics at top (mobile)**
- Hero card: Total Clients count with gradient
- 3-column compact grid: Active / Pending / Inactive counts

**Client cards redesign**
- Match the ClientDashboard card style with cleaner spacing
- Name + status on first line
- Company + email + join date below
- Action buttons in a cleaner bottom row with gradient style buttons (like ClientDashboard's "Top Up" button style)

### Files Changed

| File | Change |
|------|--------|
| `AdminBusinessManagers.tsx` | Add `useIsMobile`, mobile header, mobile BM cards, mobile account cards inside expanded BM, mobile import dialog |
| `AdminClients.tsx` | Add hero metrics section, redesign mobile cards to match ClientDashboard premium style |

