

# Bank Logo Upload + Client Bank Assignment + Multi-Step Top-Up Wizard

## Overview

Three changes: (1) Bank logo upload in admin, (2) "Assign Banks" button in client list, (3) Complete redesign of ClientTopUp as a 3-step wizard matching the reference screenshots.

## 1. Database: Add `logo_url` to `bank_accounts`

```sql
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS logo_url text;
```

## 2. Admin Banks — Logo Upload

**File: `src/components/admin/AdminBanks.tsx`**

- Add logo upload field in add/edit bank dialog (image file input)
- Upload to `logos` storage bucket, save public URL as `logo_url`
- Show bank logo thumbnail in bank list (both mobile cards and desktop table)
- Update `emptyForm` to include `logo_url`

## 3. Admin Clients — "Assign Banks" Button

**File: `src/components/admin/AdminClients.tsx`**

- Add a "Banks" action button per client row (both mobile card and desktop table)
- Opens a dialog showing:
  - Currently assigned banks with unassign option
  - Dropdown to assign new banks (from active `bank_accounts`)
- Reuses same `client_banks` table logic already in AdminBanks

## 4. Client Top-Up — Multi-Step Wizard Redesign

**File: `src/components/client/ClientTopUp.tsx`**

Complete redesign into a stepped wizard matching the reference screenshots:

```text
Step Progress Bar: ① Select Method → ② Select Bank → ③ Payment Details → ④ Review & Submit
```

**Header Bar**: Current Balance (USD) + Conversion Rate display (persistent across all steps)

**Step 1 — Select Payment Method**:
- 3 cards: Online Bank Transfer, ATM Deposit, Cash Deposit
- Click to select and advance to Step 2

**Step 2 — Select Bank**:
- Grid of bank cards (like reference image) showing:
  - Bank logo (from `logo_url`)
  - Bank name, account holder name
  - Account details (number, branch, reference ID)
  - "Select This Account" button
- Back button to Step 1

**Step 3 — Payment Details**:
- Selected bank info card at top (Payment To section)
- BDT amount input with live USD conversion
- Minimum amount hint
- Transaction Reference field (hidden for cash deposit)
- Payment Screenshot upload (drag/drop/paste)
- "Back" and "Continue to Review" buttons

**Step 4 — Review & Submit**:
- Payment Method summary
- Selected bank details card
- Payment Details (BDT, USD, reference)
- Screenshot preview
- "Edit Payment Details" and "Confirm & Submit" buttons

All existing logic preserved: wallet check, auto-verification retry, realtime subscription, proof upload.

## Files Modified

| File | Change |
|------|--------|
| **Migration** | Add `logo_url text` to `bank_accounts` |
| `src/components/admin/AdminBanks.tsx` | Logo upload in add/edit form, show logo in list |
| `src/components/admin/AdminClients.tsx` | Add "Assign Banks" action button + dialog |
| `src/components/client/ClientTopUp.tsx` | Full rewrite as 4-step wizard |

## Request History Table

The "My Requests" history table at the bottom remains unchanged — still shows after the wizard.

