import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSiteSettings() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [siteName, setSiteName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["logo_url", "site_name"]);
    if (data) {
      for (const row of data) {
        if (row.key === "logo_url") setLogoUrl(row.value);
        if (row.key === "site_name") setSiteName(row.value);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return { logoUrl, siteName, loading, refetch: fetchSettings };
}
