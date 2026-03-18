import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MetricCard } from "@/components/MetricCard";
import { SpendProgressBar } from "@/components/SpendProgressBar";
import { StatusBadge } from "@/components/StatusBadge";
import { Wallet, MonitorSmartphone, TrendingUp, CalendarIcon, AppWindow, ExternalLink, ArrowUpCircle, Search, Loader2, Download, Smartphone, Share, X, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn, friendlyEdgeError } from "@/lib/utils";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { logSystemAction } from "@/lib/systemLog";

export function ClientDashboard() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { canInstall, isInstalled, isIOS, promptInstall } = useInstallPrompt();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissedInstall, setDismissedInstall] = useState(() => localStorage.getItem("pwa-install-dismissed") === "true");
  const isInactive = (profile as any)?.status === "inactive";

  const [adSearch, setAdSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState<Date | undefined>(endOfMonth(new Date()));

  // Spend cap dialog state
  const [topUpAccount, setTopUpAccount] = useState<any>(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpLoading, setTopUpLoading] = useState(false);

  // Ad Account Request form
  const [showAdReqForm, setShowAdReqForm] = useState(false);
  const [adReqForm, setAdReqForm] = useState({ account_name: "", email: "", business_manager_id: "", monthly_spend: "", start_date: "" });
  const [adReqLoading, setAdReqLoading] = useState(false);

  const handleAdReqSubmit = async () => {
    if (!adReqForm.account_name || !adReqForm.email || !adReqForm.business_manager_id) {
      toast.error("Please fill in all required fields");
      return;
    }
    setAdReqLoading(true);
    try {
      const { error } = await (supabase as any).from("ad_account_requests").insert({
        user_id: user!.id,
        account_name: adReqForm.account_name,
        email: adReqForm.email,
        business_manager_id: adReqForm.business_manager_id,
        monthly_spend: adReqForm.monthly_spend || null,
        start_date: adReqForm.start_date || null,
      });
      if (error) throw error;
      await logSystemAction("Ad Account Requested", `"${adReqForm.account_name}" by ${profile?.full_name || user!.email}`, user!.id, profile?.full_name || user!.email);
      toast.success("Ad account request submitted successfully!");
      setShowAdReqForm(false);
      setAdReqForm({ account_name: "", email: "", business_manager_id: "", monthly_spend: "", start_date: "" });
    } catch (err: any) {
      toast.error(err.message || "Failed to submit request");
    } finally {
      setAdReqLoading(false);
    }
  };

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

  // Realtime subscription to ad_accounts changes for live remaining balance
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("client-dashboard-ad-accounts")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "ad_accounts" }, () => {
        queryClient.invalidateQueries({ queryKey: ["client-ad-accounts", user.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

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

  const totalRemaining = adAccounts?.reduce((sum: number, a: any) => sum + Math.max(0, Number(a.spend_cap) - Number(a.amount_spent)), 0) ?? 0;

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

  const handleSpendCapIncrease = async () => {
    if (!topUpAccount || !topUpAmount) return;
    const amount = Number(topUpAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    const walletBalance = Number(wallet?.balance ?? 0);
    const dueLimit = Number((profile as any)?.due_limit ?? 0);
    if (walletBalance + dueLimit < amount) {
      toast.error("Insufficient wallet balance");
      return;
    }

    setTopUpLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("spend-cap-update", {
        body: {
          ad_account_id: topUpAccount.id,
          amount,
          deduct_wallet: true,
          target_user_id: user!.id,
        },
      });

      if (res.error || res.data?.error) {
        toast.error(friendlyEdgeError(res.error) || res.data?.error || "Failed to update spend cap");
        return;
      }

      toast.success(`Spend cap increased by $${amount.toLocaleString()}`);
      setTopUpAccount(null);
      setTopUpAmount("");
      queryClient.invalidateQueries({ queryKey: ["client-wallet"] });
      queryClient.invalidateQueries({ queryKey: ["client-ad-accounts"] });
    } catch (err: any) {
      toast.error(friendlyEdgeError(err));
    } finally {
      setTopUpLoading(false);
    }
  };

  const filtered = (adAccounts ?? []).filter((a: any) => {
    const q = adSearch.toLowerCase();
    return !q || a.account_name?.toLowerCase().includes(q) || a.account_id?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Welcome Banner */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base md:text-lg font-bold text-foreground">
            {greeting()}, {profile?.full_name || "there"}! 👋
          </h1>
          <p className="text-xs text-muted-foreground">
            {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        <Button size="icon" className="h-8 w-8 rounded-md" asChild>
          <Link to="/top-up">
            <Plus className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {isInactive && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="p-3 md:p-4 flex items-center gap-3">
            <span className="text-destructive font-semibold text-sm">⚠️ Your account has been frozen by admin. You cannot perform any transactions or top-ups.</span>
          </CardContent>
        </Card>
      )}

      {/* Download App Banner */}
      {!isInstalled && !dismissedInstall && (
        <Card className="border-primary/30 bg-gradient-to-r from-primary/10 to-blue-500/10 relative overflow-hidden">
          <button
            onClick={() => { setDismissedInstall(true); localStorage.setItem("pwa-install-dismissed", "true"); }}
            className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted/60 transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Smartphone className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground">📱 Download Our App</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isIOS ? "Install this app on your iPhone for quick access" : "Install the app on your phone for quick access"}
              </p>
            </div>
            <Button
              size="sm"
              className="gap-1.5 rounded-full px-4 flex-shrink-0"
              onClick={async () => {
                if (isIOS) {
                  setShowIOSGuide(true);
                } else {
                  await promptInstall();
                }
              }}
            >
              <Download className="h-4 w-4" />
              Install
            </Button>
          </CardContent>
        </Card>
      )}

      {/* iOS Install Guide Dialog */}
      {showIOSGuide && (
        <Dialog open={showIOSGuide} onOpenChange={setShowIOSGuide}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Install on iPhone</DialogTitle>
              <DialogDescription>Follow these steps to install the app:</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-sm font-bold text-primary">1</div>
                <div>
                  <p className="text-sm font-medium text-foreground">Tap the Share button</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Share className="h-3 w-3" /> at the bottom of Safari
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-sm font-bold text-primary">2</div>
                <p className="text-sm font-medium text-foreground">Scroll down and tap "Add to Home Screen"</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-sm font-bold text-primary">3</div>
                <p className="text-sm font-medium text-foreground">Tap "Add" to install</p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setShowIOSGuide(false)} className="w-full">Got it!</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isMobile ? (
        <div className="space-y-3">
          {/* Wallet Hero */}
          <div className="rounded-2xl bg-gradient-to-br from-primary to-blue-600 p-5 text-primary-foreground shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90">Wallet Balance</p>
                <p className="text-3xl font-bold tracking-tight mt-1">
                  ${Number(wallet?.balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                  <Wallet className="h-6 w-6" />
                </div>
                <Button size="sm" variant="secondary" className="rounded-full text-xs px-3 gap-1" asChild>
                  <Link to="/top-up">
                    <Plus className="h-3 w-3" />
                    Add Balance
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          {/* Compact Metric Row */}
          <div className="grid grid-cols-3 gap-2">
            <Card className="bg-card border border-border/60">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] text-muted-foreground font-medium">Ad Accounts</p>
                <p className="text-lg font-bold text-foreground">{adAccounts?.length ?? 0}</p>
              </CardContent>
            </Card>
            <Card className="bg-card border border-border/60">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] text-muted-foreground font-medium">Remaining</p>
                <p className="text-lg font-bold text-foreground">${totalRemaining.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="bg-card border border-border/60">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] text-muted-foreground font-medium">Total Top-Up</p>
                <p className="text-lg font-bold text-foreground">${Number(topUpTotal ?? 0).toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        /* Desktop: Original Metric Cards */
        <>
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
                  action={
                    <Button size="sm" variant="outline" className="rounded-full text-xs gap-1 border-violet-300 text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-900/30" asChild>
                      <Link to="/top-up">
                        <Plus className="h-3 w-3" />
                        Add Balance
                      </Link>
                    </Button>
                  }
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
        </>
      )}

      {/* Ad Accounts Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base md:text-lg font-semibold text-foreground">My Ad Accounts</h2>
          <Button size="sm" className="gap-1.5" onClick={() => setShowAdReqForm(true)}>
            <Plus className="h-3.5 w-3.5" />
            {isMobile ? "Request" : "Request New Ad Account"}
          </Button>
        </div>
        <div className="flex items-center justify-between mb-3">
          {!isMobile && (
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
          )}
        </div>

        {/* Mobile Search */}
        {isMobile && (
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search accounts..."
              value={adSearch}
              onChange={(e) => setAdSearch(e.target.value)}
              className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        )}

        {filtered.length > 0 ? (
          isMobile ? (
            /* Mobile: Card-based layout */
            <div className="space-y-3">
              {filtered.map((account: any) => {
                const displayId = account.account_id?.replace("act_", "") ?? "";
                const remaining = Math.max(0, Number(account.spend_cap) - Number(account.amount_spent));
                const ratio = Number(account.spend_cap) > 0 ? Number(account.amount_spent) / Number(account.spend_cap) : 0;
                const percentage = Math.min(ratio * 100, 100);
                const barColor = ratio >= 0.8 ? "bg-destructive" : ratio >= 0.5 ? "bg-yellow-500" : "bg-primary";

                return (
                  <Card key={account.id} className="border border-border/60 shadow-sm">
                    <CardContent className="p-4">
                      {/* Header: Name + Status */}
                      <div className="flex items-start justify-between mb-1">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-foreground truncate">{account.account_name}</p>
                          <a
                            href={getAdsManagerUrl(account.account_id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                          >
                            {displayId}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        <StatusBadge status={account.status} />
                      </div>

                      {/* Remaining + Progress */}
                      <div className="mt-3">
                        <p className="text-sm font-medium text-foreground">
                          Remaining: <span className="font-bold">${remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </p>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden mt-1.5">
                          <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>

                      {/* Spent / Limit + Top Up */}
                      <div className="flex items-center justify-between mt-2.5">
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span>Spent: <span className="font-medium text-foreground">${Number(account.amount_spent).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                          <span>Limit: <span className="font-medium text-foreground">${Number(account.spend_cap).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                        </div>
                        <Button
                          size="sm"
                          className="gap-1 bg-gradient-to-r from-primary to-blue-500 hover:from-primary/90 hover:to-blue-500/90 text-primary-foreground shadow-md shadow-primary/25 rounded-full px-4 font-semibold text-xs"
                          onClick={() => { setTopUpAccount(account); setTopUpAmount(""); }}
                          disabled={isInactive}
                        >
                          Top Up
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            /* Desktop: Table layout */
            <Card>
              <CardContent className="p-0">
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
                    {filtered.map((account: any) => {
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
                              onClick={() => { setTopUpAccount(account); setTopUpAmount(""); }}
                              disabled={isInactive}
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
              </CardContent>
            </Card>
          )
        ) : (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">
                {adSearch ? "No matching accounts found" : "No ad accounts assigned yet"}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Ad Account Request Dialog */}
      <Dialog open={showAdReqForm} onOpenChange={setShowAdReqForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request New Ad Account</DialogTitle>
            <DialogDescription>Fill in the details to request a new ad account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Account Name *</label>
              <Input value={adReqForm.account_name} onChange={(e) => setAdReqForm(f => ({ ...f, account_name: e.target.value }))} placeholder="e.g. My Store Ads" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Email *</label>
              <Input type="email" value={adReqForm.email} onChange={(e) => setAdReqForm(f => ({ ...f, email: e.target.value }))} placeholder="your@email.com" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Business Manager ID *</label>
              <Input value={adReqForm.business_manager_id} onChange={(e) => setAdReqForm(f => ({ ...f, business_manager_id: e.target.value }))} placeholder="e.g. 123456789" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Monthly Approx Spending</label>
              <Input value={adReqForm.monthly_spend} onChange={(e) => setAdReqForm(f => ({ ...f, monthly_spend: e.target.value }))} placeholder="e.g. $500" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">When will you start ads?</label>
              <Input type="date" value={adReqForm.start_date} onChange={(e) => setAdReqForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdReqForm(false)}>Cancel</Button>
            <Button onClick={handleAdReqSubmit} disabled={adReqLoading}>
              {adReqLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Spend Cap Increase Dialog */}
      <Dialog open={!!topUpAccount} onOpenChange={(open) => { if (!open) setTopUpAccount(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Increase Spend Cap</DialogTitle>
            <DialogDescription>
              Top up <span className="font-medium text-foreground">{topUpAccount?.account_name}</span> by deducting from your wallet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex justify-between items-center text-sm p-3 rounded-lg bg-muted">
              <span className="text-muted-foreground">Wallet Balance</span>
              <span className="font-semibold">${Number(wallet?.balance ?? 0).toLocaleString()}</span>
            </div>
            {Number((profile as any)?.due_limit ?? 0) > 0 && (
              <div className="flex justify-between items-center text-sm p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                <span className="text-amber-700 dark:text-amber-400">Due Limit</span>
                <span className="font-semibold text-amber-700 dark:text-amber-400">${Number((profile as any)?.due_limit ?? 0).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Current Spend Cap</span>
              <span className="font-semibold">${Number(topUpAccount?.spend_cap ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Amount Spent</span>
              <span className="font-semibold">${Number(topUpAccount?.amount_spent ?? 0).toLocaleString()}</span>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Amount (USD)</label>
              <Input
                type="number"
                min="1"
                placeholder="Enter amount to add"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                autoFocus
              />
              {topUpAmount && Number(topUpAmount) > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  New spend cap: <span className="font-medium text-foreground">${(Number(topUpAccount?.spend_cap ?? 0) + Number(topUpAmount)).toLocaleString()}</span>
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopUpAccount(null)} disabled={topUpLoading}>Cancel</Button>
            <Button
              onClick={handleSpendCapIncrease}
              disabled={topUpLoading || !topUpAmount || Number(topUpAmount) <= 0}
              className="bg-gradient-to-r from-primary to-blue-500 text-primary-foreground"
            >
              {topUpLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ArrowUpCircle className="h-4 w-4 mr-1" />}
              Confirm Top Up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
