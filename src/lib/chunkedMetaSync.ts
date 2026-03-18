import { supabase } from "@/integrations/supabase/client";

const CHUNK_SIZE = 50;

/**
 * Fetch account insights from Meta API in chunks to avoid edge function timeout.
 * Returns merged insights object.
 */
export async function chunkedMetaSync(
  ids: string[],
  options?: {
    date?: string;
    date_from?: string;
    date_to?: string;
    onProgress?: (synced: number, total: number) => void;
  }
): Promise<{ insights: Record<string, any>; rate_limited: any[] }> {
  const allInsights: Record<string, any> = {};
  const allRateLimited: any[] = [];
  const total = ids.length;

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    options?.onProgress?.(Math.min(i + CHUNK_SIZE, total), total);

    const body: any = { ad_account_ids: chunk, source: "meta" };
    if (options?.date) body.date = options.date;
    if (options?.date_from) body.date_from = options.date_from;
    if (options?.date_to) body.date_to = options.date_to;

    const { data, error } = await supabase.functions.invoke("get-account-insights", { body });
    if (error) throw error;

    if (data?.insights) {
      Object.assign(allInsights, data.insights);
    }
    if (data?.rate_limited?.length) {
      allRateLimited.push(...data.rate_limited);
    }
  }

  return { insights: allInsights, rate_limited: allRateLimited };
}
