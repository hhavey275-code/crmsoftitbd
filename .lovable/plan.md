
Issue ta clear: back dile search restore hobe, but reload dile search clear hobe.  
Current bug hocche reload detect logic (`performance/navigation`) reliable na, tai stale `sessionStorage` value abar load hocche.

## Fix Plan (Targeted)

1. **Reload-specific cleanup add করবো (hard reset)**
   - `src/pages/AdAccountsPage.tsx` এ `beforeunload` (and fallback `pagehide`) listener add করবো।
   - Reload/refresh trigger হলে এই keys clear হবে:
     - `adAccountsSearch`
     - `tiktokAccountsSearch`
     - `adAccountsTab`

2. **Back restore behavior unchanged রাখবো**
   - Back flow এ existing persisted search/tab restore হবে (user expectation অনুযায়ী)।
   - `navigate(-1)` behavior detail page এ same থাকবে।

3. **Search init logic harden করবো**
   - `AdminAdAccounts`, `ClientAdAccounts`, `AdminTikTokAccounts`, `ClientTikTokAccounts` এ initial state restore শুধু back-navigation case এ হবে।
   - Non-back entry তে explicit empty fallback রাখবো (`""`) যাতে stale value UI te na thake।

4. **Tab init logic harden করবো**
   - `AdAccountsPage` এ default tab reload/new entry তে always `"meta"` থাকবে।
   - শুধু back flow হলে saved tab restore হবে।

5. **Regression check list**
   - Search করে detail এ ঢুকে back → search + tab preserved.
   - Same অবস্থায় browser reload → search empty, tab meta, full list visible.
   - Meta + TikTok both tabs এ same behavior verify.

## Files to Update
- `src/pages/AdAccountsPage.tsx`
- `src/components/admin/AdminAdAccounts.tsx`
- `src/components/client/ClientAdAccounts.tsx`
- `src/components/admin/AdminTikTokAccounts.tsx`
- `src/components/client/ClientTikTokAccounts.tsx`

## Technical Note
Reload-clear behavior কে navigation-type detection এর ওপর পুরো depend না করে **unload lifecycle cleanup** দিয়ে deterministic করা হবে, তাই refresh এর পর stale search value আর ফিরবে না।
