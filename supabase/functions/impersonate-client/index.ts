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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is superadmin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { claims },
      error: claimsError,
    } = await (anonClient.auth as any).getClaims(token);

    if (claimsError || !claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claims.sub;

    // Check superadmin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .single();

    if (roleData?.role !== "superadmin") {
      return new Response(
        JSON.stringify({ error: "Only superadmins can impersonate clients" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { target_user_id } = await req.json();
    if (!target_user_id) {
      return new Response(
        JSON.stringify({ error: "target_user_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Generate a magic link for the target user
    const { data: linkData, error: linkError } =
      await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email: "", // will be filled below
      });

    // Get target user email first
    const { data: targetUser, error: targetError } =
      await adminClient.auth.admin.getUserById(target_user_id);

    if (targetError || !targetUser?.user) {
      return new Response(
        JSON.stringify({ error: "Target user not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Generate magic link with correct email
    const {
      data: magicLinkData,
      error: magicLinkError,
    } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: targetUser.user.email!,
    });

    if (magicLinkError) {
      return new Response(
        JSON.stringify({ error: magicLinkError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // The properties contain the token hash and verification type
    const hashed_token = magicLinkData.properties?.hashed_token;
    const verification_type = magicLinkData.properties?.verification_type || "magiclink";

    // Construct the redirect URL that will verify the token
    const redirectUrl = `${supabaseUrl}/auth/v1/verify?token=${hashed_token}&type=${verification_type}&redirect_to=${req.headers.get("origin") || supabaseUrl}/dashboard`;

    return new Response(
      JSON.stringify({ url: redirectUrl }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
