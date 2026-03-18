import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useSidebarBadges(): Record<string, number> {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [badges, setBadges] = useState<Record<string, number>>({});

  const isAdminUser = isAdmin || isSuperAdmin;

  const fetchCounts = useCallback(async () => {
    if (!user || !isAdminUser) return;

    const [topUpRes, chatRes, clientsRes] = await Promise.all([
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
    ]);

    setBadges({
      "top-up": topUpRes.count || 0,
      "chat": chatRes.count || 0,
      "clients": clientsRes.count || 0,
    });
  }, [user, isAdminUser]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // Realtime subscriptions
  useEffect(() => {
    if (!user || !isAdminUser) return;

    const channel = supabase
      .channel("sidebar-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "top_up_requests" }, () => fetchCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => fetchCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => fetchCounts())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, isAdminUser, fetchCounts]);

  return badges;
}
