import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useSidebarBadges(): Record<string, number> {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [badges, setBadges] = useState<Record<string, number>>({});

  const isAdminUser = isAdmin || isSuperAdmin;

  const fetchCounts = useCallback(async () => {
    if (!user) return;

    if (isAdminUser) {
      const [topUpRes, chatRes, clientsRes, failedRes] = await Promise.all([
        (supabase as any)
          .from("top_up_requests")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending"),
        (supabase as any)
          .from("chat_messages")
          .select("*", { count: "exact", head: true })
          .eq("is_read", false)
          .neq("sender_id", user.id),
        supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending"),
        (supabase as any)
          .from("failed_topups")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);

      setBadges({
        "top-up": topUpRes.count || 0,
        "chat": chatRes.count || 0,
        "clients": clientsRes.count || 0,
        "failed-topups": failedRes.count || 0,
      });
    } else {
      // Client: show own failed topups count
      const failedRes = await (supabase as any)
        .from("failed_topups")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("user_id", user.id);

      setBadges({
        "failed-topups": failedRes.count || 0,
      });
    }
  }, [user, isAdminUser]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // Realtime subscriptions
  useEffect(() => {
    if (!user) return;

    const tables = isAdminUser
      ? ["top_up_requests", "chat_messages", "profiles", "failed_topups"]
      : ["failed_topups"];

    let channel = supabase.channel("sidebar-badges");
    tables.forEach(table => {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, () => fetchCounts());
    });
    channel.subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, isAdminUser, fetchCounts]);

  return badges;
}
