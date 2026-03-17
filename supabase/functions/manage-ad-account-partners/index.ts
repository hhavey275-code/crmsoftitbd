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

    // Verify auth using getClaims
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

    // Check admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "superadmin"])
      .limit(1);
    if (!roleData || roleData.length === 0) throw new Error("Admin access required");

    const body = await req.json();
    const { action, ad_account_id } = body;

    // Get ad account with its BM
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
      // Fetch partner agencies from Meta
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

      // Remove partner agency from ad account
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

    throw new Error("Invalid action. Use 'list' or 'remove'.");
  } catch (err: any) {
    console.error("manage-ad-account-partners error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
