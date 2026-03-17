import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MetricCard } from "@/components/MetricCard";
import { SpendProgressBar } from "@/components/SpendProgressBar";
import { StatusBadge } from "@/components/StatusBadge";
import { Wallet, MonitorSmartphone, TrendingUp, CalendarIcon, AppWindow, ExternalLink, ArrowUpCircle, Search } from "lucide-react";
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
  const navigate = useNavigate();
  const isInactive = (profile as any)?.status === "inactive";

  const [adSearch, setAdSearch] = useState("");
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">
            {greeting()}, {profile?.full_name || "there"}! 👋
          </h1>
          <p className="text-xs text-muted-foreground">
            {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
        </div>
      </div>

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
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">My Ad Accounts</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search accounts..."
              value={adSearch}
              onChange={(e) => setAdSearch(e.target.value)}
              className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </CardHeader>
        <CardContent>
          {(() => {
            const filtered = (adAccounts ?? []).filter((a: any) => {
              const q = adSearch.toLowerCase();
              return !q || a.account_name?.toLowerCase().includes(q) || a.account_id?.toLowerCase().includes(q);
            });
            return filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Account ID</TableHead>
                  <TableHead>Spend</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adAccounts.map((account: any) => {
                  const displayId = account.account_id?.replace("act_", "") ?? "";
                  return (
                    <TableRow key={account.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <AppWindow className="h-4 w-4 text-primary" />
                          </div>
                          <span className="text-sm font-medium text-primary truncate max-w-[160px]">{account.account_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <a
                          href={getAdsManagerUrl(account.account_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                          {displayId}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </TableCell>
                      <TableCell>
                        <SpendProgressBar amountSpent={Number(account.amount_spent)} spendCap={Number(account.spend_cap)} />
                      </TableCell>
                      <TableCell><StatusBadge status={account.status} /></TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          className="gap-1.5 bg-gradient-to-r from-primary to-blue-500 hover:from-primary/90 hover:to-blue-500/90 text-primary-foreground shadow-md shadow-primary/25 rounded-full px-4 font-semibold text-xs tracking-wide"
                          onClick={() => navigate("/top-up", { state: { adAccountId: account.id } })}
                        >
                          <ArrowUpCircle className="h-3.5 w-3.5" />
                          Top Up
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">No ad accounts assigned yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
