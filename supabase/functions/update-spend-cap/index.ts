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

    // Check admin
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

    const { ad_account_id, amount } = await req.json();
    if (!ad_account_id || !amount) {
      return new Response(
        JSON.stringify({ error: "ad_account_id and amount required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Get ad account with BM access token
    const { data: account, error: accErr } = await supabase
      .from("ad_accounts")
      .select("*, business_managers!inner(access_token, bm_id)")
      .eq("id", ad_account_id)
      .single();

    if (accErr || !account) {
      return new Response(
        JSON.stringify({ error: "Ad account not found" }),
        { status: 404, headers: corsHeaders }
      );
    }

    const bm = (account as any).business_managers;
    const newSpendCap = (Number(account.spend_cap) + amount) * 100; // Meta uses cents

    // Update spend cap via Meta API
    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${account.account_id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          spend_cap: String(Math.round(newSpendCap)),
          access_token: bm.access_token,
        }),
      }
    );

    const metaData = await metaRes.json();

    if (metaData.error) {
      return new Response(
        JSON.stringify({
          error: `Meta API error: ${metaData.error.message}`,
          meta_error: metaData.error,
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Update local spend_cap
    await supabase
      .from("ad_accounts")
      .update({ spend_cap: Number(account.spend_cap) + amount })
      .eq("id", ad_account_id);

    return new Response(
      JSON.stringify({
        success: true,
        new_spend_cap: Number(account.spend_cap) + amount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("update-spend-cap error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
