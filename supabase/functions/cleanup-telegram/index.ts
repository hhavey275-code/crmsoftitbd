import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(); // 20 hours ago

    const { data, error } = await supabase
      .from('telegram_messages')
      .delete()
      .lt('created_at', cutoff)
      .select('update_id');

    if (error) throw error;

    const deletedCount = data?.length ?? 0;
    console.log(`Cleanup: deleted ${deletedCount} telegram messages older than 20h`);

    return new Response(JSON.stringify({ ok: true, deleted: deletedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('cleanup-telegram error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
