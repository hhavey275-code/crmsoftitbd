import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MetricCard } from "@/components/MetricCard";
import { Wallet, MonitorSmartphone, DollarSign, TrendingUp, TrendingDown, CalendarIcon, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth } from "date-fns";

export function ClientDashboard() {
  const { user, profile } = useAuth();
  const isInactive = (profile as any)?.status === "inactive";

  const [dateFrom, setDateFrom] = useState<Date | undefined>(startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState<Date | undefined>(endOfMonth(new Date()));

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

  const { data: topUpTotal } = useQuery({
    queryKey: ["client-topup-total", user?.id, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("top_up_requests")
        .select("amount")
        .eq("user_id", user!.id)
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
    enabled: !!user,
  });

  const { data: usdRate } = useQuery({
    queryKey: ["usd-rate"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "usd_rate").single();
      return data?.value ?? "120";
    },
  });

  const activeAccounts = adAccounts?.filter((a: any) => a.status === "active") ?? [];
  const disabledAccounts = adAccounts?.filter((a: any) => a.status !== "active") ?? [];
  const totalRemaining = adAccounts?.reduce((sum: number, a: any) => sum + (Number(a.spend_cap) - Number(a.amount_spent)), 0) ?? 0;
  const totalSpending = adAccounts?.reduce((sum: number, a: any) => sum + Number(a.amount_spent), 0) ?? 0;

  const effectiveRate = (profile as any)?.usd_rate ?? usdRate;

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

      {/* USD Rate */}
      <Card className="max-w-xs border-cyan-200 bg-cyan-50/50 dark:bg-cyan-950/20 dark:border-cyan-800">
        <CardContent className="p-4 flex items-center gap-3">
          <DollarSign className="h-5 w-5 text-cyan-600" />
          <p className="text-sm font-medium">Your USD Rate: <span className="text-lg font-bold text-cyan-700 dark:text-cyan-400">৳{effectiveRate}</span> per $1</p>
        </CardContent>
      </Card>

      {/* Date Range for Total Top-Up */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Top-Up Period:</span>
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
          subtitle="Across all ad accounts"
          icon={TrendingDown}
          iconBg="bg-purple-100 dark:bg-purple-900/50"
          iconColor="text-purple-600"
          gradientClass="bg-gradient-to-br from-purple-50 to-violet-100/50 dark:from-purple-950/40 dark:to-violet-900/20 border-purple-200 dark:border-purple-800"
        />
      </div>
    </div>
  );
}
