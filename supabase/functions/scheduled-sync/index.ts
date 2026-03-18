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

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// Fetch all pages with delay between pages
async function fetchAllPages(url: string): Promise<any[]> {
  const results: any[] = [];
  let nextUrl: string | null = url;
  while (nextUrl) {
    const res = await fetch(nextUrl);
    const data = await res.json();
    if (data.error) {
      throw new Error(data.error.message);
    }
    results.push(...(data.data ?? []));
    nextUrl = data.paging?.next ?? null;
    if (nextUrl) await delay(300); // delay between pages
  }
  return results;
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

        // Use fetchAllPages with pagination support
        const accounts = await fetchAllPages(
          `https://graph.facebook.com/v25.0/${bm.bm_id}/owned_ad_accounts?fields=id,name,account_id,account_status,spend_cap,amount_spent&access_token=${accessToken}&limit=100`
        );

        // Process accounts in batches of 10 with delay
        for (let i = 0; i < accounts.length; i++) {
          const account = accounts[i];
          const accountId = account.account_id || account.id?.replace("act_", "");

          const metaSpendCapCents = Number(account.spend_cap ?? 0);
          const metaSpendCapDollars = metaSpendCapCents / 100;
          const updateData: any = {
            status:
              account.account_status === 1
                ? "active"
                : account.account_status === 2
                ? "disabled"
                : "pending",
            amount_spent: Number(account.amount_spent ?? 0) / 100,
          };
          if (metaSpendCapDollars > 0) {
            updateData.spend_cap = metaSpendCapDollars;
          }
          await supabase
            .from("ad_accounts")
            .update(updateData)
            .eq("account_id", `act_${accountId}`);

          totalSynced++;

          // Add small delay every 10 accounts
          if (i > 0 && i % 10 === 0) {
            await delay(200);
          }
        }
      } catch (bmErr) {
        console.error(`Error syncing BM ${bm.bm_id}:`, bmErr);
        // Mark BM as inactive if token expired
        if (bmErr instanceof Error && bmErr.message?.includes("expired")) {
          await supabase
            .from("business_managers")
            .update({ status: "inactive" })
            .eq("id", bm.id);
        }
      }

        // Log API calls for this BM
        if (accounts.length > 0) {
          await supabase.from("api_call_logs").insert({
            business_manager_id: bm.id,
            function_name: "scheduled-sync",
            call_count: accounts.length + 1, // 1 for listing + 1 per account update
          });
        }

        // Delay between BMs
        await delay(500);
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
