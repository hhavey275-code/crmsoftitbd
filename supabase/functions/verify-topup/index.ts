import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), { status: 500, headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { request_id } = await req.json();
    if (!request_id) throw new Error('request_id is required');

    // 1. Fetch the top-up request
    const { data: request, error: reqErr } = await supabase
      .from('top_up_requests')
      .select('*')
      .eq('id', request_id)
      .single();
    if (reqErr || !request) throw new Error('Request not found');
    if (request.status !== 'pending') {
      return new Response(JSON.stringify({ ok: true, message: 'Already processed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { payment_reference, bdt_amount, bank_account_id, proof_url, user_id, amount } = request;

    // 2. Get bank account last 4 digits
    let bankLast4 = '';
    if (bank_account_id) {
      const { data: bank } = await supabase
        .from('bank_accounts')
        .select('account_number')
        .eq('id', bank_account_id)
        .single();
      if (bank?.account_number) {
        bankLast4 = bank.account_number.slice(-4);
      }
    }

    // 3. AI OCR - Extract ref and amount from screenshot
    let ocrRef = '';
    let ocrAmount = 0;
    if (proof_url) {
      try {
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Extract the transaction reference number and the payment amount (in BDT) from this payment screenshot. Return ONLY a JSON object like: {"ref": "ABC123", "amount": 10000}. If you cannot find a value, use empty string for ref and 0 for amount. No explanation, just JSON.',
                  },
                  {
                    type: 'image_url',
                    image_url: { url: proof_url },
                  },
                ],
              },
            ],
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content || '';
          const jsonMatch = content.match(/\{[^}]+\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            ocrRef = String(parsed.ref || '').trim();
            ocrAmount = Number(parsed.amount) || 0;
          }
        }
      } catch (e) {
        console.error('AI OCR failed:', e);
      }
    }

    // 4. Verify OCR matches submitted data
    const refMatch = ocrRef && payment_reference && ocrRef.toLowerCase() === payment_reference.toLowerCase();
    const amountMatch = ocrAmount > 0 && bdt_amount && Math.abs(ocrAmount - Number(bdt_amount)) < 1;

    if (!refMatch || !amountMatch) {
      console.log(`OCR mismatch: ocrRef=${ocrRef} vs submitted=${payment_reference}, ocrAmount=${ocrAmount} vs submitted=${bdt_amount}`);
      return new Response(JSON.stringify({ ok: true, auto_approved: false, reason: 'OCR mismatch', retry_suggested: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 5. Search Telegram messages for matching bank notification (±30 min window)
    const requestTime = new Date(request.created_at);
    const windowStart = new Date(requestTime.getTime() - 30 * 60 * 1000).toISOString();
    const windowEnd = new Date(requestTime.getTime() + 30 * 60 * 1000).toISOString();

    const { data: telegramMsgs } = await supabase
      .from('telegram_messages')
      .select('text')
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd)
      .order('created_at', { ascending: false })
      .limit(100);

    let telegramMatch = false;
    if (telegramMsgs && bankLast4) {
      const bdtNum = Number(bdt_amount);
      for (const msg of telegramMsgs) {
        const text = msg.text || '';
        const hasLast4 = text.includes(bankLast4);
        const amountStr = bdtNum.toLocaleString('en-IN');
        const amountStrPlain = String(bdtNum);
        const hasAmount = text.includes(amountStr) || text.includes(amountStrPlain) || text.includes(amountStr.replace(/,/g, ''));
        
        if (hasLast4 && hasAmount) {
          telegramMatch = true;
          break;
        }
      }
    }

    if (!telegramMatch) {
      console.log(`Telegram mismatch: bankLast4=${bankLast4}, bdt_amount=${bdt_amount}`);
      return new Response(JSON.stringify({ ok: true, auto_approved: false, reason: 'No matching Telegram message', retry_suggested: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 6. All 3 checks passed - auto-approve!
    const { error: updateErr } = await supabase
      .from('top_up_requests')
      .update({ status: 'approved', admin_note: 'Auto-approved by system verification' })
      .eq('id', request_id);
    if (updateErr) throw updateErr;

    // Add wallet balance
    const { data: wallet } = await supabase.from('wallets').select('balance').eq('user_id', user_id).single();
    const currentBalance = Number(wallet?.balance ?? 0);
    const newBalance = currentBalance + Number(amount);

    const { error: walletErr } = await supabase.from('wallets').update({ balance: newBalance }).eq('user_id', user_id);
    if (walletErr) throw walletErr;

    // Create transaction
    const { error: txErr } = await supabase.from('transactions').insert({
      user_id,
      type: 'top_up',
      amount: Number(amount),
      balance_after: newBalance,
      reference_id: request_id,
      description: 'Wallet top-up auto-approved',
    });
    if (txErr) throw txErr;

    // Notify client
    await supabase.from('notifications').insert({
      user_id,
      type: 'top_up_update',
      title: 'Top-Up Approved',
      message: `Your top-up of $${amount} has been auto-approved.`,
      reference_id: request_id,
    });

    return new Response(JSON.stringify({ ok: true, auto_approved: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('verify-topup error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
