import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const userId = claimsData.claims.sub;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const { business_manager_id } = await req.json();
    if (!business_manager_id) {
      return new Response(
        JSON.stringify({ error: "business_manager_id required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const { data: bm, error: bmError } = await supabase
      .from("business_managers")
      .select("*")
      .eq("id", business_manager_id)
      .single();

    if (bmError || !bm) {
      return new Response(
        JSON.stringify({ error: "Business Manager not found" }),
        { status: 404, headers: corsHeaders }
      );
    }

    const metaUrl = `https://graph.facebook.com/v21.0/${bm.bm_id}/owned_ad_accounts?fields=id,name,account_id,account_status,spend_cap,amount_spent,business_name&access_token=${bm.access_token}&limit=100`;

    const metaRes = await fetch(metaUrl);
    const metaData = await metaRes.json();

    if (metaData.error) {
      return new Response(
        JSON.stringify({
          error: `Meta API error: ${metaData.error.message}`,
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    const accounts = metaData.data ?? [];
    let synced = 0;

    for (const account of accounts) {
      const accountId = account.account_id || account.id?.replace("act_", "");
      const { error: upsertError } = await supabase
        .from("ad_accounts")
        .upsert(
          {
            account_id: `act_${accountId}`,
            account_name: account.name || `Ad Account ${accountId}`,
            business_manager_id: bm.id,
            business_name: account.business_name || null,
            user_id: userId,
            status:
              account.account_status === 1
                ? "active"
                : account.account_status === 2
                ? "disabled"
                : "pending",
            spend_cap: Number(account.spend_cap ?? 0) / 100,
            amount_spent: Number(account.amount_spent ?? 0) / 100,
          },
          { onConflict: "account_id" }
        );

      if (!upsertError) synced++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced,
        total: accounts.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("sync-bm-accounts error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
