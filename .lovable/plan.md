

## Invoice Generation for Approved Top-Up Requests

### Overview
When a top-up request is approved, generate a downloadable PDF-style invoice. The invoice will include SOFT IT BD company details, client business info, and the top-up amount as "Meta ads top up".

### Database Changes
- Add `invoices` table: `id`, `top_up_request_id`, `invoice_number` (auto-incrementing like `INV-0001`), `user_id`, `amount`, `bdt_amount`, `usd_rate`, `created_at`
- Create a DB function to auto-generate sequential invoice numbers

### Assets
- Copy uploaded `LOGO.png` → `public/images/company-logo.png`
- Copy uploaded `my_signature-removebg-preview.png` → `public/images/ceo-signature.png`

### New Component: `InvoicePage.tsx`
A printable/downloadable invoice page at route `/invoice/:requestId` containing:

**Header**: Company logo + company details
- SOFT IT BD
- South Bepari Para, Agrabad, Chittagong
- Mobile: 01629344993

**Client Section** (from `profiles` table):
- Business Name (`company` field)
- Phone (`phone` field)

**Invoice Details**:
- Invoice Number (auto-generated)
- Date (approval date)
- Description: "Meta ads top up"
- Amount in USD and BDT with rate

**Footer**:
- CEO signature image
- "CEO - SOFT IT BD"

**Print/Download button** using `window.print()` with print-optimized CSS

### Integration Points
1. **Client Top-Up history**: Add "Invoice" button/link next to approved requests → opens `/invoice/:requestId`
2. **Admin Top-Up table**: Same invoice link for approved requests
3. **Auto-approve flow** (`verify-topup`): Create invoice record after approval
4. **Manual approve flow** (`AdminTopUp`): Create invoice record after admin approves

### Files to Create/Modify
- `public/images/company-logo.png` — copy from upload
- `public/images/ceo-signature.png` — copy from upload
- `src/pages/InvoicePage.tsx` — new printable invoice page
- `src/App.tsx` — add `/invoice/:requestId` route
- `src/components/client/ClientTopUp.tsx` — add invoice button for approved requests
- `src/components/admin/AdminTopUp.tsx` — add invoice button for approved requests
- DB migration — create `invoices` table + auto-number function

