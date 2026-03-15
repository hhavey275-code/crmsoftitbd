import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MetricCard } from "@/components/MetricCard";
import { Users, Wallet, Clock, Activity, Ban, TrendingUp, Trophy, Crown, Medal, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];

export function AdminDashboard() {
  const queryClient = useQueryClient();

  const { data: profiles } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*");
      return (data as any[]) ?? [];
    },
  });

  const { data: wallets } = useQuery({
    queryKey: ["admin-wallets"],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("*");
      return (data as any[]) ?? [];
    },
  });

  const { data: pendingRequests } = useQuery({
    queryKey: ["admin-pending-topups"],
    queryFn: async () => {
      const { data } = await supabase.from("top_up_requests").select("*").eq("status", "pending");
      return (data as any[]) ?? [];
    },
  });

  const { data: adAccounts } = useQuery({
    queryKey: ["admin-ad-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*");
      return (data as any[]) ?? [];
    },
  });

  const { data: usdRate } = useQuery({
    queryKey: ["usd-rate"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "usd_rate").single();
      return data?.value ?? "120";
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ad_accounts" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin-ad-accounts"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const totalBalance = wallets?.reduce((sum: number, w: any) => sum + Number(w.balance), 0) ?? 0;
  const activeAccounts = adAccounts?.filter((a: any) => a.status === "active") ?? [];
  const disabledAccounts = adAccounts?.filter((a: any) => a.status !== "active") ?? [];
  const remainingLimit = adAccounts?.reduce((sum: number, a: any) => sum + Math.max(0, Number(a.spend_cap) - Number(a.amount_spent)), 0) ?? 0;

  const { spenderChart, topThree } = useMemo(() => {
    if (!adAccounts?.length || !profiles?.length) return { spenderChart: [], topThree: [] };
    const spendByUser: Record<string, number> = {};
    adAccounts.forEach((a: any) => {
      if (a.user_id) {
        spendByUser[a.user_id] = (spendByUser[a.user_id] || 0) + Number(a.amount_spent);
      }
    });
    const profileMap: Record<string, any> = {};
    profiles.forEach((p: any) => { profileMap[p.user_id] = p; });
    const sorted = Object.entries(spendByUser)
      .map(([userId, spent]) => ({
        userId,
        name: profileMap[userId]?.full_name || profileMap[userId]?.email || "Unknown",
        value: spent,
      }))
      .sort((a, b) => b.value - a.value);
    return { spenderChart: sorted.slice(0, 8), topThree: sorted.slice(0, 3) };
  }, [adAccounts, profiles]);

  const rankIcons = [Crown, Trophy, Medal];
  const rankColors = ["text-yellow-500", "text-blue-500", "text-orange-500"];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Clients"
          value={profiles?.length ?? 0}
          icon={Users}
          iconBg="bg-blue-100 dark:bg-blue-900/50"
          iconColor="text-blue-600"
          gradientClass="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-900/20 border-blue-200 dark:border-blue-800"
        />
        <MetricCard
          title="Platform Balance"
          value={`$${totalBalance.toLocaleString()}`}
          icon={Wallet}
          iconBg="bg-green-100 dark:bg-green-900/50"
          iconColor="text-green-600"
          gradientClass="bg-gradient-to-br from-green-50 to-emerald-100/50 dark:from-green-950/40 dark:to-emerald-900/20 border-green-200 dark:border-green-800"
        />
        <MetricCard
          title="Pending Top-Ups"
          value={pendingRequests?.length ?? 0}
          icon={Clock}
          iconBg="bg-orange-100 dark:bg-orange-900/50"
          iconColor="text-orange-600"
          gradientClass="bg-gradient-to-br from-orange-50 to-amber-100/50 dark:from-orange-950/40 dark:to-amber-900/20 border-orange-200 dark:border-orange-800"
        />
        <MetricCard
          title="USD Rate"
          value={`৳${usdRate}`}
          subtitle="per $1 USD"
          icon={DollarSign}
          iconBg="bg-cyan-100 dark:bg-cyan-900/50"
          iconColor="text-cyan-600"
          gradientClass="bg-gradient-to-br from-cyan-50 to-sky-100/50 dark:from-cyan-950/40 dark:to-sky-900/20 border-cyan-200 dark:border-cyan-800"
        />
        <MetricCard
          title="Active Ad Accounts"
          value={activeAccounts.length}
          icon={Activity}
          iconBg="bg-emerald-100 dark:bg-emerald-900/50"
          iconColor="text-emerald-600"
          gradientClass="bg-gradient-to-br from-emerald-50 to-teal-100/50 dark:from-emerald-950/40 dark:to-teal-900/20 border-emerald-200 dark:border-emerald-800"
        />
        <MetricCard
          title="Disabled Ad Accounts"
          value={disabledAccounts.length}
          icon={Ban}
          iconBg="bg-red-100 dark:bg-red-900/50"
          iconColor="text-red-600"
          gradientClass="bg-gradient-to-br from-red-50 to-rose-100/50 dark:from-red-950/40 dark:to-rose-900/20 border-red-200 dark:border-red-800"
        />
        <MetricCard
          title="Remaining Limit"
          value={`$${remainingLimit.toLocaleString()}`}
          icon={TrendingUp}
          iconBg="bg-purple-100 dark:bg-purple-900/50"
          iconColor="text-purple-600"
          gradientClass="bg-gradient-to-br from-purple-50 to-violet-100/50 dark:from-purple-950/40 dark:to-violet-900/20 border-purple-200 dark:border-purple-800"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Client Spend Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {spenderChart.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No spending data yet</p>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={spenderChart} cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={3} dataKey="value" nameKey="name">
                      {spenderChart.map((_, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, "Spent"]} contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--background))" }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Top High Spenders
              <span className="ml-auto text-xs font-normal text-muted-foreground">● Live</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topThree.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No spending data yet</p>
            ) : (
              <div className="space-y-4">
                {topThree.map((spender, i) => {
                  const RankIcon = rankIcons[i];
                  return (
                    <div key={spender.userId} className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <RankIcon className={`h-5 w-5 ${rankColors[i]}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{spender.name}</p>
                        <p className="text-xs text-muted-foreground">Rank #{i + 1}</p>
                      </div>
                      <p className="font-bold text-lg">${spender.value.toLocaleString()}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
