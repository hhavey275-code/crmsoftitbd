

## Plan: PWA Setup + Client Dashboard এ "Download App" Button

আপনার app কে PWA (Progressive Web App) হিসেবে setup করবো। এতে client রা dashboard থেকে সরাসরি "Download App" button এ click করে phone এ install করতে পারবে — ঠিক যেমন একটা real app। আপনি Lovable এ update করলেই app ও automatically update হয়ে যাবে।

> **Note:** Web app থেকে `.apk` file generate করা সম্ভব না, কিন্তু PWA ঠিক app এর মতোই কাজ করে — home screen এ icon থাকবে, full screen এ open হবে, offline ও কাজ করবে।

### Changes

#### 1. Install `vite-plugin-pwa` + Configure
- `vite.config.ts` এ PWA plugin add করবো with auto-update strategy
- App name, icons, theme color, display mode configure করবো

#### 2. PWA Icons
- `public/pwa-192x192.png` ও `public/pwa-512x512.png` create করবো (existing favicon থেকে)

#### 3. Update `index.html`
- Mobile meta tags add করবো: `theme-color`, `apple-mobile-web-app-capable`, `apple-touch-icon`

#### 4. Create `useInstallPrompt` hook
- Browser এর `beforeinstallprompt` event capture করবো
- Android এ direct install prompt trigger করবে
- iOS এ "Share → Add to Home Screen" instruction দেখাবে

#### 5. Client Dashboard এ "📱 Download App" button/banner add করবো
- Dashboard এর top এ একটি attractive banner/card দেখাবে
- Click করলে install prompt আসবে (Android) বা instruction modal দেখাবে (iOS)
- Already installed থাকলে banner hide হবে

### Files

| File | Change |
|------|--------|
| `package.json` | Add `vite-plugin-pwa` |
| `vite.config.ts` | Configure PWA plugin |
| `public/pwa-192x192.png` | PWA icon |
| `public/pwa-512x512.png` | PWA icon |
| `index.html` | Mobile meta tags |
| `src/hooks/useInstallPrompt.ts` | **New** - PWA install prompt hook |
| `src/components/client/ClientDashboard.tsx` | Add "Download App" banner at top |

