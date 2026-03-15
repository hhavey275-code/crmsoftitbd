

## Plan: Light Sidebar, Title Bar with Logo, and Logo Upload in Settings

### Summary
Three changes: (1) switch sidebar from dark to light theme like the reference image, (2) add a logo upload option in Settings that stores the logo in file storage, (3) show the uploaded logo in the sidebar and on the login page with a title bar.

### Database & Storage Changes

**New table `site_settings`** — stores app-wide settings like logo URL:
```sql
CREATE TABLE public.site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
-- Anyone authenticated can read
CREATE POLICY "Anyone can read site_settings" ON public.site_settings FOR SELECT TO authenticated USING (true);
-- Only admins can update/insert
CREATE POLICY "Admins can manage site_settings" ON public.site_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
```

**Storage bucket `logos`** — for uploading logo images, publicly readable.

### File Changes

| File | Change |
|------|--------|
| `src/index.css` | Change sidebar CSS variables to light theme (white background, dark text, light accents) |
| `src/components/AppSidebar.tsx` | Replace hardcoded Zap icon with logo from `site_settings`; add more spacing between nav items |
| `src/components/DashboardLayout.tsx` | Add title bar in header showing logo + app name + user info (like reference image) |
| `src/pages/Auth.tsx` | Add title bar at top of login page with logo from `site_settings`; show logo instead of Zap icon in card |
| `src/pages/SettingsPage.tsx` | Add "Logo Upload" card — file input to upload image to `logos` bucket, save URL to `site_settings`, show current logo preview |
| `src/hooks/useSiteSettings.ts` | New hook to fetch logo URL from `site_settings` table, used by sidebar, layout, and auth page |
| Database migration | Create `site_settings` table + storage bucket |

### Sidebar Light Theme (CSS variables)
The sidebar variables in `:root` will change to:
- `--sidebar-background: 0 0% 100%` (white)
- `--sidebar-foreground: 220 20% 10%` (dark text)
- `--sidebar-accent: 210 20% 96%` (light gray hover)
- `--sidebar-border: 214 20% 92%` (light border)
- `--sidebar-muted: 215 16% 47%` (gray subtext)

The sidebar component will also get a `border-r` for visual separation like the reference image.

### Logo Flow
1. Admin uploads logo in Settings → stored in `logos` bucket → public URL saved to `site_settings` (key: `logo_url`)
2. `useSiteSettings` hook fetches the logo URL
3. Sidebar header, login page title bar, and login card all display the logo (fallback to Zap icon if none uploaded)

