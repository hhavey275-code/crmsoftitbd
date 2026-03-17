

## Problem

The current OCR prompt asks AI to extract "the payment amount" from bKash/bank screenshots. The AI returns the **total amount including charges** (e.g., ৳1,316.25) instead of the **base amount** (e.g., ৳1,300.00). This causes amount mismatches during auto-verification.

From the screenshots:
- Screenshot 1: Total ৳1,316.25 = ৳1,300.00 (base) + ৳16.25 (charge). The correct amount to match is **1,300**.
- Screenshot 3: Total ৳1,986.08 = ৳1,950.00 (base) + ৳36.08 (charge). The correct amount to match is **1,950**.

## Fix

Update the AI OCR prompt in `supabase/functions/verify-topup/index.ts` (line 80) to instruct the AI to:

1. Look for the **base/principal amount** (the amount before service charges/fees)
2. Ignore the total that includes charges, VAT, or service fees
3. When a breakdown like "৳1,300.00 + ৳16.25" is visible, use the first number (1,300) as the amount
4. For bank transfer screenshots, similarly extract the amount excluding any service charge or VAT

New prompt will be something like:

> "Extract the transaction reference number and the BASE payment amount (in BDT) from this payment screenshot. IMPORTANT: If the screenshot shows a breakdown like '৳1,300.00 + ৳16.25' or 'amount + charge', extract ONLY the base amount (1300), NOT the total including charges/fees/VAT. The base amount is the actual money sent, excluding any service charge, VAT, or bank fee. Return ONLY a JSON object like: {\"ref\": \"ABC123\", \"amount\": 1300}. If you cannot find a value, use empty string for ref and 0 for amount. No explanation, just JSON."

Similarly, update the Telegram SMS matching logic -- it should also match against the base amount. Currently it extracts all numbers from the SMS text, so it may already pick up the correct one, but the tolerance of ±15 BDT should help cover this.

### Files to change
- `supabase/functions/verify-topup/index.ts` -- Update the OCR prompt text (line 80)

