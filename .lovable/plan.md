## Add Payment Method Types: ATM Deposit & Cash Deposit

### Overview

Add two new payment methods alongside the existing Online Bank Transfer. The client selects a method first, then fills method-specific fields. The verification logic adapts per method.

### Payment Methods


| Method               | Ref Required | OCR Checks                        | Telegram Match            |
| -------------------- | ------------ | --------------------------------- | ------------------------- |
| Online Bank Transfer | Yes          | ref + amount                      | last4 + amount (existing) |
| ATM Deposit          | Yes          | date, account number, amount, ref | last4 + amount            |
| Cash Deposit         | No           | account number + amount+date      | last4 + amount            |


### File Changes

**1. `src/components/client/ClientTopUp.tsx**`

- Add `paymentMethod` state (`online_transfer` / `atm_deposit` / `cash_deposit`)
- Render a payment method selector (radio group or select) before bank selection
- Hide Payment Reference field when `cash_deposit` is selected
- Pass `payment_method` value to the insert call (currently hardcoded as `bank_transfer`)
- Map: `online_transfer` -> `bank_transfer`, `atm_deposit` -> `atm_deposit`, `cash_deposit` -> `cash_deposit`

**2. `supabase/functions/verify-topup/index.ts**`

- Read `payment_method` from the request record
- Branch OCR prompt by method:
  - **atm_deposit**: Ask AI to extract date, account number, deposit amount, ref, and confirm "ATM Transfer Credit" text exists. Return `{"ref":"...", "amount":..., "account_number":"...", "date":"...", "is_atm_credit": true/false}`. Match OCR account_number last4 against bank last4, match amount, match ref, verify is_atm_credit=true.
  - **cash_deposit**: Ask AI to extract account number and deposit amount only. Return `{"amount":..., "account_number":"..."}`. Match OCR account_number last4 against bank last4, match amount. Skip ref matching entirely.
  - **bank_transfer** (default): Existing OCR logic unchanged.
- Telegram matching: For atm_deposit and cash_deposit, use the same last4 + amount matching as current bank transfers (not mobile agent trnxID flow).
- Decision logic per method:
  - `bank_transfer`: existing logic
  - `atm_deposit`: OCR (ref + amount + account + atm_credit) AND Telegram match
  - `cash_deposit`: OCR (amount + account) AND Telegram match (no ref required)

### No DB Migration Needed

The `payment_method` column already exists on `top_up_requests` as text with default `bank_transfer`.