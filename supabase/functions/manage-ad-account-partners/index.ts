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

    if (action === "list") {
      const url = `https://graph.facebook.com/v24.0/${actId}/agencies?fields=id,name&access_token=${bmToken}`;
      const resp = await fetch(url);
      const data = await resp.json();

      if (data.error) {
        throw new Error(data.error.message || "Failed to fetch partners from Meta");
      }

      const partners = (data.data || []).map((p: any) => ({
        bm_id: p.id,
        name: p.name,
      }));

      return new Response(JSON.stringify({ partners }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "remove") {
      const { partner_bm_id } = body;
      if (!partner_bm_id) throw new Error("partner_bm_id is required");

      const url = `https://graph.facebook.com/v24.0/${actId}/agencies?business=${partner_bm_id}&access_token=${bmToken}`;
      const resp = await fetch(url, { method: "DELETE" });
      const data = await resp.json();

      if (data.error) {
        throw new Error(data.error.message || "Failed to remove partner");
      }

      return new Response(JSON.stringify({ success: true, removed_bm_id: partner_bm_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List payment methods: current ad account's funding source + all unique funding sources across BM's ad accounts
    if (action === "list_funding_sources") {
      const sources: any[] = [];
      const seenIds = new Set<string>();

      const collectFundingSources = async (initialUrl: string) => {
        let url: string | null = initialUrl;
        while (url) {
          const resp = await fetch(url);
          const data = await resp.json();
          if (data.error) {
            console.error("Meta API error:", data.error);
            break;
          }
          for (const acc of (data.data || [])) {
            const fsId = acc.funding_source;
            if (fsId && !seenIds.has(fsId)) {
              seenIds.add(fsId);
              const fsd = acc.funding_source_details || {};
              sources.push({
                id: fsId,
                display_string: fsd.display_string || `Funding source ${fsId}`,
                type: fsd.type?.toString() || "unknown",
                from_account: acc.name || acc.id,
              });
            }
          }
          url = data.paging?.next || null;
        }
      };

      // Fetch from both owned and client ad accounts
      await Promise.all([
        collectFundingSources(
          `https://graph.facebook.com/v24.0/${bm.bm_id}/owned_ad_accounts?fields=id,name,funding_source,funding_source_details&limit=200&access_token=${bmToken}`
        ),
        collectFundingSources(
          `https://graph.facebook.com/v24.0/${bm.bm_id}/client_ad_accounts?fields=id,name,funding_source,funding_source_details&limit=200&access_token=${bmToken}`
        ),
      ]);

      return new Response(JSON.stringify({ funding_sources: sources }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List all payment methods for THIS specific account
    if (action === "list_account_cards") {
      const cards: any[] = [];
      const seenIds = new Set<string>();

      const addCard = (id: string, displayString: string, type?: string) => {
        if (!id || seenIds.has(id)) return;
        seenIds.add(id);
        cards.push({ id, display_string: displayString || `Card ...${id.slice(-4)}`, type: type || "unknown" });
      };

      // 1) Direct funding_source_details on the account
      try {
        const r = await fetch(`https://graph.facebook.com/v24.0/${actId}?fields=funding_source,funding_source_details&access_token=${bmToken}`);
        const d = await r.json();
        if (d.funding_source_details?.id) {
          addCard(d.funding_source_details.id, d.funding_source_details.display_string, d.funding_source_details.type?.toString());
        }
      } catch (e) { console.error("direct fetch err:", e); }

      // 2) Try all_payment_methods edge on the ad account (undocumented but used by Ads Manager)
      try {
        const r = await fetch(`https://graph.facebook.com/v24.0/${actId}/all_payment_methods?fields=pm_credit_card_type,display_string,funding_source_type&access_token=${bmToken}`);
        const d = await r.json();
        if (d.data) {
          for (const pm of d.data) {
            addCard(pm.id, pm.display_string, pm.pm_credit_card_type || pm.funding_source_type);
          }
        }
      } catch (e) { console.error("all_payment_methods err:", e); }

      // 3) Try adspaymentcycle for historical/active payment methods
      try {
        const r = await fetch(`https://graph.facebook.com/v24.0/${actId}/adspaymentcycle?fields=funding_source_details&access_token=${bmToken}`);
        const d = await r.json();
        if (d.data) {
          for (const cycle of d.data) {
            const fsd = cycle.funding_source_details;
            if (fsd?.id) addCard(fsd.id, fsd.display_string, fsd.type?.toString());
          }
        }
      } catch (e) { console.error("adspaymentcycle err:", e); }

      // 4) Scan BM owned + client accounts for this specific actId
      const scanBmAccounts = async (url: string) => {
        let nextUrl: string | null = url;
        while (nextUrl) {
          try {
            const r = await fetch(nextUrl);
            const d = await r.json();
            if (d.error) break;
            for (const acc of (d.data || [])) {
              if (acc.id === actId || acc.id === actId.replace('act_', '')) {
                if (acc.funding_source && acc.funding_source_details?.id) {
                  addCard(acc.funding_source_details.id, acc.funding_source_details.display_string, acc.funding_source_details.type?.toString());
                }
              }
            }
            nextUrl = d.paging?.next || null;
          } catch { break; }
        }
      };

      await Promise.all([
        scanBmAccounts(`https://graph.facebook.com/v24.0/${bm.bm_id}/owned_ad_accounts?fields=id,funding_source,funding_source_details&limit=200&access_token=${bmToken}`),
        scanBmAccounts(`https://graph.facebook.com/v24.0/${bm.bm_id}/client_ad_accounts?fields=id,funding_source,funding_source_details&limit=200&access_token=${bmToken}`),
      ]);

      console.log(`list_account_cards for ${actId}: found ${cards.length} cards`, JSON.stringify(cards));

      return new Response(JSON.stringify({ cards }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Attach a funding source to an ad account
    if (action === "add_funding_source") {
      const { funding_source_id } = body;
      if (!funding_source_id) throw new Error("funding_source_id is required");

      const url = `https://graph.facebook.com/v24.0/${actId}?funding_source=${funding_source_id}&access_token=${bmToken}`;
      const resp = await fetch(url, { method: "POST" });
      const data = await resp.json();

      if (data.error) {
        throw new Error(data.error.message || "Failed to add funding source");
      }

      return new Response(JSON.stringify({ success: true, funding_source_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Remove funding source from ad account (set to none)
    if (action === "remove_funding_source") {
      // Meta doesn't have a direct DELETE for funding sources
      // We clear by POSTing with funding_source=0 or empty
      const url = `https://graph.facebook.com/v24.0/${actId}?funding_source=0&access_token=${bmToken}`;
      const resp = await fetch(url, { method: "POST" });
      const data = await resp.json();

      if (data.error) {
        throw new Error(data.error.message || "Failed to remove funding source");
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Invalid action. Use 'list', 'remove', 'list_funding_sources', or 'add_funding_source'.");
  } catch (err: any) {
    console.error("manage-ad-account-partners error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
