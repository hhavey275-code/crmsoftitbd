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

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const userId = user.id;

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

    // Use Meta API v24.0
    let allAccounts: any[] = [];
    let nextUrl: string | null = `https://graph.facebook.com/v24.0/${bm.bm_id}/owned_ad_accounts?fields=id,name,account_id,account_status,spend_cap,amount_spent,business_name&access_token=${bm.access_token}&limit=100`;

    // Paginate through all results
    while (nextUrl) {
      const metaRes = await fetch(nextUrl);
      const metaData = await metaRes.json();

      if (metaData.error) {
        // Log the failed sync
        await supabase.from("sync_logs").insert({
          business_manager_id: bm.id,
          synced_count: 0,
          total_count: 0,
          status: "error",
          error_message: metaData.error.message,
        });

        return new Response(
          JSON.stringify({
            error: `Meta API error: ${metaData.error.message}`,
          }),
          { status: 400, headers: corsHeaders }
        );
      }

      allAccounts = allAccounts.concat(metaData.data ?? []);
      nextUrl = metaData.paging?.next ?? null;
    }

    let synced = 0;

    for (const account of allAccounts) {
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

    const now = new Date().toISOString();

    // Update last_synced_at on the BM
    await supabase
      .from("business_managers")
      .update({ last_synced_at: now })
      .eq("id", bm.id);

    // Insert sync log
    await supabase.from("sync_logs").insert({
      business_manager_id: bm.id,
      synced_count: synced,
      total_count: allAccounts.length,
      status: "success",
    });

    return new Response(
      JSON.stringify({
        success: true,
        synced,
        total: allAccounts.length,
        last_synced_at: now,
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
