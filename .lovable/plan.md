

## Plan: Edge Function Error কে সহজ ভাষায় দেখানো

### সমস্যা
যখন `spend-cap-update` edge function fail করে, Supabase SDK সরাসরি "Edge Function returned a non-2xx status code" দেখায় — যেটা client এর কাছে বোধগম্য না।

### সমাধান
সব জায়গায় যেখানে `supabase.functions.invoke("spend-cap-update")` call হচ্ছে, error message কে catch করে সহজ বাংলা/ইংরেজি মেসেজ দেখাবো।

### Changes

**1. Helper function তৈরি** — `src/lib/utils.ts` এ একটা function যেটা edge function error কে user-friendly message এ convert করবে:
```typescript
export function friendlyEdgeError(err: any): string {
  const msg = err?.message || String(err);
  if (msg.includes("non-2xx")) {
    return "Server error occurred. Please try again or contact admin.";
  }
  return msg;
}
```

**2. Update 3 files** যেখানে `spend-cap-update` invoke হচ্ছে:
- `src/components/client/ClientAdAccounts.tsx` (line 260) — `onError` এ `friendlyEdgeError` ব্যবহার
- `src/components/client/ClientDashboard.tsx` (line 133, 143) — error toast এ `friendlyEdgeError` ব্যবহার
- `src/pages/ClientDetailPage.tsx` — same pattern

**3. `ClientTopUp.tsx`** — `verify-topup` invoke error ও same friendly message দেখাবে

এতে client কখনো "non-2xx status code" দেখবে না, বরং "Server error occurred. Please try again or contact admin." দেখবে।

