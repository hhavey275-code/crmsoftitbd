

## Ad Account Detail Page — Real-time Performance Metrics

### What We're Building
When a client clicks on an ad account row, the detail page (`/ad-accounts/:id`) will show 4 performance metric boxes:
1. **Running Campaigns** — active campaign count
2. **Today's Spend** — total budget spent today (with yesterday comparison)
3. **Today's Orders** — total website purchases today (with yesterday comparison)
4. **Today's Messages** — total messaging conversations started today (with yesterday comparison)

Plus an **"Update from Meta"** button to fetch live data on demand.

---

### Changes

#### 1. Update Edge Function (`get-account-insights`)
- Add a new Meta API call to fetch **active campaigns count**: `GET /{actId}/campaigns?filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE"]}]&summary=true&limit=0`
- Add **messaging conversations** extraction from the `actions` array — action types: `onsite_conversion.messaging_conversation_started_7d`, `onsite_conversion.messaging_first_reply`
- Store `active_campaigns`, `today_messages`, `yesterday_messages` in the response and DB cache

#### 2. Database Migration
- Add columns to `ad_account_insights`:
  - `active_campaigns` (integer, default 0)
  - `today_messages` (integer, default 0)
  - `yesterday_messages` (integer, default 0)

#### 3. Update Ad Account Detail Page (`AdAccountDetailPage.tsx`)
- Fetch insights for the single account (from cache first)
- Add 4 `MetricCard` boxes in a grid above the existing cards:
  - Running Campaigns (icon: `Megaphone`)
  - Today's Spend (icon: `DollarSign`)
  - Today's Orders (icon: `ShoppingCart`)
  - Today's Messages (icon: `MessageSquare`)
- Add "Update from Meta" button that calls the edge function with `source: "meta"` for this single account ID, then refreshes the data
- Show last updated timestamp

#### 4. Deploy Edge Function
- Deploy the updated `get-account-insights` function after code changes

