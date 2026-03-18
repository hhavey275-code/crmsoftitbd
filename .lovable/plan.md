

## Plan: Batch Size 5 → 20

`get-account-insights/index.ts` এ `META_BATCH_SIZE` constant 5 থেকে 20 তে change করবো। এতে প্রতি batch এ 20 টা account একসাথে process হবে।

### File Changed

| File | Change |
|------|--------|
| `supabase/functions/get-account-insights/index.ts` | `META_BATCH_SIZE = 5` → `META_BATCH_SIZE = 20` |

