import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function decryptToken(stored: string, secret: string): Promise<string> {
  if (!stored.startsWith("enc:")) return stored;
  try {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: enc.encode("bm-token-enc-v1"), iterations: 100000, hash: "SHA-256" },
      keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
    );
    const combined = Uint8Array.from(atob(stored.slice(4)), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch { return stored; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error("Unauthorized");
    const userId = claimsData.claims.sub as string;

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "superadmin"])
      .limit(1);
    if (!roleData || roleData.length === 0) throw new Error("Admin access required");

    const body = await req.json();
    const { action, ad_account_id } = body;

    const { data: account, error: accErr } = await supabase
      .from("ad_accounts")
      .select("*, business_managers(id, name, access_token, bm_id)")
      .eq("id", ad_account_id)
      .single();
    if (accErr || !account) throw new Error("Ad account not found");

    const bm = (account as any).business_managers;
    if (!bm) throw new Error("No business manager linked to this ad account");

    const bmToken = await decryptToken(bm.access_token, serviceKey);

    const actId = account.account_id.startsWith("act_")
      ? account.account_id
      : `act_${account.account_id}`;

    // List partner agencies
    if (action === "list") {
      const url = `https://graph.facebook.com/v24.0/${actId}/agencies?fields=id,name&access_token=${bmToken}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.error) throw new Error(data.error.message || "Failed to fetch partners from Meta");

      const partners = (data.data || []).map((p: any) => ({
        bm_id: p.id,
        name: p.name,
      }));

      return new Response(JSON.stringify({ partners }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Remove partner agency
    if (action === "remove") {
      const { partner_bm_id } = body;
      if (!partner_bm_id) throw new Error("partner_bm_id is required");

      const url = `https://graph.facebook.com/v24.0/${actId}/agencies?business=${partner_bm_id}&access_token=${bmToken}`;
      const resp = await fetch(url, { method: "DELETE" });
      const data = await resp.json();
      if (data.error) throw new Error(data.error.message || "Failed to remove partner");

      return new Response(JSON.stringify({ success: true, removed_bm_id: partner_bm_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get payment methods attached to this ad account (default + backup if Meta exposes them)
    if (action === "list_account_cards") {
      const cards: any[] = [];
      const seenIds = new Set<string>();

      const addCard = (candidate: any, source: string) => {
        if (!candidate) return;

        const cardId = String(
          candidate.id || candidate.payment_method_id || candidate.funding_source || candidate.credential_id || ""
        ).trim();
        if (!cardId || seenIds.has(cardId)) return;

        const cc = candidate.pm_credit_card || {};
        const display =
          candidate.display_string ||
          cc.display_string ||
          candidate.funding_source_details?.display_string ||
          (cardId ? `Card ...${cardId.slice(-4)}` : "Unknown card");

        seenIds.add(cardId);
        cards.push({
          id: cardId,
          display_string: String(display),
          type: String(candidate.type || cc.card_type || candidate.funding_source_type || "unknown"),
          exp_month: candidate.exp_month ?? cc.exp_month ?? undefined,
          exp_year: candidate.exp_year ?? cc.exp_year ?? undefined,
          is_primary: Boolean(candidate.is_primary || candidate.primary || false),
          source,
        });
      };

      const parseCardArray = (items: any[], source: string) => {
        if (!Array.isArray(items)) return;
        for (const item of items) {
          addCard(item, source);
          if (item?.funding_source_details) addCard(item.funding_source_details, `${source}:funding_source_details`);
        }
      };

      const parsePayload = (payload: any, source: string) => {
        if (!payload || payload.error) return;

        parseCardArray(payload.data, source);

        parseCardArray(payload.all_payment_methods?.data, `${source}:all_payment_methods`);
        parseCardArray(payload.payment_methods?.data, `${source}:payment_methods`);

        const paymentCycleData = payload.adspaymentcycle?.data;
        if (Array.isArray(paymentCycleData)) {
          for (const cycle of paymentCycleData) {
            if (cycle?.funding_source_details) {
              addCard(cycle.funding_source_details, `${source}:adspaymentcycle`);
            }
          }
        }

        if (payload.funding_source_details) {
          addCard(
            {
              id: payload.funding_source || payload.funding_source_details.id,
              ...payload.funding_source_details,
              is_primary: true,
            },
            `${source}:funding_source_details`
          );
        }
      };

      const fetchJson = async (url: string, source: string) => {
        try {
          const resp = await fetch(url);
          const data = await resp.json();
          if (data?.error) {
            console.log(`${source} for ${actId} error:`, JSON.stringify(data.error));
          }
          return data;
        } catch (e: any) {
          console.error(`${source} for ${actId} failed:`, e?.message || e);
          return null;
        }
      };

      const [allPaymentMethodsEdge, paymentMethodsEdge, accountDetails] = await Promise.all([
        fetchJson(
          `https://graph.facebook.com/v24.0/${actId}/all_payment_methods?fields=id,display_string,type,is_primary,funding_source_type,exp_month,exp_year,pm_credit_card&access_token=${bmToken}`,
          "all_payment_methods"
        ),
        fetchJson(
          `https://graph.facebook.com/v24.0/${actId}/payment_methods?fields=id,display_string,type,is_primary,funding_source_type,exp_month,exp_year,pm_credit_card&access_token=${bmToken}`,
          "payment_methods"
        ),
        fetchJson(
          `https://graph.facebook.com/v24.0/${actId}?fields=funding_source,funding_source_details,all_payment_methods{id,display_string,type,is_primary,exp_month,exp_year,pm_credit_card},payment_methods{id,display_string,type,is_primary,exp_month,exp_year,pm_credit_card},adspaymentcycle{funding_source_details}&access_token=${bmToken}`,
          "account_details"
        ),
      ]);

      parsePayload(allPaymentMethodsEdge, "all_payment_methods");
      parsePayload(paymentMethodsEdge, "payment_methods");
      parsePayload(accountDetails, "account_details");

      cards.sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)));

      console.log(`list_account_cards for ${actId}: found ${cards.length} cards total`);

      return new Response(JSON.stringify({ cards }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Remove a specific payment method from the ad account
    if (action === "remove_funding_source") {
      const { payment_method_id } = body;

      const tryDeleteFromEdge = async (edge: "all_payment_methods" | "payment_methods") => {
        const url = `https://graph.facebook.com/v24.0/${actId}/${edge}`;
        const resp = await fetch(url, {
          method: "DELETE",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            payment_method_id: String(payment_method_id),
            access_token: bmToken,
          }),
        });
        const data = await resp.json().catch(() => ({}));
        const ok = Boolean(data === true || data?.success || !data?.error);
        return { edge, ok, data };
      };

      if (payment_method_id) {
        const attempts = await Promise.all([
          tryDeleteFromEdge("all_payment_methods"),
          tryDeleteFromEdge("payment_methods"),
        ]);

        const success = attempts.find((attempt) => attempt.ok);
        if (!success) {
          const details = attempts.map((a) => `${a.edge}: ${JSON.stringify(a.data)}`).join(" | ");
          throw new Error(`Failed to remove payment method. ${details}`);
        }

        return new Response(JSON.stringify({ success: true, removed_id: payment_method_id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fallback: clear primary funding source entirely
      const url = `https://graph.facebook.com/v24.0/${actId}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          funding_source: "0",
          access_token: bmToken,
        }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error.message || "Failed to remove funding source");

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Invalid action. Use 'list', 'remove', 'list_account_cards', or 'remove_funding_source'.");
  } catch (err: any) {
    console.error("manage-ad-account-partners error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
