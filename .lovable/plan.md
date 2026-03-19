

## Plan: Add Dark Mode Toggle

### What
Add a dark/light mode toggle to the app so users can switch themes. The system already has dark mode CSS variables defined in `index.css` and `next-themes` is installed — it just needs to be wired up.

### Changes

| # | Task | File |
|---|------|------|
| 1 | Wrap app with `ThemeProvider` from `next-themes` | `src/App.tsx` |
| 2 | Create a `ThemeToggle` component with Sun/Moon icon button | `src/components/ThemeToggle.tsx` |
| 3 | Add `ThemeToggle` to the sidebar footer (above Sign Out) | `src/components/AppSidebar.tsx` |
| 4 | Also add `ThemeToggle` to the header bar | `src/components/DashboardLayout.tsx` |

### Details

- **ThemeProvider**: Wrap the entire app in `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>` so the `dark` class gets toggled on `<html>`.
- **ThemeToggle**: A simple button using `useTheme()` from `next-themes` — shows Sun icon in dark mode, Moon icon in light mode. Clicking toggles between `light` and `dark`.
- **Placement**: In the sidebar footer before the Sign Out button, and in the header next to the notification bell.
- No database or migration changes needed.

