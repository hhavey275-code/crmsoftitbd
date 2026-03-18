

## Admin সব Section Mobile-Friendly করার Plan

Client-side এ যেভাবে `isMobile` দিয়ে card-based layout, compact padding, vertical stacking করা হয়েছে — সেই exact pattern follow করে Admin এর সব section optimize করবো।

### Files to Change (7 files)

#### 1. `AdminDashboard.tsx`
- **Mobile hero card**: Platform Balance gradient hero (Client Dashboard pattern)
- **2x3 compact metric grid** (Total Clients, Pending, Active, Disabled, Remaining Limit)
- **Spend card**: Date picker + result vertically stacked
- **Pie chart**: Height 250→200px on mobile
- **Top Spenders**: Compact padding (p-3), smaller icons

#### 2. `AdminAdAccounts.tsx` (816 lines — biggest change)
- Import `useIsMobile`
- **Mobile card layout** instead of table (same as `ClientAdAccounts.tsx` pattern):
  - Account name + status badge header
  - SpendProgressBar
  - 3-col insights grid (Balance, Today, Yesterday)
  - Card name + Client name row
  - Top Up action button
- **Filters**: Compact — hide Card filter on mobile, search input rounded-full
- **Header buttons**: Stack vertically, shorter labels ("Update All" vs "Update All from Meta")
- Desktop table remains unchanged

#### 3. `AdminTopUp.tsx` (633 lines)
- Import `useIsMobile`
- **Mobile card layout** for request list:
  - Client name + Status badge header
  - Amount (BDT + USD) + Bank info row
  - Payment ref + proof image thumbnail
  - Action buttons row (Approve/Hold/Reject/SMS)
  - Expandable SMS panel inside card
- **Tab bar**: Scrollable horizontal on mobile
- **Header**: Stack "Top-Up Requests" title + "Fetch Telegram" button vertically

#### 4. `AdminClients.tsx` (400 lines)
- Import `useIsMobile`
- **Mobile card layout** per client:
  - Name + company + status badge
  - Email + join date
  - Action buttons row (Approve/Deactivate/etc)
- **Search**: Full width, rounded-xl
- Desktop table unchanged

#### 5. `AdminTransactions.tsx` (98 lines)
- Import `useIsMobile`
- **Mobile card layout** (same pattern as `ClientTransactions.tsx`):
  - Direction icon (green/red circle)
  - Type + amount header
  - Description + client name
  - Date + balance after footer
- Desktop table unchanged

#### 6. `AdminWallet.tsx` (52 lines)
- Import `useIsMobile`
- **Mobile card layout** per wallet:
  - Client name + company
  - Balance prominently displayed
  - Email below
- Desktop table unchanged

#### 7. `AdminBanks.tsx` (284 lines)
- Import `useIsMobile`
- **Mobile card layout** per bank:
  - Bank name + account number
  - Branch + routing info
  - Assigned clients list
  - Edit/Delete/Assign buttons
- Desktop table unchanged

### Pattern Used (consistent across all)
```text
if (isMobile) {
  // Card-based vertical layout
  <div className="space-y-2.5">
    {items.map(item => (
      <Card className="border border-border/60 shadow-sm">
        <CardContent className="p-3">
          {/* Compact card content */}
        </CardContent>
      </Card>
    ))}
  </div>
} else {
  // Existing table layout (unchanged)
}
```

### Global mobile adjustments
- All `text-2xl` headings → `text-xl md:text-2xl`
- All `space-y-6` → `space-y-4 md:space-y-6`
- All page padding already handled