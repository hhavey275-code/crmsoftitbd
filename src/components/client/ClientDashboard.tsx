import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MetricCard } from "@/components/MetricCard";
import { Wallet, MonitorSmartphone, History, ArrowUpCircle, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export function ClientDashboard() {
  const { user, profile } = useAuth();

  const isInactive = (profile as any)?.status === "inactive";

  const { data: wallet } = useQuery({
    queryKey: ["client-wallet", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("*").eq("user_id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const { data: adAccounts } = useQuery({
    queryKey: ["client-ad-accounts", user?.id],
    queryFn: async () => {
      const { data: assignments } = await (supabase as any)
        .from("user_ad_accounts")
        .select("ad_account_id")
        .eq("user_id", user!.id);
      if (!assignments || assignments.length === 0) return [];
      const ids = assignments.map((a: any) => a.ad_account_id);
      const { data } = await supabase.from("ad_accounts").select("*").in("id", ids);
      return (data as any[]) ?? [];
    },
    enabled: !!user,
  });

  const { data: pendingTopUps } = useQuery({
    queryKey: ["client-pending-topups", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("top_up_requests").select("*").eq("user_id", user!.id).eq("status", "pending");
      return (data as any[]) ?? [];
    },
    enabled: !!user,
  });

  const { data: usdRate } = useQuery({
    queryKey: ["usd-rate"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "usd_rate").single();
      return data?.value ?? "120";
    },
  });

  const { data: recentTx } = useQuery({
    queryKey: ["client-recent-tx", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("transactions").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(5);
      return (data as any[]) ?? [];
    },
    enabled: !!user,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {isInactive && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="p-4 flex items-center gap-3">
            <span className="text-destructive font-semibold">⚠️ Your account has been frozen by admin. You cannot perform any transactions or top-ups.</span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          title="Wallet Balance"
          value={`$${Number(wallet?.balance ?? 0).toLocaleString()}`}
          icon={Wallet}
          iconBg="bg-green-100 dark:bg-green-900/50"
          iconColor="text-green-600"
          gradientClass="bg-gradient-to-br from-green-50 to-emerald-100/50 dark:from-green-950/40 dark:to-emerald-900/20 border-green-200 dark:border-green-800"
        />
        <MetricCard
          title="Ad Accounts"
          value={adAccounts?.filter((a: any) => a.status === "active").length ?? 0}
          subtitle="Active accounts"
          icon={MonitorSmartphone}
          iconBg="bg-blue-100 dark:bg-blue-900/50"
          iconColor="text-blue-600"
          gradientClass="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-900/20 border-blue-200 dark:border-blue-800"
        />
        <MetricCard
          title="Pending Top-Ups"
          value={pendingTopUps?.length ?? 0}
          icon={ArrowUpCircle}
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
          title="Transactions"
          value={recentTx?.length ?? 0}
          subtitle="Recent"
          icon={History}
          iconBg="bg-purple-100 dark:bg-purple-900/50"
          iconColor="text-purple-600"
          gradientClass="bg-gradient-to-br from-purple-50 to-violet-100/50 dark:from-purple-950/40 dark:to-violet-900/20 border-purple-200 dark:border-purple-800"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTx?.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTx?.map((tx: any) => (
                  <TableRow key={tx.id}>
                    <TableCell className="capitalize font-medium">{tx.type.replace("_", " ")}</TableCell>
                    <TableCell className="font-semibold">${Number(tx.amount).toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(tx.created_at), "MMM d, yyyy")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
