import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// VAPID signing utilities for Web Push
async function generateVapidAuth(
  endpoint: string,
  vapidSubject: string,
  vapidPublicKey: string,
  vapidPrivateKey: string
) {
  const urlObj = new URL(endpoint);
  const audience = `${urlObj.protocol}//${urlObj.host}`;

  // Create JWT header and payload
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: vapidSubject,
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import private key and sign
  const privateKeyBytes = base64urlDecode(vapidPrivateKey);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    convertECPrivateKeyToPKCS8(privateKeyBytes),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsignedToken)
  );

  const signatureB64 = base64urlEncodeBuffer(convertDERToRaw(new Uint8Array(signature)));
  const jwt = `${unsignedToken}.${signatureB64}`;

  const publicKeyBytes = base64urlDecode(vapidPublicKey);
  const publicKeyB64 = base64urlEncodeBuffer(publicKeyBytes);

  return {
    authorization: `vapid t=${jwt}, k=${publicKeyB64}`,
  };
}

function base64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlEncodeBuffer(buffer: Uint8Array): string {
  let binary = "";
  for (const byte of buffer) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Convert raw 32-byte EC private key to PKCS8 DER format
function convertECPrivateKeyToPKCS8(rawKey: Uint8Array): ArrayBuffer {
  // PKCS8 wrapper for P-256 EC key
  const pkcs8Header = new Uint8Array([
    0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86,
    0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
    0x03, 0x01, 0x07, 0x04, 0x6d, 0x30, 0x6b, 0x02, 0x01, 0x01, 0x04, 0x20,
  ]);
  // After the private key bytes, we need the suffix
  const pkcs8Suffix = new Uint8Array([
    0xa1, 0x44, 0x03, 0x42, 0x00,
  ]);

  // We only need the private key without the public key part for signing
  const result = new Uint8Array(pkcs8Header.length + rawKey.length);
  result.set(pkcs8Header);
  result.set(rawKey, pkcs8Header.length);
  
  // Simplified: just wrap the raw key in PKCS8 format
  const der = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86,
    0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce,
    0x3d, 0x03, 0x01, 0x07, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01, 0x01,
    0x04, 0x20,
    ...rawKey,
  ]);
  return der.buffer;
}

// Convert DER signature to raw 64-byte format
function convertDERToRaw(der: Uint8Array): Uint8Array {
  // DER: 0x30 <len> 0x02 <len_r> <r> 0x02 <len_s> <s>
  const raw = new Uint8Array(64);
  let offset = 2; // skip 0x30 and total length
  
  // R value
  offset++; // skip 0x02
  const rLen = der[offset++];
  const rStart = offset + (rLen > 32 ? rLen - 32 : 0);
  const rDest = 32 - Math.min(rLen, 32);
  raw.set(der.slice(rStart, offset + rLen), rDest);
  offset += rLen;
  
  // S value
  offset++; // skip 0x02
  const sLen = der[offset++];
  const sStart = offset + (sLen > 32 ? sLen - 32 : 0);
  const sDest = 32 + 32 - Math.min(sLen, 32);
  raw.set(der.slice(sStart, offset + sLen), sDest);
  
  return raw;
}

// Encrypt payload using ECDH + HKDF + AES-GCM (RFC 8291)
async function encryptPayload(
  payload: string,
  p256dhKey: string,
  authSecret: string
) {
  const payloadBytes = new TextEncoder().encode(payload);
  const userPublicKey = base64urlDecode(p256dhKey);
  const userAuth = base64urlDecode(authSecret);

  // Generate local ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  const localPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", localKeyPair.publicKey)
  );

  // Import subscriber's public key
  const subscriberKey = await crypto.subtle.importKey(
    "raw",
    userPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: subscriberKey },
      localKeyPair.privateKey,
      256
    )
  );

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF for auth info
  const authInfo = createInfo("auth", new Uint8Array(0), new Uint8Array(0));
  const prkKey = await crypto.subtle.importKey(
    "raw",
    userAuth,
    { name: "HKDF" },
    false,
    ["deriveBits"]
  );

  // IKM = HKDF(auth_secret, ecdh_secret, auth_info, 32)
  const ikmHkdfKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    { name: "HKDF" },
    false,
    ["deriveBits"]
  );

  // Use HMAC-based approach for the PRK
  const prkHmacKey = await crypto.subtle.importKey(
    "raw",
    userAuth,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const prk = new Uint8Array(
    await crypto.subtle.sign("HMAC", prkHmacKey, sharedSecret)
  );

  // Derive IKM
  const ikm = await hkdfExpand(prk, authInfo, 32);

  // PRK for content encryption
  const prkCeHmacKey = await crypto.subtle.importKey(
    "raw",
    salt,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const prkCe = new Uint8Array(
    await crypto.subtle.sign("HMAC", prkCeHmacKey, ikm)
  );

  // Content encryption key
  const cekInfo = createInfo("aesgcm", userPublicKey, localPublicKeyRaw);
  const cek = await hkdfExpand(prkCe, cekInfo, 16);

  // Nonce
  const nonceInfo = createInfo("nonce", userPublicKey, localPublicKeyRaw);
  const nonce = await hkdfExpand(prkCe, nonceInfo, 12);

  // Add padding
  const paddingLength = 0;
  const paddedPayload = new Uint8Array(2 + paddingLength + payloadBytes.length);
  paddedPayload[0] = (paddingLength >> 8) & 0xff;
  paddedPayload[1] = paddingLength & 0xff;
  paddedPayload.set(payloadBytes, 2 + paddingLength);

  // Encrypt with AES-128-GCM
  const aesKey = await crypto.subtle.importKey(
    "raw",
    cek,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aesKey,
      paddedPayload
    )
  );

  return { encrypted, salt, localPublicKeyRaw };
}

function createInfo(
  type: string,
  clientPublicKey: Uint8Array,
  serverPublicKey: Uint8Array
): Uint8Array {
  const typeBytes = new TextEncoder().encode(`Content-Encoding: ${type}\0`);
  const p256Prefix = new TextEncoder().encode("P-256\0");

  const info = new Uint8Array(
    typeBytes.length +
      p256Prefix.length +
      2 +
      clientPublicKey.length +
      2 +
      serverPublicKey.length
  );

  let offset = 0;
  info.set(typeBytes, offset);
  offset += typeBytes.length;
  info.set(p256Prefix, offset);
  offset += p256Prefix.length;
  info[offset++] = 0;
  info[offset++] = clientPublicKey.length;
  info.set(clientPublicKey, offset);
  offset += clientPublicKey.length;
  info[offset++] = 0;
  info[offset++] = serverPublicKey.length;
  info.set(serverPublicKey, offset);

  return info;
}

async function hkdfExpand(
  prk: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    prk,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const input = new Uint8Array(info.length + 1);
  input.set(info);
  input[info.length] = 1;

  const output = new Uint8Array(
    await crypto.subtle.sign("HMAC", hmacKey, input)
  );
  return output.slice(0, length);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, title, message, type } = await req.json();

    if (!user_id || !title) {
      return new Response(
        JSON.stringify({ error: "user_id and title required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@crmsoftitbd.com";

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get all push subscriptions for this user
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user_id);

    if (error) {
      console.error("Error fetching subscriptions:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch subscriptions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: "No push subscriptions found for user" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payloadJson = JSON.stringify({
      title,
      body: message || "",
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      data: { type, url: getUrlForType(type) },
    });

    const results = [];

    for (const sub of subscriptions) {
      try {
        // Generate VAPID authorization
        const { authorization } = await generateVapidAuth(
          sub.endpoint,
          vapidSubject,
          vapidPublicKey,
          vapidPrivateKey
        );

        // Encrypt payload
        const { encrypted, salt, localPublicKeyRaw } = await encryptPayload(
          payloadJson,
          sub.p256dh,
          sub.auth
        );

        // Send push notification
        const response = await fetch(sub.endpoint, {
          method: "POST",
          headers: {
            Authorization: authorization,
            "Content-Encoding": "aesgcm",
            "Content-Type": "application/octet-stream",
            Encryption: `salt=${base64urlEncodeBuffer(salt)}`,
            "Crypto-Key": `dh=${base64urlEncodeBuffer(localPublicKeyRaw)}; p256ecdsa=${vapidPublicKey}`,
            TTL: "86400",
            Urgency: "high",
          },
          body: encrypted,
        });

        if (response.status === 410 || response.status === 404) {
          // Subscription expired, remove it
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("id", sub.id);
          results.push({ endpoint: sub.endpoint, status: "removed" });
        } else if (!response.ok) {
          const text = await response.text();
          console.error(`Push failed for ${sub.endpoint}: ${response.status} ${text}`);
          results.push({ endpoint: sub.endpoint, status: "failed", code: response.status });
        } else {
          results.push({ endpoint: sub.endpoint, status: "sent" });
        }
      } catch (pushError) {
        console.error(`Error sending to ${sub.endpoint}:`, pushError);
        results.push({ endpoint: sub.endpoint, status: "error" });
      }
    }

    return new Response(
      JSON.stringify({ results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-push-notification error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getUrlForType(type: string): string {
  switch (type) {
    case "chat_message":
      return "/chat";
    case "client_status":
      return "/dashboard";
    case "new_signup":
      return "/clients";
    case "top_up_request":
    case "top_up_approved":
    case "top_up_rejected":
    case "top_up_on_hold":
      return "/top-up";
    case "ad_account_request":
      return "/requests";
    case "bm_access_request":
      return "/requests";
    default:
      return "/dashboard";
  }
}
