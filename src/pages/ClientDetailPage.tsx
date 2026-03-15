import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/MetricCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { SpendProgressBar } from "@/components/SpendProgressBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  User, Building2, Phone, CalendarDays, Wallet, MonitorSmartphone,
  CheckCircle, XCircle, TrendingUp, TrendingDown, DollarSign, CalendarIcon, Save
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";

export default function ClientDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const queryClient = useQueryClient();

  const [dateFrom, setDateFrom] = useState<Date | undefined>(startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState<Date | undefined>(endOfMonth(new Date()));
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["client-detail-profile", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("user_id", userId!).single();
      return data as any;
    },
    enabled: !!userId,
  });

  const { data: globalRate } = useQuery({
    queryKey: ["usd-rate"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "usd_rate").single();
      return data?.value ?? "120";
    },
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

  const { data: topUpTotal } = useQuery({
    queryKey: ["client-detail-topup-total", userId, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("top_up_requests")
        .select("amount")
        .eq("user_id", userId!)
        .eq("status", "approved");
      if (dateFrom) query = query.gte("created_at", dateFrom.toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query = query.lte("created_at", end.toISOString());
      }
      const { data } = await query;
      return (data as any[])?.reduce((sum: number, r: any) => sum + Number(r.amount), 0) ?? 0;
    },
    enabled: !!userId,
  });

  // Total spending from transactions table filtered by date range
  const { data: totalSpendingFiltered } = useQuery({
    queryKey: ["client-detail-spending", userId, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select("amount")
        .eq("user_id", userId!)
        .eq("type", "deduction");
      if (dateFrom) query = query.gte("created_at", dateFrom.toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query = query.lte("created_at", end.toISOString());
      }
      const { data } = await query;
      return (data as any[])?.reduce((sum: number, r: any) => sum + Math.abs(Number(r.amount)), 0) ?? 0;
    },
    enabled: !!userId,
  });

  const saveRateMutation = useMutation({
    mutationFn: async () => {
      const value = rateInput.trim() === "" ? null : parseFloat(rateInput);
      const { error } = await supabase
        .from("profiles")
        .update({ usd_rate: value } as any)
        .eq("user_id", userId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("USD rate updated!");
      queryClient.invalidateQueries({ queryKey: ["client-detail-profile", userId] });
      setEditingRate(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const activeAccounts = adAccounts?.filter((a: any) => a.status === "active") ?? [];
  const disabledAccounts = adAccounts?.filter((a: any) => a.status !== "active") ?? [];
  const totalRemaining = adAccounts?.reduce((sum: number, a: any) => sum + (Number(a.spend_cap) - Number(a.amount_spent)), 0) ?? 0;
  const totalSpending = adAccounts?.reduce((sum: number, a: any) => sum + Number(a.amount_spent), 0) ?? 0;
  const isActive = (profile?.status ?? "active") === "active";
  const clientRate = (profile as any)?.usd_rate;

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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
              {/* USD Rate - inline editable */}
              <div className="flex items-center gap-3 rounded-lg border border-cyan-200 bg-cyan-50/50 dark:bg-cyan-950/20 dark:border-cyan-800 p-4">
                <DollarSign className="h-5 w-5 text-cyan-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">USD Rate</p>
                  {editingRate ? (
                    <div className="flex items-center gap-1 mt-1">
                      <Input
                        type="number"
                        step="0.01"
                        className="w-20 h-7 text-sm"
                        value={rateInput}
                        onChange={(e) => setRateInput(e.target.value)}
                        placeholder="e.g. 125"
                      />
                      <Button size="icon" className="h-7 w-7" onClick={() => saveRateMutation.mutate()} disabled={saveRateMutation.isPending}>
                        <Save className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingRate(false)}>
                        <XCircle className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <p
                      className="font-medium text-cyan-700 dark:text-cyan-400 cursor-pointer hover:underline"
                      onClick={() => { setRateInput(clientRate?.toString() ?? ""); setEditingRate(true); }}
                    >
                      {clientRate ? `৳${clientRate}` : `Global (৳${globalRate})`}
                    </p>
                  )}
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

        {/* Date Range Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Period:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-3 w-3" />
                {dateFrom ? format(dateFrom, "MMM d, yyyy") : "From"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <span className="text-muted-foreground">—</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-3 w-3" />
                {dateTo ? format(dateTo, "MMM d, yyyy") : "To"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>

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
            title="Total Ad Accounts"
            value={adAccounts?.length ?? 0}
            icon={MonitorSmartphone}
            iconBg="bg-blue-100 dark:bg-blue-900/50"
            iconColor="text-blue-600"
            gradientClass="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-900/20 border-blue-200 dark:border-blue-800"
          />
          <MetricCard
            title="Active Ad Accounts"
            value={activeAccounts.length}
            icon={CheckCircle}
            iconBg="bg-emerald-100 dark:bg-emerald-900/50"
            iconColor="text-emerald-600"
            gradientClass="bg-gradient-to-br from-emerald-50 to-green-100/50 dark:from-emerald-950/40 dark:to-green-900/20 border-emerald-200 dark:border-emerald-800"
          />
          <MetricCard
            title="Disabled Ad Accounts"
            value={disabledAccounts.length}
            icon={XCircle}
            iconBg="bg-red-100 dark:bg-red-900/50"
            iconColor="text-red-600"
            gradientClass="bg-gradient-to-br from-red-50 to-rose-100/50 dark:from-red-950/40 dark:to-rose-900/20 border-red-200 dark:border-red-800"
          />
          <MetricCard
            title="Total Top-Up"
            value={`$${Number(topUpTotal ?? 0).toLocaleString()}`}
            subtitle={dateFrom && dateTo ? `${format(dateFrom, "MMM d")} - ${format(dateTo, "MMM d, yyyy")}` : "All time"}
            icon={TrendingUp}
            iconBg="bg-orange-100 dark:bg-orange-900/50"
            iconColor="text-orange-600"
            gradientClass="bg-gradient-to-br from-orange-50 to-amber-100/50 dark:from-orange-950/40 dark:to-amber-900/20 border-orange-200 dark:border-orange-800"
          />
          <MetricCard
            title="Total Remaining Balance"
            value={`$${totalRemaining.toLocaleString()}`}
            subtitle="Across all ad accounts"
            icon={Wallet}
            iconBg="bg-indigo-100 dark:bg-indigo-900/50"
            iconColor="text-indigo-600"
            gradientClass="bg-gradient-to-br from-indigo-50 to-violet-100/50 dark:from-indigo-950/40 dark:to-violet-900/20 border-indigo-200 dark:border-indigo-800"
          />
          <MetricCard
            title="Total Spending"
            value={`$${totalSpending.toLocaleString()}`}
            subtitle={dateFrom && dateTo ? `${format(dateFrom, "MMM d")} - ${format(dateTo, "MMM d, yyyy")}` : "All time (cumulative)"}
            icon={TrendingDown}
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
      </div>
    </DashboardLayout>
  );
}
