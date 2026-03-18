

## Problem Analysis

"Update from Meta" button press করলে data blank দেখাচ্ছে। কারণ:

1. **353 accounts একসাথে Meta API call** — Edge Function 60s timeout এর মধ্যে 353 × 4 = ~1,400 API calls শেষ হচ্ছে না, ফলে timeout হয়ে blank response আসছে।
2. **Billings page sync mutation** error হলে শুধু generic "Failed to update from Meta" toast দেখায়, কিন্তু cache ও update হয় না।

## Plan

### Step 1: Chunked Meta sync in BillingsPage
BillingsPage এর `syncMutation` কে modify করবো যেন 353 accounts একসাথে না পাঠিয়ে **50 accounts per batch** করে পাঠায়। প্রতিটি batch সফল হলে cache update হবে এবং UI তে progress দেখাবে (e.g., "Updating 50/353...")।

**File: `src/pages/BillingsPage.tsx`**
- `syncMutation` কে modify করে accounts কে 50 per chunk করে loop এ `get-account-insights` call করবো
- প্রতিটি chunk complete হলে `queryClient.invalidateQueries` call করে UI refresh করবো
- একটি progress state দেখাবো (e.g., "Syncing 100/353...")

### Step 2: AdAccountDetailPage error handling improve
Single account update এ সমস্যা থাকার কথা না, কিন্তু error message clearer করবো।

**File: `src/pages/AdAccountDetailPage.tsx`**
- `handleUpdateFromMeta` এর error handling এ response body parse করে specific error দেখাবো

### Step 3: Edge Function timeout prevention
Edge function এ 353 accounts একসাথে আসলে যেন early response দেয় বা properly handle করে।

**File: `supabase/functions/get-account-insights/index.ts`**
- Add a max account limit check (e.g., 100) — if more accounts sent, return error suggesting smaller batches
- This ensures the function doesn't timeout silently

## Technical Details

```text
Current Flow:
BillingsPage → 353 IDs → Edge Function → 1400+ Meta API calls → TIMEOUT

New Flow:
BillingsPage → [50 IDs] → Edge Function → ~200 calls → OK
             → [50 IDs] → Edge Function → ~200 calls → OK
             → ... (7 batches total)
             → UI shows progress "Syncing 150/353..."
```

Changes in 3 files: `BillingsPage.tsx`, `AdAccountDetailPage.tsx`, `get-account-insights/index.ts`

