

## Plan: Seller Module — Dashboard, Ledger & Auto Bank Sync

### Overview

Add a new **Seller** role to the platform. Sellers provide USDT to the admin and receive BDT in return. They get a dashboard showing their transaction history and due/advance balance. When clients pay to a seller's assigned bank (approved top-ups), it auto-updates the seller's ledger.

### Data Model

**1. Add `seller` to `app_role` enum:**
```sql
ALTER TYPE public.app_role ADD VALUE 'seller';
```

**2. New `seller_transactions` table:**

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| seller_id | uuid | References profiles.user_id |
| type | text | `usdt_received`, `bdt_payment`, `client