

## Plan: Admin Top-Up Table Redesign + Telegram Auto-Verification

### Overview
Two parts: (1) Redesign the admin top-up table with new columns, (2) Set up Telegram bot polling to read bank messages and auto-approve matching requests.

---

### Part 1: Redesign Admin Top-Up Table

**Current columns:** Client, BDT Amount, Rate, USD Amount, Reference, Status, Reviewed By, Date, Actions

**New columns:**
| SL | Bank Account | Client Name | Amount (BDT) | Transaction Ref | Payment Proof | Status | Processed By | Actions |
|----|-------------|-------------|---------------|-----------------|---------------|--------|-------------|---------|

- **SL**: Serial number (row index)
- **Bank Account**: Bank name + account number (fetched via `bank_account_id` → `bank_accounts` table join)
- **Client Name**: From profiles
- **Amount**: BDT amount (with USD in smaller text)
- **Transaction Ref**: `payment_reference` field
- **Payment Proof**: Clickable thumbnail/icon that opens the screenshot in a dialog (NOT inside the approve dialog)
- **Status**: StatusBadge
- **Processed By**: Reviewer name
- **Actions**: Approve/Hold/Reject buttons

**File:** `src/components/admin/AdminTopUp.tsx` — rewrite query to join `bank_accounts` via `bank_account_id`, update table columns, add image preview dialog.

---

### Part 2: Telegram Auto-Verification System

#### Step 1: Connect Telegram Bot
- Use Telegram connector to link your bot token
- This provides `TELEGRAM_API_KEY` secret

#### Step 2: Database Tables (Migration)
```sql
-- Store Telegram polling state
CREATE TABLE telegram_bot_state (
  id int PRIMARY KEY CHECK (id = 1),
  update_offset bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO telegram_bot_state (id, update_offset) VALUES (1, 0);

-- Store incoming Telegram messages from bank group
CREATE TABLE telegram_messages (
  update_id bigint PRIMARY KEY,
  chat_id bigint NOT NULL,
  text text,
  raw_update jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

#### Step 3: Edge Function — `telegram-poll`
- Runs via pg_cron every minute
- Long-polls Telegram `getUpdates` for ~55 seconds
- Stores bank notification messages in `telegram_messages` table

#### Step 4: Edge Function — `verify-topup`
- Triggered when a new top-up request is submitted (called from client after insert)
- Reads the request: `payment_reference`, `bdt_amount`, `bank_account_id`
- Gets bank account's last 4 digits from `bank_accounts` table
- Uses AI (Gemini Flash) to extract ref number and amount from the payment proof screenshot
- Searches `telegram_messages` (within ±15 min window) for messages containing:
  - Matching last 4 digits of bank account
  - Matching BDT amount
- If **all 3 match** (screenshot ref = submitted ref, screenshot amount = submitted amount, telegram message has same last 4 digits + amount) → auto-approve + add wallet balance + create transaction
- If no match → leave as pending for manual review

#### Step 5: Trigger from Client
- After successful top-up request submission in `ClientTopUp.tsx`, call `supabase.functions.invoke('verify-topup', { body: { request_id } })`
- This kicks off the verification asynchronously

---

### Match Logic Summary
```text
Client submits: payment_ref, bdt_amount, bank_account_id, proof_screenshot

Step 1: AI reads screenshot → extracts ref_number, amount
Step 2: Verify screenshot ref == submitted payment_ref
Step 3: Verify screenshot amount == submitted bdt_amount  
Step 4: Get bank account last 4 digits from bank_accounts table
Step 5: Search telegram_messages for message with:
        - same last 4 digits
        - same amount
        - within ±15 min of request time
Step 6: All match → auto-approve
```

---

### Files to Create/Modify
1. **`src/components/admin/AdminTopUp.tsx`** — Redesign table, add proof image dialog
2. **`supabase/functions/telegram-poll/index.ts`** — New: poll Telegram messages
3. **`supabase/functions/verify-topup/index.ts`** — New: AI OCR + Telegram match + auto-approve
4. **`src/components/client/ClientTopUp.tsx`** — Call verify-topup after submission
5. **`supabase/config.toml`** — Register new edge functions
6. **Database migration** — Add `telegram_bot_state` and `telegram_messages` tables
7. **pg_cron schedule** — Poll telegram every minute

### Prerequisites
- Need to connect Telegram bot (connector setup)
- `LOVABLE_API_KEY` already available for AI OCR

