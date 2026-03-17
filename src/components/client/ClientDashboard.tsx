import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MetricCard } from "@/components/MetricCard";
import { SpendProgressBar } from "@/components/SpendProgressBar";
import { StatusBadge } from "@/components/StatusBadge";
import { Wallet, MonitorSmartphone, TrendingUp, CalendarIcon, AppWindow, ExternalLink, ArrowUpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
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

  const totalRemaining = adAccounts?.reduce((sum: number, a: any) => sum + (Number(a.spend_cap) - Number(a.amount_spent)), 0) ?? 0;

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    if (hour < 21) return "Good evening";
    return "Good night";
  };

  const getAdsManagerUrl = (accountId: string) => {
    const cleanId = accountId.replace("act_", "");
    return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${cleanId}&nav_source=flyout_menu`;
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
        <CardContent className="p-5">
          <h1 className="text-xl font-bold text-foreground">
            {greeting()}, {profile?.full_name || "there"}! 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome to your dashboard • {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
        </CardContent>
      </Card>

      {isInactive && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="p-4 flex items-center gap-3">
            <span className="text-destructive font-semibold">⚠️ Your account has been frozen by admin. You cannot perform any transactions or top-ups.</span>
          </CardContent>
        </Card>
      )}

      {/* Metric Cards in Premium White Container */}
      <Card className="bg-white dark:bg-card border border-border/40 shadow-[0_2px_12px_rgba(0,0,0,0.04),0_8px_32px_rgba(0,0,0,0.06)] rounded-xl">
        <CardContent className="p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Wallet Balance"
              value={`$${Number(wallet?.balance ?? 0).toLocaleString()}`}
              icon={Wallet}
              iconBg="bg-violet-50 dark:bg-violet-900/30"
              iconColor="text-violet-600"
              className="border-0 shadow-none bg-violet-50/40 dark:bg-violet-900/10"
            />
            <MetricCard
              title="Total Ad Accounts"
              value={adAccounts?.length ?? 0}
              icon={MonitorSmartphone}
              iconBg="bg-amber-50 dark:bg-amber-900/30"
              iconColor="text-amber-600"
              className="border-0 shadow-none bg-amber-50/40 dark:bg-amber-900/10"
            />
            <MetricCard
              title="Total Remaining Balance"
              value={`$${totalRemaining.toLocaleString()}`}
              subtitle="Across all ad accounts"
              icon={Wallet}
              iconBg="bg-rose-50 dark:bg-rose-900/30"
              iconColor="text-rose-600"
              className="border-0 shadow-none bg-rose-50/40 dark:bg-rose-900/10"
            />
            <MetricCard
              title="Total Top-Up"
              value={`$${Number(topUpTotal ?? 0).toLocaleString()}`}
              subtitle={dateFrom && dateTo ? `${format(dateFrom, "MMM d")} - ${format(dateTo, "MMM d, yyyy")}` : "All time"}
              icon={TrendingUp}
              iconBg="bg-emerald-50 dark:bg-emerald-900/30"
              iconColor="text-emerald-600"
              className="border-0 shadow-none bg-emerald-50/40 dark:bg-emerald-900/10"
            />
          </div>
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

      {/* Ad Accounts Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">My Ad Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {adAccounts && adAccounts.length > 0 ? (
            <div className="space-y-3">
              {adAccounts.map((account: any) => {
                const displayId = account.account_id?.replace("act_", "") ?? "";
                return (
                  <div
                    key={account.id}
                    className="flex items-center gap-4 p-4 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <AppWindow className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary truncate">{account.account_name}</p>
                      <a
                        href={getAdsManagerUrl(account.account_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        {displayId}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      {account.business_name && (
                        <p className="text-xs text-muted-foreground">{account.business_name}</p>
                      )}
                    </div>
                    <div className="hidden sm:block w-32">
                      <SpendProgressBar amountSpent={Number(account.amount_spent)} spendCap={Number(account.spend_cap)} />
                    </div>
                    <StatusBadge status={account.status} />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No ad accounts assigned yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
