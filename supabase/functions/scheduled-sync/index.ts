import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    for (const bm of bms ?? []) {
      try {
        const accessToken = await decryptToken(bm.access_token, serviceKey);
        const metaUrl = `https://graph.facebook.com/v21.0/${bm.bm_id}/owned_ad_accounts?fields=id,name,account_id,account_status,spend_cap,amount_spent&access_token=${accessToken}&limit=100`;

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

          // NOTE: We do NOT sync spend_cap from Meta here. Our system (spend-cap-update function)
          // is the source of truth for spend_cap. Meta may return 0 for accounts with no cap set,
          // which would incorrectly reset our local spend_cap values.
          await supabase
            .from("ad_accounts")
            .update({
              status:
                account.account_status === 1
                  ? "active"
                  : account.account_status === 2
                  ? "disabled"
                  : "pending",
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
