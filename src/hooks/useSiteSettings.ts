import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSiteSettings() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [siteName, setSiteName] = useState<string | null>(null);
  const [headerAnnouncement, setHeaderAnnouncement] = useState<string | null>(null);
  const [welcomeTitle, setWelcomeTitle] = useState<string | null>(null);
  const [welcomeNote, setWelcomeNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["logo_url", "site_name", "header_announcement", "welcome_title", "welcome_note"]);
    if (data) {
      for (const row of data) {
        if (row.key === "logo_url") setLogoUrl(row.value);
        if (row.key === "site_name") setSiteName(row.value);
        if (row.key === "header_announcement") setHeaderAnnouncement(row.value);
        if (row.key === "welcome_title") setWelcomeTitle(row.value);
        if (row.key === "welcome_note") setWelcomeNote(row.value);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return { logoUrl, siteName, headerAnnouncement, welcomeTitle, welcomeNote, loading, refetch: fetchSettings };
}
