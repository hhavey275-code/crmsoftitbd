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

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { auth_code } = await req.json();
    if (!auth_code) return json({ error: "auth_code required" }, 400);

    const appId = Deno.env.get("TIKTOK_APP_ID");
    const appSecret = Deno.env.get("TIKTOK_APP_SECRET");
    if (!appId || !appSecret) {
      return json({ error: "TikTok app credentials not configured" }, 500);
    }

    // Exchange auth_code for access_token
    const res = await fetch(
      "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: appId,
          secret: appSecret,
          auth_code,
        }),
      }
    );

    const data = await res.json();

    if (data.code !== 0) {
      return json({ error: data.message || "Token exchange failed", details: data }, 400);
    }

    const tokenData = data.data;

    return json({
      success: true,
      access_token: tokenData.access_token,
      advertiser_ids: tokenData.advertiser_ids ?? [],
      scope: tokenData.scope ?? [],
      creator_id: tokenData.creator_id ?? null,
    });
  } catch (err) {
    console.error("tiktok-oauth error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
