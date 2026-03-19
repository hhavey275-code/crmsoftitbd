

## Plan: OCR-based BDT Payment Recording from Screenshot

### What it does
Add a new button "OCR BDT Payment" to the seller detail section. When clicked, admin can upload or paste (Ctrl+V) a payment screenshot. The image is sent to an Edge Function that uses Lovable AI (Gemini Flash) to OCR-extract the BDT amount and transaction date. The extracted data is shown for confirmation, then saved as a `bdt_payment` entry in `seller_transactions` with the screenshot stored as `proof_url`.

### Steps

1. **Create Edge Function `supabase/functions/ocr-seller-payment/index.ts`**
   - Accepts `{ image_url: string }` (public URL from payment-proofs bucket)
   - Calls Lovable AI Gateway with the image asking to extract: BDT amount, transaction date, and any reference/TrxID
   - Returns `{ bdt_amount, date, reference }` as JSON

2. **Update `AdminSellers.tsx`**
   - Add "OCR BDT Payment" button next to existing "Record BDT Payment"
   - New dialog with:
     - Image upload area (file picker + Ctrl+V paste support, uploads to `payment-proofs` bucket)
     - After upload, calls `ocr-seller-payment` edge function
     - Shows extracted BDT amount, date, and reference (editable fields for correction)
     - On confirm, inserts into `seller_transactions` with `type: "bdt_payment"`, the extracted `bdt_amount`, `description` with reference, `proof_url` pointing to the uploaded image, and `created_at` set to the extracted date

### Technical Details

- Reuses existing `payment-proofs` storage bucket (already public)
- AI model: `google/gemini-2.5-flash` (same as verify-topup, good for OCR)
- Edge function uses `LOVABLE_API_KEY` (already configured)
- The `seller_transactions.created_at` has a default of `now()` — the insert will explicitly pass the OCR-extracted date so ledger reflects actual payment date
- No database migration needed — existing `seller_transactions` table has all required columns (`bdt_amount`, `proof_url`, `description`, `created_at`)

