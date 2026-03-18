import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_RUNTIME_MS = 280_000;
const MIN_REMAINING_MS = 5_000;

type TelegramPayload = {
  chat?: { id?: number };
  text?: string;
  caption?: string;
  new_chat_members?: Array<{ username?: string; first_name?: string }>;
  left_chat_member?: { username?: string; first_name?: string };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const getPayload = (update: any): TelegramPayload | null => {
  return update.message || update.edited_message || update.channel_post || update.edited_channel_post || null;
};

const getTextFromPayload = (payload: TelegramPayload): string | null => {
  if (payload.text?.trim()) return payload.text.trim();
  if (payload.caption?.trim()) return payload.caption.trim();

  if (payload.new_chat_members?.length) {
    const names = payload.new_chat_members
      .map((m) => m.username || m.first_name || 'member')
      .join(', ');
    return `[service] new_chat_members: ${names}`;
  }

  if (payload.left_chat_member) {
    return `[service] left_chat_member: ${payload.left_chat_member.username || payload.left_chat_member.first_name || 'member'}`;
  }

  return null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  // Parse request body for quick mode
  let quickMode = false;
  try {
    const body = await req.json();
    quickMode = body?.quick === true;
  } catch { /* no body or invalid JSON */ }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: tokenRow, error: tokenErr } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'telegram_bot_token')
    .single();

  if (tokenErr || !tokenRow?.value) {
    return new Response(JSON.stringify({ error: 'Telegram bot token not configured in settings' }), { status: 500, headers: corsHeaders });
  }

  const botToken = tokenRow.value;
  const TELEGRAM_API = `https://api.telegram.org/bot${botToken}`;

  let totalProcessed = 0;

  const { data: state, error: stateErr } = await supabase
    .from('telegram_bot_state')
    .select('update_offset')
    .eq('id', 1)
    .single();

  if (stateErr) {
    return new Response(JSON.stringify({ error: stateErr.message }), { status: 500, headers: corsHeaders });
  }

  let currentOffset = state.update_offset;

  const processUpdates = async (updates: any[]) => {
    const rows = updates
      .map((u: any) => {
        const payload = getPayload(u);
        const chatId = payload?.chat?.id;
        if (!payload || !chatId) return null;
        return {
          update_id: u.update_id,
          chat_id: chatId,
          text: getTextFromPayload(payload),
          raw_update: u,
        };
      })
      .filter((row: any) => !!row);

    if (rows.length > 0) {
      const { error: insertErr } = await supabase
        .from('telegram_messages')
        .upsert(rows, { onConflict: 'update_id' });
      if (insertErr) throw new Error(insertErr.message);
      totalProcessed += rows.length;
    }

    const newOffset = Math.max(...updates.map((u: any) => u.update_id)) + 1;
    const { error: offsetErr } = await supabase
      .from('telegram_bot_state')
      .update({ update_offset: newOffset, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (offsetErr) throw new Error(offsetErr.message);
    currentOffset = newOffset;
  };

  // Auto-verify all pending top-up requests
  const autoVerifyPending = async () => {
    const { data: pendingRequests } = await supabase
      .from('top_up_requests')
      .select('id')
      .eq('status', 'pending');

    if (!pendingRequests || pendingRequests.length === 0) return 0;

    let verified = 0;
    for (const req of pendingRequests) {
      try {
        const verifyResponse = await fetch(`${supabaseUrl}/functions/v1/verify-topup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ request_id: req.id }),
        });
        const result = await verifyResponse.json();
        if (result.auto_approved) verified++;
      } catch (e) {
        console.error(`Auto-verify failed for ${req.id}:`, e);
      }
    }
    return verified;
  };

  if (quickMode) {
    // Quick mode: single instant call with timeout=0
    const response = await fetch(`${TELEGRAM_API}/getUpdates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        offset: currentOffset,
        timeout: 0,
        allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post'],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return new Response(JSON.stringify({ error: data }), { status: 502, headers: corsHeaders });
    }

    const updates = data.result ?? [];
    if (updates.length > 0) {
      try {
        await processUpdates(updates);
      } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
      }
    }

    // Auto-verify pending requests after fetching new messages
    let autoVerified = 0;
    try {
      autoVerified = await autoVerifyPending();
    } catch (e) {
      console.error('Auto-verify sweep failed:', e);
    }

    return new Response(JSON.stringify({ ok: true, processed: totalProcessed, finalOffset: currentOffset, auto_verified: autoVerified }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } else {
    // Long-polling mode for cron/background runs
    while (true) {
      const elapsed = Date.now() - startTime;
      const remainingMs = MAX_RUNTIME_MS - elapsed;
      if (remainingMs < MIN_REMAINING_MS) break;

      const timeout = Math.min(50, Math.floor(remainingMs / 1000) - 5);
      if (timeout < 1) break;

      const response = await fetch(`${TELEGRAM_API}/getUpdates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offset: currentOffset,
          timeout,
          allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post'],
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return new Response(JSON.stringify({ error: data }), { status: 502, headers: corsHeaders });
      }

      const updates = data.result ?? [];
      if (updates.length === 0) continue;

      try {
        await processUpdates(updates);
      } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
      }
    }

    // Auto-verify after long-polling loop ends
    let autoVerified = 0;
    if (totalProcessed > 0) {
      try {
        autoVerified = await autoVerifyPending();
      } catch (e) {
        console.error('Auto-verify sweep failed:', e);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: totalProcessed, finalOffset: currentOffset, auto_verified: autoVerified }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
