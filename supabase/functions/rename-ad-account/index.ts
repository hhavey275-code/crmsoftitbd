import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.claims.sub;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if caller is admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .single();

    const isAdmin = !!roleData;

    const { ad_account_id, new_name } = await req.json();
    if (!ad_account_id || !new_name || !new_name.trim()) {
      return new Response(
        JSON.stringify({ error: "ad_account_id and new_name required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Non-admin must have the account assigned
    if (!isAdmin) {
      const { data: assignment } = await supabase
        .from("user_ad_accounts")
        .select("id")
        .eq("user_id", callerId)
        .eq("ad_account_id", ad_account_id)
        .single();
      if (!assignment) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch ad account + BM info
    const { data: account, error: accErr } = await supabase
      .from("ad_accounts")
      .select("*, business_managers!inner(access_token, bm_id)")
      .eq("id", ad_account_id)
      .single();

    if (accErr || !account) {
      return new Response(
        JSON.stringify({ error: "Ad account not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const bm = (account as any).business_managers;

    const actId = account.account_id.startsWith("act_")
      ? account.account_id
      : `act_${account.account_id}`;

    // Call Meta API to rename account
    const metaRes = await fetch(
      `https://graph.facebook.com/v24.0/${actId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          name: new_name.trim(),
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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update local DB
    await supabase
      .from("ad_accounts")
      .update({ account_name: new_name.trim() })
      .eq("id", ad_account_id);

    return new Response(
      JSON.stringify({
        success: true,
        old_name: account.account_name,
        new_name: new_name.trim(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("rename-ad-account error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
