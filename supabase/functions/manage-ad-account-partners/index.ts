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

    // Get ALL payment methods attached to this ad account
    if (action === "list_account_cards") {
      const cards: any[] = [];
      const seenIds = new Set<string>();

      const addCard = (id: string, displayString: string, type?: string, extra?: any) => {
        if (!id || seenIds.has(id)) return;
        seenIds.add(id);
        cards.push({
          id,
          display_string: displayString || `Card ...${id.slice(-4)}`,
          type: type || "unknown",
          ...extra,
        });
      };

      // Method 1: adspaymentmethods edge - returns ALL payment methods (default + backup)
      try {
        const resp = await fetch(
          `https://graph.facebook.com/v24.0/${actId}/adspaymentmethods?fields=pm_credit_card_type,display_string,funding_source_type,exp_month,exp_year&access_token=${bmToken}`
        );
        const data = await resp.json();
        console.log(`adspaymentmethods for ${actId}:`, JSON.stringify(data));
        if (data.data && Array.isArray(data.data)) {
          for (const pm of data.data) {
            addCard(
              pm.id || "",
              pm.display_string || "",
              pm.pm_credit_card_type || pm.funding_source_type?.toString() || "unknown",
              {
                exp_month: pm.exp_month,
                exp_year: pm.exp_year,
              }
            );
          }
        }
      } catch (e) {
        console.error("adspaymentmethods edge failed:", e);
      }

      // Method 2: Fallback to funding_source_details if method 1 returned nothing
      if (cards.length === 0) {
        try {
          const resp = await fetch(
            `https://graph.facebook.com/v24.0/${actId}?fields=funding_source,funding_source_details&access_token=${bmToken}`
          );
          const data = await resp.json();
          if (data.funding_source_details) {
            addCard(
              data.funding_source || data.funding_source_details.id || "",
              data.funding_source_details.display_string || "Unknown card",
              data.funding_source_details.type?.toString() || "unknown"
            );
          }
        } catch (e) {
          console.error("funding_source_details fallback failed:", e);
        }
      }

      console.log(`list_account_cards for ${actId}: found ${cards.length} cards total`);

      return new Response(JSON.stringify({ cards }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Remove a specific payment method from the ad account
    if (action === "remove_funding_source") {
      const { payment_method_id } = body;

      if (payment_method_id) {
        // Remove specific payment method by ID via adspaymentmethods edge
        const url = `https://graph.facebook.com/v24.0/${actId}/adspaymentmethods`;
        const resp = await fetch(url, {
          method: "DELETE",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            payment_method_id: payment_method_id,
            access_token: bmToken,
          }),
        });
        const data = await resp.json();
        console.log(`remove payment_method ${payment_method_id} from ${actId}:`, JSON.stringify(data));
        if (data.error) throw new Error(data.error.message || "Failed to remove payment method");

        return new Response(JSON.stringify({ success: true, removed_id: payment_method_id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        // Fallback: clear funding source entirely
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
