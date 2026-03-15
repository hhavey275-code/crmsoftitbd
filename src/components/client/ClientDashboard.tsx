import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MetricCard } from "@/components/MetricCard";
import { Wallet, MonitorSmartphone, History, ArrowUpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";

export function ClientDashboard() {
  const { user } = useAuth();

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
      const { data } = await supabase.from("ad_accounts").select("*").eq("assigned_user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: pendingTopUps } = useQuery({
    queryKey: ["client-pending-topups", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("top_up_requests").select("*").eq("user_id", user!.id).eq("status", "pending");
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: recentTx } = useQuery({
    queryKey: ["client-recent-tx", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("transactions").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(5);
      return data ?? [];
    },
    enabled: !!user,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Wallet Balance" value={`$${Number(wallet?.balance ?? 0).toLocaleString()}`} icon={Wallet} />
        <MetricCard title="Ad Accounts" value={adAccounts?.filter(a => a.status === "active").length ?? 0} subtitle="Active accounts" icon={MonitorSmartphone} />
        <MetricCard title="Pending Top-Ups" value={pendingTopUps?.length ?? 0} icon={ArrowUpCircle} />
        <MetricCard title="Transactions" value={recentTx?.length ?? 0} subtitle="Recent" icon={History} />
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
                  <TableHead>Balance After</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTx?.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="capitalize font-medium">{tx.type.replace("_", " ")}</TableCell>
                    <TableCell className="font-semibold">${Number(tx.amount).toLocaleString()}</TableCell>
                    <TableCell>{tx.balance_after != null ? `$${Number(tx.balance_after).toLocaleString()}` : "—"}</TableCell>
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
