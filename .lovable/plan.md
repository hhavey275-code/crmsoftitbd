

## Plan: Auth Page Welcome Note + Top-Up Layout Fix + Duplicate Reference Prevention

### 1. Auth Page — Dynamic Welcome Note from Settings
- Fetch `welcome_title` and `welcome_note` from `site_settings` via `useSiteSettings`
- Replace hardcoded "Welcome" title and description with dynamic values
- If not set, fallback to current defaults

### 2. Admin Settings — Welcome Note Configuration
- Add a new card in `SettingsPage.tsx` (admin-only) with:
  - **Welcome Title** input (e.g. "Welcome to Our Platform")
  - **Welcome Note** textarea (e.g. "Sign in to manage your ad accounts")
- Save as `welcome_title` and `welcome_note` keys in `site_settings`

### 3. `useSiteSettings` — Add New Keys
- Add `welcomeTitle` and `welcomeNote` to the hook
- Fetch `welcome_title` and `welcome_note` alongside existing keys

### 4. Client Top-Up Page — Better Layout
- Change the form from single-column `max-w-lg` to a two-column grid layout
- Left column: Bank selection, BDT amount, USD equivalent, submit button
- Right column: Payment Reference input + Payment Screenshot upload
- This eliminates the wasted right-side space

### 5. Duplicate Payment Reference Prevention
- In `AdminTopUp.tsx`, when admin clicks "Approve":
  - Before processing, query `top_up_requests` for any **other** request with the same `payment_reference` that is already `approved`
  - If found, show an error toast: "This payment reference has already been used in an approved request" and block approval
  - Skip check if `payment_reference` is null/empty

### Files to Modify
| File | Change |
|------|--------|
| `src/hooks/useSiteSettings.ts` | Add `welcomeTitle`, `welcomeNote` |
| `src/pages/Auth.tsx` | Use dynamic welcome title/note |
| `src/pages/SettingsPage.tsx` | Add Welcome Title + Note config cards |
| `src/components/client/ClientTopUp.tsx` | Two-column layout for form |
| `src/components/admin/AdminTopUp.tsx` | Duplicate reference check on approve |

