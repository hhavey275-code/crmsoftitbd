import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BDT_TOLERANCE = 15;

function amountMatches(a: number, b: number): boolean {
  return Math.abs(a - b) <= BDT_TOLERANCE;
}

async function forwardProofToTelegram(supabase: any, proofUrl: string, caption: string, bankAccountId: string | null) {
  try {
    const { data: botTokenSetting } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'telegram_bot_token')
      .single();

    if (!botTokenSetting?.value) {
      console.log('Telegram forward skipped: bot token not configured');
      return;
    }

    // Get per-bank telegram_group_id, fallback to global setting
    let targetGroupId = '';
    if (bankAccountId) {
      const { data: bankData } = await supabase
        .from('bank_accounts')
        .select('telegram_group_id')
        .eq('id', bankAccountId)
        .single();
      if (bankData?.telegram_group_id) targetGroupId = bankData.telegram_group_id;
    }
    if (!targetGroupId) {
      const { data: groupIdSetting } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'telegram_forward_group_id')
        .single();
      targetGroupId = groupIdSetting?.value || '';
    }

    if (!targetGroupId) {
      console.log('Telegram forward skipped: no group ID configured. bankAccountId:', bankAccountId);
      return;
    }
    console.log('Telegram forwarding to group:', targetGroupId, 'bankAccountId:', bankAccountId);

    const resp = await fetch(`https://api.telegram.org/bot${botTokenSetting.value}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetGroupId,
        photo: proofUrl,
        caption: caption,
        parse_mode: 'HTML',
      }),
    });
    const result = await resp.json();
    console.log('Telegram forward result:', JSON.stringify(result));
  } catch (e) {
    console.error('Telegram forward failed (non-blocking):', e);
  }
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

    const { bdt_amount, bank_account_id, proof_url, user_id, amount, payment_method } = request;
    const payment_reference = (request.payment_reference || '').trim();
    const bdtNum = Number(bdt_amount);
    const verificationLog: string[] = [];
    const method = payment_method || 'bank_transfer';

    // 2. Get bank account details
    let bankLast4 = '';
    let bankName = '';
    if (bank_account_id) {
      const { data: bank } = await supabase
        .from('bank_accounts')
        .select('account_number, bank_name')
        .eq('id', bank_account_id)
        .single();
      if (bank?.account_number) bankLast4 = bank.account_number.slice(-4);
      if (bank?.bank_name) bankName = bank.bank_name.toLowerCase();
    }

    const isMobileAgent = bankName.includes('bkash') || bankName.includes('nagad');

    // 3. AI OCR — branched by payment method
    let ocrRef = '';
    let ocrAmount = 0;
    let ocrRefMatch = false;
    let ocrAmountMatch = false;
    let ocrAccountMatch = false;
    let ocrAtmCredit = false;
    let ocrAccountNumber = '';

    if (proof_url) {
      try {
        let ocrPrompt = '';
        if (method === 'atm_deposit') {
          ocrPrompt = 'Extract the following from this ATM deposit receipt screenshot: transaction reference number, deposit amount (in BDT), account number, date, and whether this is an "ATM Transfer Credit" transaction. Return ONLY a JSON object like: {"ref": "ABC123", "amount": 1300, "account_number": "1234567890", "date": "2025-01-15", "is_atm_credit": true}. If you cannot find a value, use empty string for strings, 0 for amount, and false for is_atm_credit. No explanation, just JSON.';
        } else if (method === 'cash_deposit') {
          ocrPrompt = 'Extract the following from this cash deposit receipt screenshot: deposit amount (in BDT), account number, and date. Return ONLY a JSON object like: {"amount": 1300, "account_number": "1234567890", "date": "2025-01-15"}. If you cannot find a value, use empty string for strings and 0 for amount. No explanation, just JSON.';
        } else {
          ocrPrompt = 'Extract the transaction reference number and the BASE payment amount (in BDT) from this payment screenshot. IMPORTANT: If the screenshot shows a breakdown like "৳1,300.00 + ৳16.25" or "amount + charge", extract ONLY the base amount (1300), NOT the total including charges/fees/VAT. The base amount is the actual money sent, excluding any service charge, VAT, or bank fee. For bKash/Nagad screenshots, look for the principal amount before fees. For bank transfer screenshots, extract the transfer amount excluding service charge and VAT. Return ONLY a JSON object like: {"ref": "ABC123", "amount": 1300}. If you cannot find a value, use empty string for ref and 0 for amount. No explanation, just JSON.';
        }

        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: ocrPrompt },
                { type: 'image_url', image_url: { url: proof_url } },
              ],
            }],
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
            ocrAccountNumber = String(parsed.account_number || '').trim();
            ocrAtmCredit = !!parsed.is_atm_credit;
          }
        }
      } catch (e) {
        console.error('AI OCR failed (non-blocking):', e);
        verificationLog.push('⚠️ OCR failed (non-blocking)');
      }
    }

    // OCR matching logic depends on method
    if (method === 'atm_deposit') {
      // Ref match
      if (ocrRef && payment_reference) {
        ocrRefMatch = ocrRef.toLowerCase() === payment_reference.toLowerCase();
        verificationLog.push(ocrRefMatch ? `✅ OCR Ref matched (${ocrRef})` : `❌ OCR Ref mismatch (OCR: ${ocrRef} vs Submitted: ${payment_reference})`);
      } else {
        verificationLog.push(`⚠️ OCR Ref skipped (OCR: "${ocrRef}", Submitted: "${payment_reference || ''}")`);
      }
      // Amount match
      if (ocrAmount > 0 && bdtNum > 0) {
        ocrAmountMatch = amountMatches(ocrAmount, bdtNum);
        verificationLog.push(ocrAmountMatch ? `✅ OCR Amount matched (${ocrAmount} vs ${bdtNum})` : `❌ OCR Amount mismatch (${ocrAmount} vs ${bdtNum})`);
      } else {
        verificationLog.push(`⚠️ OCR Amount skipped`);
      }
      // Account match
      if (ocrAccountNumber && bankLast4) {
        const ocrLast4 = ocrAccountNumber.slice(-4);
        ocrAccountMatch = ocrLast4 === bankLast4;
        verificationLog.push(ocrAccountMatch ? `✅ OCR Account matched (last4: ${ocrLast4})` : `❌ OCR Account mismatch (OCR: ${ocrLast4} vs Bank: ${bankLast4})`);
      } else {
        verificationLog.push(`⚠️ OCR Account skipped`);
      }
      // ATM credit check
      verificationLog.push(ocrAtmCredit ? `✅ ATM Transfer Credit confirmed` : `❌ ATM Transfer Credit not found`);
    } else if (method === 'cash_deposit') {
      // Amount match
      if (ocrAmount > 0 && bdtNum > 0) {
        ocrAmountMatch = amountMatches(ocrAmount, bdtNum);
        verificationLog.push(ocrAmountMatch ? `✅ OCR Amount matched (${ocrAmount} vs ${bdtNum})` : `❌ OCR Amount mismatch (${ocrAmount} vs ${bdtNum})`);
      } else {
        verificationLog.push(`⚠️ OCR Amount skipped`);
      }
      // Account match
      if (ocrAccountNumber && bankLast4) {
        const ocrLast4 = ocrAccountNumber.slice(-4);
        ocrAccountMatch = ocrLast4 === bankLast4;
        verificationLog.push(ocrAccountMatch ? `✅ OCR Account matched (last4: ${ocrLast4})` : `❌ OCR Account mismatch (OCR: ${ocrLast4} vs Bank: ${bankLast4})`);
      } else {
        verificationLog.push(`⚠️ OCR Account skipped`);
      }
    } else {
      // bank_transfer — existing logic
      if (ocrRef && payment_reference) {
        ocrRefMatch = ocrRef.toLowerCase() === payment_reference.toLowerCase();
        verificationLog.push(ocrRefMatch ? `✅ OCR Ref matched (${ocrRef})` : `❌ OCR Ref mismatch (OCR: ${ocrRef} vs Submitted: ${payment_reference})`);
      } else {
        verificationLog.push(`⚠️ OCR Ref skipped (OCR: "${ocrRef}", Submitted: "${payment_reference || ''}")`);
      }
      if (ocrAmount > 0 && bdtNum > 0) {
        ocrAmountMatch = amountMatches(ocrAmount, bdtNum);
        verificationLog.push(ocrAmountMatch ? `✅ OCR Amount matched (OCR: ৳${ocrAmount} vs Submitted: ৳${bdtNum}, diff: ৳${Math.abs(ocrAmount - bdtNum)})` : `❌ OCR Amount mismatch (OCR: ৳${ocrAmount} vs Submitted: ৳${bdtNum}, diff: ৳${Math.abs(ocrAmount - bdtNum)})`);
      } else {
        verificationLog.push(`⚠️ OCR Amount skipped (OCR: ${ocrAmount}, Submitted: ${bdtNum})`);
      }
    }

    // Telegram SMS match
    const requestTime = new Date(request.created_at);
    // For atm_deposit/cash_deposit, always use bank transfer matching (last4+amount), not mobile agent flow
    const useMobileAgentFlow = isMobileAgent && method === 'bank_transfer';
    const windowHoursBack = useMobileAgentFlow ? 6 : 0.5;
    const windowStart = new Date(requestTime.getTime() - windowHoursBack * 60 * 60 * 1000).toISOString();
    const windowEnd = new Date(requestTime.getTime() + 10 * 60 * 1000).toISOString();

    const MONITORED_CHAT_IDS = [-1003856921490, -1003763493818];
    const { data: telegramMsgs } = await supabase
      .from('telegram_messages')
      .select('text, raw_update, created_at, update_id, chat_id, matched_request_id')
      .in('chat_id', MONITORED_CHAT_IDS)
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd)
      .is('matched_request_id', null)
      .order('created_at', { ascending: false })
      .limit(200);

    let telegramMatch = false;
    let telegramMatchDetail = '';
    let matchedMsg: any = null;

    if (telegramMsgs && bdtNum > 0) {
      for (const msg of telegramMsgs) {
        const raw = (msg as any).raw_update || {};
        const payload = raw.message || raw.edited_message || raw.channel_post || raw.edited_channel_post || {};
        const text = msg.text || payload.text || payload.caption || '';

        if (useMobileAgentFlow && payment_reference) {
          if (text.toLowerCase().includes(payment_reference.toLowerCase())) {
            telegramMatch = true;
            matchedMsg = msg;
            telegramMatchDetail = `trnxID: ${payment_reference} found in SMS`;
            break;
          }
        } else {
          const hasLast4 = bankLast4 && text.includes(bankLast4);
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
            break;
          }
        }
      }
    }

    if (telegramMatch) {
      verificationLog.push(`✅ Telegram SMS matched (${telegramMatchDetail})`);
    } else {
      const matchInfo = useMobileAgentFlow ? `trnxID=${payment_reference}` : `bankLast4=${bankLast4}, bdt=${bdtNum}`;
      verificationLog.push(`❌ Telegram SMS no match (${matchInfo}, messages checked: ${telegramMsgs?.length ?? 0}, window: ${windowStart} → ${windowEnd})`);
    }

    // Decision — per method
    let allPassed = false;
    if (method === 'atm_deposit') {
      allPassed = ocrAmountMatch && ocrAccountMatch && ocrAtmCredit && ocrRefMatch && telegramMatch;
    } else if (method === 'cash_deposit') {
      allPassed = ocrAmountMatch && ocrAccountMatch && telegramMatch;
    } else {
      // bank_transfer — existing logic
      const ocrAvailable = ocrRef !== '' || ocrAmount > 0;
      allPassed = ocrAvailable ? (ocrRefMatch && ocrAmountMatch && telegramMatch) : telegramMatch;
    }
    const logText = `Auto-verification (${method}): ${verificationLog.join(' | ')}`;

    if (!allPassed) {
      await supabase.from('top_up_requests').update({ admin_note: logText }).eq('id', request_id);
      const failReasons: string[] = [];
      if (method === 'atm_deposit') {
        if (!ocrRefMatch) failReasons.push('OCR ref mismatch');
        if (!ocrAmountMatch) failReasons.push('OCR amount mismatch');
        if (!ocrAccountMatch) failReasons.push('OCR account mismatch');
        if (!ocrAtmCredit) failReasons.push('ATM Transfer Credit not found');
      } else if (method === 'cash_deposit') {
        if (!ocrAmountMatch) failReasons.push('OCR amount mismatch');
        if (!ocrAccountMatch) failReasons.push('OCR account mismatch');
      } else {
        const ocrAvailable = ocrRef !== '' || ocrAmount > 0;
        if (ocrAvailable && !ocrRefMatch) failReasons.push('OCR ref mismatch');
        if (ocrAvailable && !ocrAmountMatch) failReasons.push('OCR amount mismatch');
      }
      if (!telegramMatch) failReasons.push('No Telegram SMS match');
      return new Response(JSON.stringify({ ok: true, auto_approved: false, reason: failReasons.join(', '), retry_suggested: !telegramMatch }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Auto-approve
    console.log(`Auto-approving request ${request_id}: ${logText}`);

    const { error: updateErr } = await supabase
      .from('top_up_requests')
      .update({ status: 'approved', admin_note: logText, reviewed_by: null })
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
      user_id, type: 'top_up', amount: Number(amount), balance_after: newBalance,
      reference_id: request_id, description: 'Wallet top-up auto-approved', processed_by: 'system',
    });
    if (txErr) throw txErr;

    // Create invoice
    const { data: invNum } = await supabase.rpc('generate_invoice_number');
    await supabase.from('invoices').insert({
      top_up_request_id: request_id, invoice_number: invNum || `INV-${Date.now()}`,
      user_id, amount: Number(amount), bdt_amount: bdtNum, usd_rate: Number(request.usd_rate || 0),
    });

    // Notify client
    await supabase.from('notifications').insert({
      user_id, type: 'top_up_update', title: 'Top-Up Approved',
      message: `Your top-up of $${amount} has been auto-approved.`, reference_id: request_id,
    });

    // Mark matched Telegram message
    if (matchedMsg) {
      await supabase.from('telegram_messages').update({ matched_request_id: request_id }).eq('update_id', matchedMsg.update_id);

      // Send 👍 reaction
      try {
        const raw = matchedMsg.raw_update || {};
        const payload = raw.message || raw.edited_message || raw.channel_post || raw.edited_channel_post || {};
        const messageId = payload.message_id;
        const chatId = matchedMsg.chat_id;
        if (messageId && chatId) {
          const { data: botTokenSetting } = await supabase.from('site_settings').select('value').eq('key', 'telegram_bot_token').single();
          if (botTokenSetting?.value) {
            const reactionResp = await fetch(`https://api.telegram.org/bot${botTokenSetting.value}/setMessageReaction`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, message_id: messageId, reaction: [{ type: 'emoji', emoji: '👍' }] }),
            });
            console.log('Telegram reaction result:', JSON.stringify(await reactionResp.json()));
          }
        }
      } catch (e) {
        console.error('Telegram reaction failed (non-blocking):', e);
      }
    }

    // Forward proof image to Telegram group
    if (proof_url) {
      const { data: clientProfile } = await supabase.from('profiles').select('full_name, email').eq('user_id', user_id).single();
      const clientName = clientProfile?.full_name || clientProfile?.email || 'Unknown';
      const caption = `✅ <b>Auto-Approved Top-Up</b>\n👤 ${clientName}\n💰 $${amount} (৳${bdtNum.toLocaleString()})\n🔖 Ref: ${payment_reference || 'N/A'}`;
      await forwardProofToTelegram(supabase, proof_url, caption, bank_account_id);
    }

    // Auto-sync to seller ledger if bank has a seller assigned
    if (bank_account_id) {
      const { data: bankForSeller } = await supabase
        .from('bank_accounts')
        .select('seller_id')
        .eq('id', bank_account_id)
        .single();
      if (bankForSeller?.seller_id) {
        await supabase.from('seller_transactions').insert({
          seller_id: bankForSeller.seller_id,
          type: 'client_topup',
          bdt_amount: bdtNum,
          usdt_amount: 0,
          rate: 0,
          description: `Client top-up auto-approved — $${amount}`,
          bank_account_id: bank_account_id,
          top_up_request_id: request_id,
          proof_url: proof_url || null,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, auto_approved: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('verify-topup error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
