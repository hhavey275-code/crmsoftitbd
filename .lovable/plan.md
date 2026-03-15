

## Changes to SpendProgressBar

### Problem
1. Dollar text too bold — reduce to `text-sm font-semibold`
2. Progress bar too short (`max-w-[80px]`) — make it longer to use available space
3. Color logic is based on spend ratio but user wants it based on **remaining** percentage:
   - Fresh/full remaining → **blue**
   - 50%+ spent (≤50% remaining) → **yellow**  
   - 80%+ spent (≤20% remaining) → **red**

### Changes in `src/components/SpendProgressBar.tsx`

1. **Text**: Change `text-base font-bold` → `text-sm font-semibold`
2. **Bar width**: Remove `max-w-[80px]`, keep `w-full` so bar stretches to fill column
3. **Bar height**: Increase from `h-1.5` to `h-2` for better visibility
4. **Color logic**: 
   - `ratio >= 0.8` → `bg-destructive` (red) — 80%+ spent
   - `ratio >= 0.5` → `bg-yellow-500` (yellow) — 50%+ spent
   - `ratio < 0.5` → `bg-blue-500` (blue) — mostly remaining

The ratio logic is already correct (ratio = amountSpent/spendCap), just need to change default color from `bg-primary` to `bg-blue-500`.

### Files
- `src/components/SpendProgressBar.tsx`

