

## Problem

`useSiteSettings` uses raw `useState` + `useEffect` — every component that calls it makes a **separate** Supabase query, and on reload the initial state is `null` so the default Zap icon/name flashes before the real branding loads.

Two root causes:
1. **No caching** — each mount = fresh DB call, no shared state between sidebar + header + auth page
2. **No localStorage persistence** — on reload, branding starts blank until the network response arrives

## Solution: localStorage Cache + React Query Singleton

### 1. Rewrite `useSiteSettings.ts` with React Query + localStorage

- Use `useQuery` with key `["site-settings"]` and `staleTime: 5 minutes`
- **Initialize from localStorage**: on app start, read cached settings from `localStorage.getItem("site_settings_cache")` and use as `initialData`
- **Write to localStorage** on every successful fetch via `onSuccess` / after data returns
- This gives **instant** branding on reload (from cache) and a single shared query across all components

```
Flow:
Page Load → localStorage cache → instant branding display
         → Background fetch → update if changed → save to localStorage
```

### 2. Changes to `src/hooks/useSiteSettings.ts`
- Replace `useState`/`useEffect` pattern with `useQuery` from `@tanstack/react-query`
- Query function fetches from `site_settings` table (same query)
- Parse result into `{ logoUrl, siteName, headerAnnouncement, welcomeTitle, welcomeNote }`
- `initialData` reads from `localStorage`
- `staleTime: 5 * 60 * 1000` (5 min) — avoid redundant calls
- On success, write parsed result to `localStorage`
- Export same shape: `{ logoUrl, siteName, ..., loading, refetch }`

### 3. No other file changes needed
All consumers (`AppSidebar`, `DashboardLayout`, `Auth`) already use `useSiteSettings()` — the hook interface stays identical.

### Result
- **First load ever**: brief default branding (no cache yet), then real branding appears — same as now but only once
- **Every reload after**: branding appears **instantly** from localStorage, no flash
- **Cross-component**: single query shared via React Query, not 3 separate DB calls

