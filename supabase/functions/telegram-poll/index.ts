import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Read bot token from site_settings
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
        allowed_updates: ['message'],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return new Response(JSON.stringify({ error: data }), { status: 502, headers: corsHeaders });
    }

    const updates = data.result ?? [];
    if (updates.length === 0) continue;

    const rows = updates
      .filter((u: any) => u.message)
      .map((u: any) => ({
        update_id: u.update_id,
        chat_id: u.message.chat.id,
        text: u.message.text ?? null,
        raw_update: u,
      }));

    if (rows.length > 0) {
      const { error: insertErr } = await supabase
        .from('telegram_messages')
        .upsert(rows, { onConflict: 'update_id' });
      if (insertErr) {
        return new Response(JSON.stringify({ error: insertErr.message }), { status: 500, headers: corsHeaders });
      }
      totalProcessed += rows.length;
    }

    const newOffset = Math.max(...updates.map((u: any) => u.update_id)) + 1;
    const { error: offsetErr } = await supabase
      .from('telegram_bot_state')
      .update({ update_offset: newOffset, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (offsetErr) {
      return new Response(JSON.stringify({ error: offsetErr.message }), { status: 500, headers: corsHeaders });
    }
    currentOffset = newOffset;
  }

  return new Response(JSON.stringify({ ok: true, processed: totalProcessed, finalOffset: currentOffset }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
