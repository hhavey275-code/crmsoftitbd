

## পরিবর্তনের সারসংক্ষেপ

৪টি কাজ:

1. **Client Name clickable** — `/clients/:userId` পেজে নিয়ে যাবে
2. **Approved status এ match reason dropdown** — `admin_note` থেকে verification log collapsible dropdown এ দেখাবে
3. **Unmatched SMS remove** — BankSmsPanel এ শুধু matched SMS দেখাবে, unmatched গুলো সরিয়ে দেবে
4. **24 ঘণ্টা পর পুরনো SMS delete + verified SMS এ Telegram reaction** — একটা নতুন edge function বা verify-topup এ Telegram like reaction পাঠাবে

---

## Technical Plan

### 1. AdminTopUp.tsx — Client Name clickable link
- Client Name cell এ `<Link to={/clients/${r.user_id}}>` wrap করবে
- React Router `Link` import করবে

### 2. AdminTopUp.tsx — Approved status এ verification log dropdown
- Status column এ যখন `status === "approved"` এবং `admin_note` আছে, তখন একটা collapsible dropdown দেখাবে (ChevronDown/Up toggle)
- বর্তমানে `admin_note` সরাসরি দেখাচ্ছে — এটা dropdown/expandable এ পরিবর্তন হবে

### 3. AdminTopUp.tsx — BankSmsPanel থেকে unmatched SMS remove
- `BankSmsPanel` এ যেখানে `relevantMessages.length === 0` হলে recent messages দেখাচ্ছে, সেটা সরিয়ে দেবে
- শুধু matched (relevant) messages দেখাবে, না পেলে "No matching SMS" message

### 4. verify-topup — Telegram like reaction পাঠানো
- Auto-approve হলে, matched Telegram message এর `update_id` থেকে `message_id` বের করে Telegram `setMessageReaction` API call করবে 👍 reaction দিয়ে
- এর জন্য `raw_update` থেকে message_id এবং chat_id extract করতে হবে

### 5. Scheduled SMS cleanup — নতুন edge function `cleanup-telegram`
- প্রতি 24 ঘণ্টায় run হবে (pg_cron)
- 20 ঘণ্টার পুরনো telegram_messages delete করবে
- কিন্তু যেগুলোর against এ payment verified হয়েছে সেগুলো রাখবে না — সবই delete হবে কারণ log `admin_note` এ সংরক্ষিত আছে

---

## ফাইল পরিবর্তন

| ফাইল | কাজ |
|---|---|
| `src/components/admin/AdminTopUp.tsx` | Client name Link, status dropdown, remove unmatched SMS |
| `supabase/functions/verify-topup/index.ts` | Telegram 👍 reaction on matched SMS |
| `supabase/functions/cleanup-telegram/index.ts` | নতুন — 20hr+ পুরনো SMS delete |
| pg_cron SQL | cleanup-telegram প্রতি 24 ঘণ্টায় schedule |

