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
  }
  return results;
}

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
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);
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

    // Check admin or superadmin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    const isAdmin = roleData?.role === "admin" || roleData?.role === "superadmin";
    if (!isAdmin) {
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

    // Validate bm_id is a numeric Meta ID
    if (!/^\d+$/.test(bm.bm_id)) {
      return new Response(
        JSON.stringify({ error: `Invalid BM ID "${bm.bm_id}" — must be a numeric Meta Business Manager ID (e.g. 687551173144972). Please update this BM's ID.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fields = "id,name,account_id,account_status,spend_cap,amount_spent,business_name";
    const baseUrl = `https://graph.facebook.com/v24.0/${bm.bm_id}`;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = await decryptToken(bm.access_token, serviceKey);

    // Fetch owned + client ad accounts in parallel
    const [ownedResult, clientResult] = await Promise.allSettled([
      fetchAllPages(
        `${baseUrl}/owned_ad_accounts?fields=${fields}&access_token=${token}&limit=100`
      ),
      fetchAllPages(
        `${baseUrl}/client_ad_accounts?fields=${fields}&access_token=${token}&limit=100`
      ),
    ]);

    const ownedAccounts = ownedResult.status === "fulfilled" ? ownedResult.value : [];
    const clientAccounts = clientResult.status === "fulfilled" ? clientResult.value : [];

    if (ownedResult.status === "rejected") {
      console.error("Error fetching owned_ad_accounts:", ownedResult.reason);
    }
    if (clientResult.status === "rejected") {
      console.error("Error fetching client_ad_accounts:", clientResult.reason);
    }

    if (ownedAccounts.length === 0 && clientAccounts.length === 0) {
      await supabase.from("sync_logs").insert({
        business_manager_id: bm.id,
        synced_count: 0,
        total_count: 0,
        status: "error",
        error_message: "No accounts returned from owned or client endpoints",
      });

      return new Response(
        JSON.stringify({ error: "No ad accounts found from Meta API" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Deduplicate by account_id
    const accountMap = new Map<string, any>();
    for (const account of [...ownedAccounts, ...clientAccounts]) {
      const accountId = account.account_id || account.id?.replace("act_", "");
      if (accountId && !accountMap.has(accountId)) {
        accountMap.set(accountId, account);
      }
    }

    const allAccounts = Array.from(accountMap.values());

    // Transform to normalized format (but do NOT insert into DB)
    const rows = allAccounts.map((account) => {
      const accountId = account.account_id || account.id?.replace("act_", "");
      return {
        account_id: `act_${accountId}`,
        account_name: account.name || `Ad Account ${accountId}`,
        business_manager_id: bm.id,
        business_name: account.business_name || null,
        status:
          account.account_status === 1
            ? "active"
            : account.account_status === 2
            ? "disabled"
            : "pending",
        spend_cap: Number(account.spend_cap ?? 0) / 100,
        amount_spent: Number(account.amount_spent ?? 0) / 100,
      };
    });

    const now = new Date().toISOString();

    // Update BM last_synced_at and insert sync log
    await Promise.all([
      supabase
        .from("business_managers")
        .update({ last_synced_at: now })
        .eq("id", bm.id),
      supabase.from("sync_logs").insert({
        business_manager_id: bm.id,
        synced_count: rows.length,
        total_count: allAccounts.length,
        status: "success",
        error_message: null,
      }),
    ]);

    // Return the accounts list for frontend selection (no auto-insert)
    return new Response(
      JSON.stringify({
        success: true,
        accounts: rows,
        total: allAccounts.length,
        owned: ownedAccounts.length,
        client: clientAccounts.length,
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
