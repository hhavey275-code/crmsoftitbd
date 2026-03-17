import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const actId = account.account_id.startsWith("act_")
      ? account.account_id
      : `act_${account.account_id}`;

    if (action === "list") {
      const url = `https://graph.facebook.com/v24.0/${actId}/agencies?fields=id,name&access_token=${bm.access_token}`;
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

      const url = `https://graph.facebook.com/v24.0/${actId}/agencies?business=${partner_bm_id}&access_token=${bm.access_token}`;
      const resp = await fetch(url, { method: "DELETE" });
      const data = await resp.json();

      if (data.error) {
        throw new Error(data.error.message || "Failed to remove partner");
      }

      return new Response(JSON.stringify({ success: true, removed_bm_id: partner_bm_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List BM's available funding sources
    if (action === "list_funding_sources") {
      // Try multiple endpoints since Meta API varies by permission/version
      let sources: any[] = [];
      let lastError = "";

      // Approach 1: List ad account's own funding source details
      const url1 = `https://graph.facebook.com/v24.0/${actId}?fields=funding_source,funding_source_details&access_token=${bm.access_token}`;
      const resp1 = await fetch(url1);
      const data1 = await resp1.json();

      if (!data1.error && data1.funding_source_details) {
        const fsd = data1.funding_source_details;
        sources = [{
          id: data1.funding_source || fsd.id,
          display_string: fsd.display_string || `${fsd.type} ending ${fsd.id}`,
          type: fsd.type?.toString() || "unknown",
        }];
      } else {
        lastError = data1.error?.message || "";

        // Approach 2: List all ad accounts under BM and get their funding sources
        const url2 = `https://graph.facebook.com/v24.0/${bm.bm_id}/owned_ad_accounts?fields=id,name,funding_source,funding_source_details&limit=100&access_token=${bm.access_token}`;
        const resp2 = await fetch(url2);
        const data2 = await resp2.json();

        if (!data2.error && data2.data) {
          const seenIds = new Set<string>();
          for (const acc of data2.data) {
            if (acc.funding_source && !seenIds.has(acc.funding_source)) {
              seenIds.add(acc.funding_source);
              const fsd = acc.funding_source_details || {};
              sources.push({
                id: acc.funding_source,
                display_string: fsd.display_string || `Funding source from ${acc.name || acc.id}`,
                type: fsd.type?.toString() || "unknown",
              });
            }
          }
        } else {
          lastError = data2.error?.message || lastError;
        }
      }

      if (sources.length === 0 && lastError) {
        throw new Error(lastError || "No funding sources found");
      }

      return new Response(JSON.stringify({ funding_sources: sources }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Attach a funding source to an ad account
    if (action === "add_funding_source") {
      const { funding_source_id } = body;
      if (!funding_source_id) throw new Error("funding_source_id is required");

      const url = `https://graph.facebook.com/v24.0/${actId}?funding_source=${funding_source_id}&access_token=${bm.access_token}`;
      const resp = await fetch(url, { method: "POST" });
      const data = await resp.json();

      if (data.error) {
        throw new Error(data.error.message || "Failed to add funding source");
      }

      return new Response(JSON.stringify({ success: true, funding_source_id }), {
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
