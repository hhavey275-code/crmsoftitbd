

## Plan: Alternative Meta API Endpoint দিয়ে BM Partner Access

### সমস্যা
বর্তমানে `POST /{act_id}/agencies` endpoint ব্যবহার করা হচ্ছে partner add করতে, কিন্তু Meta App এর Advanced Access না থাকায় `(#3) Application does not have the capability` error আসছে।

### সমাধান
Edge function এ `add_partner` action পরিবর্তন করে **3-step fallback strategy** implement করা:

1. **প্রথম চেষ্টা**: `POST /{owner_bm_id}/managed_businesses` — Owner BM side থেকে partner BM কে ad account share
2. **দ্বিতীয় চেষ্টা**: `POST /{owner_bm_id}/client_ad_accounts` — Client ad account হিসেবে assign
3. **তৃতীয় চেষ্টা (fallback)**: পুরনো `POST /{act_id}/agencies` endpoint

### কোড পরিবর্তন

**File: `supabase/functions/manage-ad-account-partners/index.ts`**

`add_partner` action block (lines 94-113) পরিবর্তন:

```typescript
if (action === "add_partner") {
  const { partner_bm_id } = body;
  if (!partner_bm_id) throw new Error("partner_bm_id is required");
  
  const ownerBmId = bm.bm_id; // Owner BM's Meta ID
  const errors: string[] = [];

  // Attempt 1: POST /{owner_bm_id}/managed_businesses
  try {
    const resp = await fetch(`https://graph.facebook.com/v24.0/${ownerBmId}/managed_businesses`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        existing_client_business_id: partner_bm_id,
        access_token: bmToken,
      }),
    });
    const data = await resp.json();
    if (!data.error) {
      return success response;
    }
    errors.push(`managed_businesses: ${data.error.message}`);
  } catch (e) { errors.push(...) }

  // Attempt 2: POST /{owner_bm_id}/client_ad_accounts
  try {
    const resp = await fetch(`https://graph.facebook.com/v24.0/${ownerBmId}/client_ad_accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        adaccount_id: actId,
        permitted_tasks: JSON.stringify(["ADVERTISE"]),
        business: partner_bm_id,
        access_token: bmToken,
      }),
    });
    const data = await resp.json();
    if (!data.error) {
      return success response;
    }
    errors.push(`client_ad_accounts: ${data.error.message}`);
  } catch (e) { errors.push(...) }

  // Attempt 3: Original POST /{act_id}/agencies (fallback)
  try {
    const resp = await fetch(`https://graph.facebook.com/v24.0/${actId}/agencies`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        business: partner_bm_id,
        permitted_tasks: JSON.stringify(["ADVERTISE"]),
        access_token: bmToken,
      }),
    });
    const data = await resp.json();
    if (!data.error) {
      return success response;
    }
    errors.push(`agencies: ${data.error.message}`);
  } catch (e) { errors.push(...) }

  // All failed
  throw new Error(`All methods failed: ${errors.join(" | ")}`);
}
```

Edge function deploy হবে এবং test করা হবে।

### কোনো UI পরিবর্তন নেই
AdminRequests.tsx যেভাবে আছে সেভাবেই থাকবে — শুধু edge function এর internal logic পরিবর্তন।

