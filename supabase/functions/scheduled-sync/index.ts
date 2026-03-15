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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all active BMs
    const { data: bms, error: bmsError } = await supabase
      .from("business_managers")
      .select("*")
      .eq("status", "active");

    if (bmsError) throw bmsError;

    let totalSynced = 0;

    for (const bm of bms ?? []) {
      try {
        const metaUrl = `https://graph.facebook.com/v21.0/${bm.bm_id}/owned_ad_accounts?fields=id,name,account_id,account_status,spend_cap,amount_spent&access_token=${bm.access_token}&limit=100`;

        const metaRes = await fetch(metaUrl);
        const metaData = await metaRes.json();

        if (metaData.error) {
          console.error(`Meta API error for BM ${bm.bm_id}:`, metaData.error.message);
          // Mark BM as inactive if token expired
          if (metaData.error.code === 190) {
            await supabase
              .from("business_managers")
              .update({ status: "inactive" })
              .eq("id", bm.id);
          }
          continue;
        }

        for (const account of metaData.data ?? []) {
          const accountId =
            account.account_id || account.id?.replace("act_", "");

          await supabase
            .from("ad_accounts")
            .update({
              status:
                account.account_status === 1
                  ? "active"
                  : account.account_status === 2
                  ? "disabled"
                  : "pending",
              spend_cap: Number(account.spend_cap ?? 0) / 100,
              amount_spent: Number(account.amount_spent ?? 0) / 100,
            })
            .eq("account_id", `act_${accountId}`);

          totalSynced++;
        }
      } catch (bmErr) {
        console.error(`Error syncing BM ${bm.bm_id}:`, bmErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        bms_processed: bms?.length ?? 0,
        accounts_synced: totalSynced,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("scheduled-sync error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
