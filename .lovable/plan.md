

## Problem
Ad account page এ search করে কোনো account এ click করে detail page এ গেলে, back button দিলে search state হারিয়ে যায় এবং full ad account list দেখায়।

## Solution
Search text এবং active tab (meta/tiktok) কে `sessionStorage` এ persist করো, যাতে back করলে search state restore হয়।

## Changes

### 1. `src/components/admin/AdminAdAccounts.tsx`
- `search` state initialize করো `sessionStorage` থেকে
- `search` পরিবর্তন হলে `sessionStorage` এ save করো
- Component unmount বা page leave এ clear করার দরকার নেই — back আসলে restore হবে

### 2. `src/components/client/ClientAdAccounts.tsx`
- Same pattern — sessionStorage দিয়ে search persist করো

### 3. `src/pages/AdAccountsPage.tsx`
- Active tab (meta/tiktok) sessionStorage এ persist করো যাতে back করলে সঠিক tab এ ফিরে আসে

### 4. `src/pages/AdAccountDetailPage.tsx`
- Back button এ `navigate("/ad-accounts")` এর বদলে `navigate(-1)` ব্যবহার করো, যাতে browser history preserve হয় এবং আগের page state এ ফিরে যায়

### 5. `src/components/admin/AdminTikTokAccounts.tsx` & `src/components/client/ClientTikTokAccounts.tsx`
- TikTok tab এর search ও sessionStorage এ persist করো

## Technical Detail
- SessionStorage key: `"adAccountsSearch"`, `"adAccountsTab"`, `"tiktokAccountsSearch"`
- `useState` initializer এ `sessionStorage.getItem()` দিয়ে restore
- `useEffect` দিয়ে value change এ save

