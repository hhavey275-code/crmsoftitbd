import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSiteSettings() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLogo = async () => {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "logo_url")
      .maybeSingle();
    setLogoUrl(data?.value ?? null);
    setLoading(false);
  };

  useEffect(() => {
    fetchLogo();
  }, []);

  return { logoUrl, loading, refetch: fetchLogo };
}
