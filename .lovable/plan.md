

## Changes to Client Dashboard & Ad Accounts

### 1. Fix Greeting Time Logic (`ClientDashboard.tsx`)
Current `greeting()` only returns "Good morning" or "Good afternoon" or "Good evening". Add "Good night" for late hours:
- `hour < 12` → "Good morning"
- `hour < 17` → "Good afternoon"  
- `hour < 21` → "Good evening"
- `hour >= 21` → "Good night"

### 2. Top Up Button with Label (`ClientAdAccounts.tsx`)
Change the top-up button from icon-only (`size="icon"`) to a small button with text "Top Up" and blue background. Replace the current `size="icon" className="h-8 w-8"` with `size="sm"` and add "Top Up" text next to the icon.

### 3. Remove Card Name Column (`ClientAdAccounts.tsx`)
- Remove the "Card Name" `<TableHead>` (line 378-380)
- Remove the corresponding `<TableCell>` that renders card info (lines 434-447)
- Update `colSpan` values from 6 to 5

### 4. Make Budget Line Bigger & Bold (`SpendProgressBar.tsx`)
Change the remaining balance text from `text-sm font-medium` to `text-base font-bold` to make it more prominent.

### Files Modified
- `src/components/client/ClientDashboard.tsx` — greeting logic
- `src/components/client/ClientAdAccounts.tsx` — top up button label, remove card name column
- `src/components/SpendProgressBar.tsx` — bigger/bolder budget text

