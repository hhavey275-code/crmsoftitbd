import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BDT_TOLERANCE = 15; // ±15 BDT to account for bank transfer charges (~10 BDT)

function amountMatches(a: number, b: number): boolean {
  return Math.abs(a - b) <= BDT_TOLERANCE;
}

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
    const bdtNum = Number(bdt_amount);
    const verificationLog: string[] = [];

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

    // 3. Step 1 & 2: AI OCR — Extract ref and amount from screenshot
    let ocrRef = '';
    let ocrAmount = 0;
    let ocrRefMatch = false;
    let ocrAmountMatch = false;

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
        console.error('AI OCR failed (non-blocking):', e);
        verificationLog.push('⚠️ OCR failed (non-blocking)');
      }
    }

    // Step 1: OCR Ref match
    if (ocrRef && payment_reference) {
      ocrRefMatch = ocrRef.toLowerCase() === payment_reference.toLowerCase();
      if (ocrRefMatch) {
        verificationLog.push(`✅ OCR Ref matched (${ocrRef})`);
      } else {
        verificationLog.push(`❌ OCR Ref mismatch (OCR: ${ocrRef} vs Submitted: ${payment_reference})`);
      }
    } else {
      verificationLog.push(`⚠️ OCR Ref skipped (OCR: "${ocrRef}", Submitted: "${payment_reference || ''}")`);
    }

    // Step 2: OCR Amount match (±15 BDT tolerance)
    if (ocrAmount > 0 && bdtNum > 0) {
      ocrAmountMatch = amountMatches(ocrAmount, bdtNum);
      if (ocrAmountMatch) {
        verificationLog.push(`✅ OCR Amount matched (OCR: ৳${ocrAmount} vs Submitted: ৳${bdtNum}, diff: ৳${Math.abs(ocrAmount - bdtNum)})`);
      } else {
        verificationLog.push(`❌ OCR Amount mismatch (OCR: ৳${ocrAmount} vs Submitted: ৳${bdtNum}, diff: ৳${Math.abs(ocrAmount - bdtNum)})`);
      }
    } else {
      verificationLog.push(`⚠️ OCR Amount skipped (OCR: ${ocrAmount}, Submitted: ${bdtNum})`);
    }

    // Step 3: Telegram SMS match — window: request time -30min to +10min (Bangladesh timezone)
    const requestTime = new Date(request.created_at);
    const windowStart = new Date(requestTime.getTime() - 30 * 60 * 1000).toISOString();
    const windowEnd = new Date(requestTime.getTime() + 10 * 60 * 1000).toISOString();

    console.log(`Telegram search window: ${windowStart} → ${windowEnd}`);

    const { data: telegramMsgs } = await supabase
      .from('telegram_messages')
      .select('text, raw_update, created_at, update_id, chat_id, matched_request_id')
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd)
      .is('matched_request_id', null)
      .order('created_at', { ascending: false })
      .limit(200);

    let telegramMatch = false;
    let telegramMatchDetail = '';
    let matchedMsg: any = null;
    if (telegramMsgs && bankLast4 && bdtNum > 0) {
      for (const msg of telegramMsgs) {
        // Get text from multiple possible fields
        const raw = (msg as any).raw_update || {};
        const payload = raw.message || raw.edited_message || raw.channel_post || raw.edited_channel_post || {};
        const text = msg.text || payload.text || payload.caption || '';
        
        const hasLast4 = text.includes(bankLast4);
        
        // Check amount with ±15 BDT tolerance
        // Extract all numbers from the text and check if any match within tolerance
        const numberMatches = text.match(/[\d,]+/g) || [];
        let hasAmount = false;
        let matchedTelegramAmount = 0;
        
        for (const numStr of numberMatches) {
          const num = Number(numStr.replace(/,/g, ''));
          if (num > 0 && amountMatches(num, bdtNum)) {
            hasAmount = true;
            matchedTelegramAmount = num;
            break;
          }
        }

        if (hasLast4 && hasAmount) {
          telegramMatch = true;
          matchedMsg = msg;
          telegramMatchDetail = `last4: ${bankLast4}, amount: ৳${matchedTelegramAmount} (submitted: ৳${bdtNum}, diff: ৳${Math.abs(matchedTelegramAmount - bdtNum)})`;
          console.log(`Telegram match found: ${telegramMatchDetail}, text snippet: ${text.substring(0, 100)}`);
          break;
        }
      }
    }

    if (telegramMatch) {
      verificationLog.push(`✅ Telegram SMS matched (${telegramMatchDetail})`);
    } else {
      verificationLog.push(`❌ Telegram SMS no match (bankLast4=${bankLast4}, bdt=${bdtNum}, messages checked: ${telegramMsgs?.length ?? 0}, window: ${windowStart} → ${windowEnd})`);
    }

    // Decision: All 3 steps must pass (OCR ref, OCR amount, Telegram SMS)
    // If OCR was skipped (no proof or OCR failed), only require Telegram match
    const ocrAvailable = ocrRef !== '' || ocrAmount > 0;
    const allPassed = ocrAvailable 
      ? (ocrRefMatch && ocrAmountMatch && telegramMatch)
      : telegramMatch;

    const logText = `Auto-verification: ${verificationLog.join(' | ')}`;

    if (!allPassed) {
      // Save partial verification log even on failure
      await supabase
        .from('top_up_requests')
        .update({ admin_note: logText })
        .eq('id', request_id);

      const failReasons: string[] = [];
      if (ocrAvailable && !ocrRefMatch) failReasons.push('OCR ref mismatch');
      if (ocrAvailable && !ocrAmountMatch) failReasons.push('OCR amount mismatch');
      if (!telegramMatch) failReasons.push('No Telegram SMS match');

      console.log(`Verification failed for ${request_id}: ${failReasons.join(', ')}`);
      return new Response(JSON.stringify({ 
        ok: true, 
        auto_approved: false, 
        reason: failReasons.join(', '),
        retry_suggested: !telegramMatch 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // All checks passed — Auto-approve!
    console.log(`Auto-approving request ${request_id}: ${logText}`);

    const { error: updateErr } = await supabase
      .from('top_up_requests')
      .update({ 
        status: 'approved', 
        admin_note: logText
      })
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

    // Mark matched Telegram message so it can't be reused
    if (matchedMsg) {
      await supabase
        .from('telegram_messages')
        .update({ matched_request_id: request_id })
        .eq('update_id', matchedMsg.update_id);

      // Send 👍 reaction on matched Telegram message
      try {
        const raw = matchedMsg.raw_update || {};
        const payload = raw.message || raw.edited_message || raw.channel_post || raw.edited_channel_post || {};
        const messageId = payload.message_id;
        const chatId = matchedMsg.chat_id;

        if (messageId && chatId) {
          const { data: botTokenSetting } = await supabase
            .from('site_settings')
            .select('value')
            .eq('key', 'telegram_bot_token')
            .single();

          if (botTokenSetting?.value) {
            const reactionResp = await fetch(`https://api.telegram.org/bot${botTokenSetting.value}/setMessageReaction`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                message_id: messageId,
                reaction: [{ type: 'emoji', emoji: '👍' }],
              }),
            });
            const reactionData = await reactionResp.json();
            console.log('Telegram reaction result:', JSON.stringify(reactionData));
          }
        }
      } catch (e) {
        console.error('Telegram reaction failed (non-blocking):', e);
      }
    }

    return new Response(JSON.stringify({ ok: true, auto_approved: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('verify-topup error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
