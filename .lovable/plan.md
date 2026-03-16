

## সমস্যা: Connector Gateway "Workspace Not Authorized"

এটা কোড এর সমস্যা নয়। Connector gateway platform level এ credential reject করছে। Code, secrets, headers সব ঠিক আছে।

### Workaround Plan: Direct Telegram API (Gateway bypass)

Gateway যেহেতু কাজ করছে না, তাই **Telegram Bot API সরাসরি call** করবো bot token দিয়ে। এটা করতে হলে:

1. **Admin settings এ bot token input field** add করবো — admin নিজের bot token (`site_settings` table এ key: `telegram_bot_token`) সেভ করবে
2. **Edge function update**: `telegram-poll/index.ts` এ gateway URL এর বদলে `https://api.telegram.org/bot<TOKEN>/getUpdates` call করবো
3. **verify-topup** function ও update করবো যদি সেখানে gateway use হয়

### Changes

**1. Database: `site_settings` এ bot token store**
- Admin Settings page এ "Telegram Bot Token" input field add করবো
- Token `site_settings` table এ save হবে (key: `telegram_bot_token`)

**2. `supabase/functions/telegram-poll/index.ts`**
- Gateway URL replace → `https://api.telegram.org/bot${botToken}/getUpdates`
- Bot token `site_settings` table থেকে read করবে (service role key দিয়ে)
- `LOVABLE_API_KEY` এবং `TELEGRAM_API_KEY` headers আর লাগবে না

**3. `src/pages/SettingsPage.tsx`**
- Telegram Bot Token input field add করবো admin section এ

### Files
- `supabase/functions/telegram-poll/index.ts` — Direct API call
- `supabase/functions/verify-topup/index.ts` — Remove gateway dependency if any
- `src/pages/SettingsPage.tsx` — Bot token input
- No new migration needed (`site_settings` table already exists)

