import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/MetricCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { SpendProgressBar } from "@/components/SpendProgressBar";
import { User, Building2, Phone, CalendarDays, Wallet, MonitorSmartphone, ArrowUpCircle, History } from "lucide-react";
import { format } from "date-fns";

export default function ClientDetailPage() {
  const { userId } = useParams<{ userId: string }>();

  const { data: profile } = useQuery({
    queryKey: ["client-detail-profile", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("user_id", userId!).single();
      return data as any;
    },
    enabled: !!userId,
  });

  const { data: wallet } = useQuery({
    queryKey: ["client-detail-wallet", userId],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("*").eq("user_id", userId!).single();
      return data as any;
    },
    enabled: !!userId,
  });

  const { data: adAccounts } = useQuery({
    queryKey: ["client-detail-ad-accounts", userId],
    queryFn: async () => {
      const { data: assignments } = await (supabase as any)
        .from("user_ad_accounts")
        .select("ad_account_id")
        .eq("user_id", userId!);
      if (!assignments || assignments.length === 0) return [];
      const ids = assignments.map((a: any) => a.ad_account_id);
      const { data } = await supabase.from("ad_accounts").select("*").in("id", ids);
      return (data as any[]) ?? [];
    },
    enabled: !!userId,
  });

  const { data: pendingTopUps } = useQuery({
    queryKey: ["client-detail-pending-topups", userId],
    queryFn: async () => {
      const { data } = await supabase.from("top_up_requests").select("*").eq("user_id", userId!).eq("status", "pending");
      return (data as any[]) ?? [];
    },
    enabled: !!userId,
  });

  const { data: recentTx } = useQuery({
    queryKey: ["client-detail-tx", userId],
    queryFn: async () => {
      const { data } = await supabase.from("transactions").select("*").eq("user_id", userId!).order("created_at", { ascending: false }).limit(10);
      return (data as any[]) ?? [];
    },
    enabled: !!userId,
  });

  const activeAccounts = adAccounts?.filter((a: any) => a.status === "active") ?? [];
  const isActive = (profile?.status ?? "active") === "active";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Client Details</h1>

        {/* Client Info Card */}
        <Card className={!isActive ? "border-destructive/50 bg-destructive/5" : ""}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Client Information
              <span className="ml-auto">
                <StatusBadge status={isActive ? "active" : "inactive"} />
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center gap-3 rounded-lg border p-4">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Full Name</p>
                  <p className="font-medium">{profile?.full_name || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-4">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Business Name</p>
                  <p className="font-medium">{profile?.company || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-4">
                <Phone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Phone Number</p>
                  <p className="font-medium">{(profile as any)?.phone || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-4">
                <CalendarDays className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Onboarding Date</p>
                  <p className="font-medium">
                    {profile?.created_at ? format(new Date(profile.created_at), "MMM d, yyyy") : "—"}
                  </p>
                </div>
              </div>
            </div>
            {!isActive && (
              <div className="mt-4 rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive font-medium">
                ⚠️ This account is currently frozen/inactive.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Metric Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            value={activeAccounts.length}
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
            title="Transactions"
            value={recentTx?.length ?? 0}
            subtitle="Recent"
            icon={History}
            iconBg="bg-purple-100 dark:bg-purple-900/50"
            iconColor="text-purple-600"
            gradientClass="bg-gradient-to-br from-purple-50 to-violet-100/50 dark:from-purple-950/40 dark:to-violet-900/20 border-purple-200 dark:border-purple-800"
          />
        </div>

        {/* Ad Accounts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ad Accounts ({adAccounts?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {adAccounts?.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No ad accounts assigned</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Budget</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Spent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adAccounts?.map((acc: any) => (
                    <TableRow key={acc.id}>
                      <TableCell>
                        <p className="font-medium">{acc.account_name}</p>
                        <p className="text-xs text-muted-foreground">{acc.account_id}</p>
                      </TableCell>
                      <TableCell>${Number(acc.spend_cap).toLocaleString()}</TableCell>
                      <TableCell><StatusBadge status={acc.status} /></TableCell>
                      <TableCell>
                        <SpendProgressBar amountSpent={Number(acc.amount_spent)} spendCap={Number(acc.spend_cap)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {recentTx?.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No transactions yet</p>
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
                      <TableCell className="text-muted-foreground">
                        {format(new Date(tx.created_at), "MMM d, yyyy")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
