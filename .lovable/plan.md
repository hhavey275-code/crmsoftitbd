

## Plan: Sidebar Menu Reorder, Remove Wallet, Bigger Logo Area, Site Name Setting

### Changes

**1. `src/components/AppSidebar.tsx` — Reorder menu & remove Wallet**

New admin menu order:
1. Dashboard
2. Ad Accounts
3. Business Managers
4. Top-Up (rename label to "Top-Up Request")
5. Transactions
6. Settings

Remove Wallet from both admin and client nav. Client keeps same items minus Wallet.

Make logo/name section bigger: increase icon to `h-12 w-12`, name text to `text-base`, add more vertical padding (`py-6 mt-4`).

Also fetch `site_name` from `useSiteSettings` and display it instead of hardcoded "Meta Ad Top-Up".

**2. `src/hooks/useSiteSettings.ts` — Fetch site_name too**

Add `siteName` state, fetch `site_settings` where key = `site_name` alongside logo. Return `siteName` from hook.

**3. `src/pages/SettingsPage.tsx` — Add Site Name field (admin only)**

Add a new "Site Name" card for admins to change the platform name. Upserts `site_settings` with key `site_name`.

**4. `src/App.tsx` — Remove Wallet route**

Remove the `/wallet` route import and route entry.

**5. Delete `src/pages/WalletPage.tsx`** — No longer needed.

---

### File Summary

| File | Action |
|------|--------|
| `src/components/AppSidebar.tsx` | Reorder nav, remove Wallet, enlarge logo area, use dynamic site name |
| `src/hooks/useSiteSettings.ts` | Add `siteName` fetch |
| `src/pages/SettingsPage.tsx` | Add Site Name setting card for admin |
| `src/App.tsx` | Remove `/wallet` route |
| `src/pages/WalletPage.tsx` | Delete |

