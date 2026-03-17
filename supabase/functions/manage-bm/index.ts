import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("bm-token-enc-v1"), iterations: 100000, hash: "SHA-256" },
    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

async function encryptToken(token: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(token);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded));
  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(iv);
  combined.set(encrypted, iv.length);
  return "enc:" + btoa(String.fromCharCode(...combined));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await anonClient.auth.getUser(token);
    if (userErr || !user) throw new Error("Unauthorized");

    const supabase = createClient(supabaseUrl, serviceKey);

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "superadmin"])
      .limit(1);
    if (!roleData || roleData.length === 0) throw new Error("Admin access required");

    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { bm_id, name, access_token } = body;
      if (!bm_id || !name || !access_token) throw new Error("bm_id, name, and access_token are required");

      const encryptedToken = await encryptToken(access_token, serviceKey);
      const { data, error } = await supabase.from("business_managers").insert({
        bm_id,
        name,
        access_token: encryptedToken,
      }).select().single();
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const { id, name, bm_id, access_token } = body;
      if (!id) throw new Error("id is required");

      const updates: Record<string, any> = {};
      if (name !== undefined && name !== "") updates.name = name;
      if (bm_id !== undefined && bm_id !== "") updates.bm_id = bm_id;
      if (access_token !== undefined && access_token !== "") {
        updates.access_token = await encryptToken(access_token, serviceKey);
      }

      if (Object.keys(updates).length === 0) throw new Error("No fields to update");

      const { error } = await supabase.from("business_managers").update(updates).eq("id", id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Encrypt all existing plaintext tokens
    if (action === "encrypt_existing") {
      const { data: bms, error: bmErr } = await supabase.from("business_managers").select("id, access_token");
      if (bmErr) throw bmErr;

      let encrypted = 0;
      for (const bm of bms ?? []) {
        if (!bm.access_token.startsWith("enc:")) {
          const enc = await encryptToken(bm.access_token, serviceKey);
          await supabase.from("business_managers").update({ access_token: enc }).eq("id", bm.id);
          encrypted++;
        }
      }
      return new Response(JSON.stringify({ success: true, encrypted }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Invalid action");
  } catch (err: any) {
    console.error("manage-bm error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
