

## Problem

Client deactivate কাজ করছে না কারণ `profiles` table এ admin এর জন্য **UPDATE RLS policy নেই**। শুধু user নিজে নিজের profile update করতে পারে (`auth.uid() = user_id`)। তাই admin যখন অন্য client এর status update করতে চায়, RLS block করে দেয়।

## Fix

**Database migration** — profiles table এ admin UPDATE policy add করতে হবে:

```sql
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
```

**Code change** — `AdminClients.tsx` এ `.update()` call থেকে `as any` cast সরিয়ে proper typing ensure করা, এবং error handling improve করা যেন কোন error হলে user কে clearly দেখায়।

## Files
| File | Change |
|------|--------|
| New migration SQL | Add admin UPDATE policy on profiles |
| `AdminClients.tsx` | Minor error handling improvement |

