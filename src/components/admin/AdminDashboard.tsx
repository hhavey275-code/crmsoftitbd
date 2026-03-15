import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Users, Wallet, Clock, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export function AdminDashboard() {
  const { data: profiles } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*");
      return data ?? [];
    },
  });

  const { data: wallets } = useQuery({
    queryKey: ["admin-wallets"],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("*");
      return data ?? [];
    },
  });

  const { data: pendingRequests } = useQuery({
    queryKey: ["admin-pending-topups"],
    queryFn: async () => {
      const { data } = await supabase.from("top_up_requests").select("*").eq("status", "pending").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: recentTx } = useQuery({
    queryKey: ["admin-recent-tx"],
    queryFn: async () => {
      const { data } = await supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(5);
      return data ?? [];
    },
  });

  const totalBalance = wallets?.reduce((sum, w) => sum + Number(w.balance), 0) ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Total Clients" value={profiles?.length ?? 0} icon={Users} />
        <MetricCard title="Platform Balance" value={`$${totalBalance.toLocaleString()}`} icon={Wallet} />
        <MetricCard title="Pending Top-Ups" value={pendingRequests?.length ?? 0} icon={Clock} />
        <MetricCard title="Total Wallets" value={wallets?.length ?? 0} icon={TrendingUp} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pending Top-Up Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingRequests?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending requests</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRequests?.slice(0, 5).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">${Number(r.amount).toLocaleString()}</TableCell>
                      <TableCell className="capitalize">{r.payment_method.replace("_", " ")}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

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
                  {recentTx?.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="capitalize">{tx.type.replace("_", " ")}</TableCell>
                      <TableCell className="font-medium">${Number(tx.amount).toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground">{format(new Date(tx.created_at), "MMM d, yyyy")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
