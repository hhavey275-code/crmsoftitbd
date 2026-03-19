import { useState, useMemo, useEffect, useRef } from "react";
import { friendlyEdgeError } from "@/lib/utils";
import { FailedTopUps } from "@/components/FailedTopUps";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/MetricCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/StatusBadge";
import { SpendProgressBar } from "@/components/SpendProgressBar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpCircle, ExternalLink, Wallet, ArrowUp, ArrowDown, ArrowUpDown, RefreshCw, AppWindow, Search, ListChecks, ChevronLeft, ChevronRight, DollarSign, ShoppingCart, MoreVertical } from "lucide-react";
import { CardBrandIcon } from "@/components/CardBrandIcon";
import { useIsMobile } from "@/hooks/use-mobile";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { logSystemAction } from "@/lib/systemLog";

const PAGE_SIZE = 20;

interface InsightsData {
  today_spend: number;
  yesterday_spend: number;
  today_orders: number;
  yesterday_orders: number;
  balance: number;
  cards: { id: string; display_string: string; type: number }[];
  updated_at?: string;
}

export function ClientAdAccounts() {
  const isMobile = useIsMobile();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [topUpAccount, setTopUpAccount] = useState<any>(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [sortField, setSortField] = useState<string>("account_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSelect, setShowSelect] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cardFilter, setCardFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [lastMetaUpdate, setLastMetaUpdate] = useState<number>(0);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);

  // BM Request state
  const [bmReqAccount, setBmReqAccount] = useState<any>(null);
  const [bmReqForm, setBmReqForm] = useState({ bm_name: "", bm_id: "" });
  const [bmReqLoading, setBmReqLoading] = useState(false);

  const handleBmReqSubmit = async () => {
    if (!bmReqForm.bm_name || !bmReqForm.bm_id || !bmReqAccount) return;
    setBmReqLoading(true);
    try {
      const { error } = await (supabase as any).from("bm_access_requests").insert({
        user_id: user!.id,
        ad_account_id: bmReqAccount.id,
        bm_name: bmReqForm.bm_name,
        bm_id: bmReqForm.bm_id,
      });
      if (error) throw error;
      await logSystemAction("BM Access Requested", `BM "${bmReqForm.bm_name}" (${bmReqForm.bm_id}) for account ${bmReqAccount.account_name}`, user!.id, profile?.full_name || user!.email);
      toast.success("BM access request submitted!");
      setBmReqAccount(null);
      setBmReqForm({ bm_name: "", bm_id: "" });
    } catch (err: any) {
      toast.error(err.message || "Failed to submit request");
    } finally {
      setBmReqLoading(false);
    }
  };

  const isInactive = (profile as any)?.status === "inactive";
  const dueLimit = Number((profile as any)?.due_limit ?? 0);
  const META_COOLDOWN_MS = 15 * 60 * 1000;

  const { data: accounts } = useQuery({
    queryKey: ["client-ad-accounts", user?.id],
    queryFn: async () => {
      const { data: assignments } = await (supabase as any)
        .from("user_ad_accounts")
        .select("ad_account_id")
        .eq("user_id", user!.id);
      if (!assignments || assignments.length === 0) return [];
      const accountIds = assignments.map((a: any) => a.ad_account_id);
      const { data } = await supabase.from("ad_accounts").select("*, business_managers(name)").in("id", accountIds);
      return (data as any[]) ?? [];
    },
    enabled: !!user,
  });

  const { data: insights = {}, refetch: refetchInsights } = useQuery({
    queryKey: ["client-insights-cache", user?.id],
    queryFn: async () => {
      if (!accounts || accounts.length === 0) return {};
      const ids = accounts.map((a: any) => a.id);
      const { data } = await supabase.functions.invoke("get-account-insights", {
        body: { ad_account_ids: ids, source: "cache" },
      });
      return (data?.insights as Record<string, InsightsData>) ?? {};
    },
    enabled: !!user && !!accounts && accounts.length > 0,
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Auto-refresh from Meta on mount (once per page load)
  const hasAutoRefreshed = useRef(false);
  useEffect(() => {
    if (!accounts || accounts.length === 0 || hasAutoRefreshed.current) return;
    hasAutoRefreshed.current = true;
    setIsAutoSyncing(true);
    const ids = accounts.map((a: any) => a.id);
    import("@/lib/chunkedMetaSync").then(({ chunkedMetaSync }) =>
      chunkedMetaSync(ids)
    ).then((result) => {
      if (result?.insights) {
        queryClient.setQueryData(["client-insights-cache", user?.id], result.insights);
        queryClient.invalidateQueries({ queryKey: ["client-ad-accounts"] });
        setLastMetaUpdate(Date.now());
      }
      if (result?.rate_limited?.length > 0) {
        toast.warning(`${result.rate_limited.length} account(s) rate-limited by Meta`);
      }
    }).catch((err) => {
      console.error("Auto-refresh failed:", err);
    }).finally(() => {
      setIsAutoSyncing(false);
    });
  }, [accounts]);

  const { data: wallet } = useQuery({
    queryKey: ["client-wallet", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("balance").eq("user_id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const checkCooldown = (): boolean => {
    const now = Date.now();
    const elapsed = now - lastMetaUpdate;
    if (elapsed < META_COOLDOWN_MS) {
      const remainingMin = Math.ceil((META_COOLDOWN_MS - elapsed) / 60000);
      toast.error(`Please wait ${remainingMin} minute(s) before updating again.`);
      return false;
    }
    return true;
  };

  const refreshAllMutation = useMutation({
    mutationFn: async () => {
      if (!checkCooldown()) throw new Error("cooldown");
      if (!accounts || accounts.length === 0) return;
      const ids = accounts.map((a: any) => a.id);
      const { chunkedMetaSync } = await import("@/lib/chunkedMetaSync");
      return await chunkedMetaSync(ids);
    },
    onSuccess: (data) => {
      setLastMetaUpdate(Date.now());
      const rl = data?.rate_limited;
      if (rl && rl.length > 0) {
        toast.warning(`⚠️ ${rl.length} account(s) could not be updated due to Meta API rate limits. Please retry after a few minutes.`);
      } else {
        toast.success("All accounts updated from Meta");
      }
      refetchInsights();
    },
    onError: (err: any) => {
      if (err.message !== "cooldown") toast.error(err.message || "Failed to refresh");
    },
  });

  const refreshSelectedMutation = useMutation({
    mutationFn: async () => {
      if (!checkCooldown()) throw new Error("cooldown");
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      const { chunkedMetaSync } = await import("@/lib/chunkedMetaSync");
      return await chunkedMetaSync(ids);
    },
    onSuccess: (data) => {
      setLastMetaUpdate(Date.now());
      const rl = data?.rate_limited;
      if (rl && rl.length > 0) {
        toast.warning(`⚠️ ${rl.length} of ${selectedIds.size} account(s) rate-limited. Please retry after a few minutes.`);
      } else {
        toast.success(`${selectedIds.size} account(s) updated from Meta`);
      }
      refetchInsights();
      setSelectedIds(new Set());
    },
    onError: (err: any) => {
      if (err.message !== "cooldown") toast.error(err.message || "Failed to refresh");
    },
  });

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const uniqueCards = useMemo(() => {
    const cards = new Set<string>();
    Object.values(insights).forEach((ins: any) => {
      ins?.cards?.forEach((c: any) => cards.add(c.display_string));
    });
    return Array.from(cards);
  }, [insights]);

  const sortedAccounts = useMemo(() => {
    if (!accounts) return [];
    const q = search.toLowerCase();
    return [...accounts]
      .filter((a: any) => {
        if (q && !a.account_name?.toLowerCase().includes(q) && !a.account_id?.toLowerCase().includes(q)) return false;
        if (statusFilter !== "all" && a.status?.toLowerCase() !== statusFilter) return false;
        if (cardFilter !== "all") {
          const ins = insights[a.id];
          const hasCard = ins?.cards?.some((c: any) => c.display_string === cardFilter);
          if (!hasCard) return false;
        }
        return true;
      })
      .sort((a, b) => {
        let valA: any, valB: any;
        switch (sortField) {
          case "account_name": valA = a.account_name?.toLowerCase(); valB = b.account_name?.toLowerCase(); break;
          case "spend_cap": valA = Number(a.spend_cap); valB = Number(b.spend_cap); break;
          default: valA = a.account_name?.toLowerCase(); valB = b.account_name?.toLowerCase();
        }
        if (valA < valB) return sortDir === "asc" ? -1 : 1;
        if (valA > valB) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
  }, [accounts, insights, sortField, sortDir, search, statusFilter, cardFilter]);

  const totalPages = Math.max(1, Math.ceil(sortedAccounts.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedAccounts = sortedAccounts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useMemo(() => { setCurrentPage(1); }, [search, statusFilter, cardFilter]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!paginatedAccounts.length) return;
    const pageIds = paginatedAccounts.map((a: any) => a.id);
    const allPageSelected = pageIds.every(id => selectedIds.has(id));
    if (allPageSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        pageIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        pageIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const allPageSelected = paginatedAccounts.length > 0 && paginatedAccounts.every((a: any) => selectedIds.has(a.id));

  const walletBalance = Number(wallet?.balance ?? 0);
  const effectiveBalance = walletBalance + dueLimit;
  const parsedAmount = parseFloat(topUpAmount) || 0;
  const exceedsBalance = parsedAmount > effectiveBalance;
  const usingDueLimit = parsedAmount > walletBalance && parsedAmount <= effectiveBalance;

  const topUpMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("spend-cap-update", {
        body: { ad_account_id: topUpAccount.id, amount: parsedAmount, deduct_wallet: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Spend cap updated: $${Number(data.old_spend_cap).toLocaleString()} → $${Number(data.new_spend_cap).toLocaleString()}`);
      setTopUpAccount(null);
      setTopUpAmount("");
      queryClient.invalidateQueries({ queryKey: ["client-ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["client-wallet"] });
      queryClient.invalidateQueries({ queryKey: ["client-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["client-dashboard-transactions"] });
    },
    onError: (err: any) => toast.error(friendlyEdgeError(err)),
  });

  const lastUpdated = useMemo(() => {
    const times = Object.values(insights).map((i: any) => i.updated_at).filter(Boolean);
    if (times.length === 0) return null;
    return new Date(Math.min(...times.map((t: string) => new Date(t).getTime())));
  }, [insights]);

  const aggregatedTodaySpend = Object.values(insights).reduce((sum: number, i: any) => sum + Number(i.today_spend ?? 0), 0);
  const aggregatedYesterdaySpend = Object.values(insights).reduce((sum: number, i: any) => sum + Number(i.yesterday_spend ?? 0), 0);
  const aggregatedTodayOrders = Object.values(insights).reduce((sum: number, i: any) => sum + Number(i.today_orders ?? 0), 0);
  const aggregatedYesterdayOrders = Object.values(insights).reduce((sum: number, i: any) => sum + Number(i.yesterday_orders ?? 0), 0);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Today's Performance Summary */}
      <div className="grid gap-3 grid-cols-2">
        <MetricCard
          title="Today's Spend"
          value={`$${aggregatedTodaySpend.toLocaleString()}`}
          subtitle={`Yesterday: $${aggregatedYesterdaySpend.toLocaleString()}`}
          icon={DollarSign}
          iconBg="bg-emerald-50 dark:bg-emerald-900/30"
          iconColor="text-emerald-600"
          size={isMobile ? "sm" : "default"}
        />
        <MetricCard
          title="Today's Orders"
          value={aggregatedTodayOrders.toLocaleString()}
          subtitle={`Yesterday: ${aggregatedYesterdayOrders.toLocaleString()}`}
          icon={ShoppingCart}
          iconBg="bg-blue-50 dark:bg-blue-900/30"
          iconColor="text-blue-600"
          size={isMobile ? "sm" : "default"}
        />
      </div>

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl md:text-2xl font-bold">Ad Accounts</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {isAutoSyncing && (
            <span className="text-xs text-primary flex items-center gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Syncing from Meta...
            </span>
          )}
          {lastUpdated && !isMobile && !isAutoSyncing && (
            <span className="text-xs text-muted-foreground">
              Last synced: {lastUpdated.toLocaleString()}
            </span>
          )}
          {showSelect && selectedIds.size > 0 && (
            <Button
              variant="default"
              size="sm"
              onClick={() => refreshSelectedMutation.mutate()}
              disabled={refreshSelectedMutation.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${refreshSelectedMutation.isPending ? 'animate-spin' : ''}`} />
              {refreshSelectedMutation.isPending ? "..." : `Update ${selectedIds.size}`}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshAllMutation.mutate()}
            disabled={refreshAllMutation.isPending}
            className="text-xs"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshAllMutation.isPending ? 'animate-spin' : ''}`} />
            {refreshAllMutation.isPending ? "Updating..." : isMobile ? "Update All" : "Update All from Meta"}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[140px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 rounded-full"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[110px] md:w-[140px] h-9 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="unsettled">Unsettled</SelectItem>
          </SelectContent>
        </Select>
        {!isMobile && (
          <Select value={cardFilter} onValueChange={setCardFilter}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Card" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cards</SelectItem>
              {uniqueCards.map((card) => (
                <SelectItem key={card} value={card}>{card}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          variant={showSelect ? "secondary" : "ghost"}
          size="icon"
          className="h-9 w-9"
          onClick={() => {
            setShowSelect((v) => !v);
            if (showSelect) setSelectedIds(new Set());
          }}
          title="Toggle selection"
        >
          <ListChecks className="h-4 w-4" />
        </Button>
      </div>

      {isInactive && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="p-3 flex items-center gap-2">
            <span className="text-destructive font-semibold text-sm">⚠️ Account frozen. Top up disabled.</span>
          </CardContent>
        </Card>
      )}

      {/* Mobile Card Layout */}
      {isMobile ? (
        <div className="space-y-3">
          {paginatedAccounts.map((a: any) => {
            const ins = insights[a.id];
            return (
              <Card
                key={a.id}
                className="border border-border/60 shadow-sm cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => navigate(`/ad-accounts/${a.id}`)}
                data-state={selectedIds.has(a.id) ? "selected" : undefined}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    {showSelect && (
                      <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(a.id)}
                          onCheckedChange={() => toggleSelect(a.id)}
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {/* Top row: name + status */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{a.account_name}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[11px] text-muted-foreground font-mono">{a.account_id.replace(/^act_/, '')}</span>
                            <a
                              href={`https://business.facebook.com/billing_hub/accounts/details?asset_id=${a.account_id.replace(/^act_/, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-primary"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                        <StatusBadge status={a.status} />
                      </div>

                      {/* Spend progress */}
                      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                        <SpendProgressBar amountSpent={Number(a.amount_spent)} spendCap={Number(a.spend_cap)} balanceAfterTopup={Number((a as any).balance_after_topup ?? 0)} />
                      </div>

                      {/* Insights row */}
                      {ins && (
                        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                          <div className="bg-muted/50 rounded-md p-1.5">
                            <p className="text-[10px] text-muted-foreground">Today Spend</p>
                            <p className="text-xs font-semibold">${Number(ins.today_spend ?? 0).toLocaleString()}</p>
                          </div>
                          <div className="bg-muted/50 rounded-md p-1.5">
                            <p className="text-[10px] text-muted-foreground">Orders</p>
                            <p className="text-xs font-semibold">{Number(ins.today_orders ?? 0)}</p>
                          </div>
                          <div className="bg-muted/50 rounded-md p-1.5">
                            <p className="text-[10px] text-muted-foreground">Balance</p>
                            <p className="text-xs font-semibold">${Number(ins.balance ?? 0).toLocaleString()}</p>
                          </div>
                        </div>
                      )}

                      {/* Top Up + Actions */}
                      <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8"
                          disabled={isInactive}
                          onClick={() => { setTopUpAccount(a); setTopUpAmount(""); }}
                        >
                          <ArrowUpCircle className="h-3.5 w-3.5 mr-1" />
                          Top Up
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setBmReqAccount(a); setBmReqForm({ bm_name: "", bm_id: "" }); }}>
                              Request BM Access
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {(!accounts || accounts.length === 0) && (
            <p className="text-center text-muted-foreground py-8 text-sm">No ad accounts assigned to you yet</p>
          )}
          {accounts && accounts.length > 0 && paginatedAccounts.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">No accounts match your filters</p>
          )}
        </div>
      ) : (
        /* Desktop Table Layout */
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  {showSelect && (
                    <TableHead className="w-[40px]" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={allPageSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                    </TableHead>
                  )}
                  <TableHead className="w-[200px]">
                    <button className="flex items-center text-xs font-medium" onClick={() => toggleSort("account_name")}>
                      Ad Account <SortIcon field="account_name" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[100px]">
                    <button className="flex items-center text-xs font-medium" onClick={() => toggleSort("spend_cap")}>
                      Budget <SortIcon field="spend_cap" />
                    </button>
                  </TableHead>
                  <TableHead className="w-[90px]">
                    <span className="text-xs font-medium">Status</span>
                  </TableHead>
                  <TableHead className="w-[50px]">
                    <span className="text-xs font-medium">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedAccounts.map((a: any) => {
                  const ins = insights[a.id];
                  return (
                    <TableRow
                      key={a.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/ad-accounts/${a.id}`)}
                      data-state={selectedIds.has(a.id) ? "selected" : undefined}
                    >
                      {showSelect && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(a.id)}
                            onCheckedChange={() => toggleSelect(a.id)}
                            aria-label={`Select ${a.account_name}`}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                            <AppWindow className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="text-sm text-primary">{a.account_name}</div>
                            {a.business_managers?.name && (
                              <div className="text-xs text-muted-foreground">{a.business_managers.name}</div>
                            )}
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground font-mono">{a.account_id.replace(/^act_/, '')}</span>
                              <a
                                href={`https://business.facebook.com/billing_hub/accounts/details?asset_id=${a.account_id.replace(/^act_/, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <SpendProgressBar amountSpent={Number(a.amount_spent)} spendCap={Number(a.spend_cap)} />
                      </TableCell>
                      <TableCell><StatusBadge status={a.status} /></TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="default"
                            className="bg-primary hover:bg-primary/90 text-primary-foreground"
                            disabled={isInactive}
                            onClick={() => { setTopUpAccount(a); setTopUpAmount(""); }}
                          >
                            <ArrowUpCircle className="h-4 w-4" />
                            Top Up
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setBmReqAccount(a); setBmReqForm({ bm_name: "", bm_id: "" }); }}>
                                Request BM Access
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(!accounts || accounts.length === 0) && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No ad accounts assigned to you yet</TableCell></TableRow>
                )}
                {accounts && accounts.length > 0 && paginatedAccounts.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No accounts match your filters</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-muted-foreground">
            {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, sortedAccounts.length)} of {sortedAccounts.length}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={safePage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .map((p, idx, arr) => (
                <span key={p} className="flex items-center">
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-xs text-muted-foreground">…</span>}
                  <Button variant={p === safePage ? "default" : "outline"} size="icon" className="h-8 w-8 text-xs" onClick={() => setCurrentPage(p)}>{p}</Button>
                </span>
              ))}
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={safePage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Failed Top-Ups */}
      <FailedTopUps />

      {/* Top Up Dialog */}
      <Dialog open={!!topUpAccount} onOpenChange={(open) => !open && setTopUpAccount(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Increase Spend Limit</DialogTitle>
            <DialogDescription>
              Top up <span className="font-semibold">{topUpAccount?.account_name}</span> ({topUpAccount?.account_id?.replace(/^act_/, '')})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex justify-between items-center text-sm p-3 rounded-lg bg-muted">
              <span className="flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Wallet Balance
              </span>
              <span className={`font-semibold ${walletBalance < 0 ? 'text-destructive' : ''}`}>
                ${walletBalance.toLocaleString()}
              </span>
            </div>
            {dueLimit > 0 && (
              <div className="flex justify-between items-center text-sm p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                <span className="text-amber-700 dark:text-amber-400">Due Limit</span>
                <span className="font-semibold text-amber-700 dark:text-amber-400">${dueLimit.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Current Spend Cap</span>
              <span className="font-medium">${Number(topUpAccount?.spend_cap ?? 0).toLocaleString()}</span>
            </div>
            <div className="space-y-2">
              <Label>Amount to Add (USD)</Label>
              <Input
                type="number"
                min="1"
                step="0.01"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                placeholder="500.00"
              />
              {exceedsBalance && parsedAmount > 0 && (
                <p className="text-sm text-destructive">Amount exceeds your wallet balance{dueLimit > 0 ? " + due limit" : ""}</p>
              )}
              {usingDueLimit && parsedAmount > 0 && (
                <p className="text-sm text-amber-600">⚠️ Using ${(parsedAmount - walletBalance).toLocaleString()} from due limit</p>
              )}
            </div>
            {parsedAmount > 0 && !exceedsBalance && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">New Spend Cap</span>
                <span className="font-medium text-primary">
                  ${(Number(topUpAccount?.spend_cap ?? 0) + parsedAmount).toLocaleString()}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopUpAccount(null)}>Cancel</Button>
            <Button
              onClick={() => topUpMutation.mutate()}
              disabled={!topUpAmount || parsedAmount <= 0 || exceedsBalance || topUpMutation.isPending}
            >
              {topUpMutation.isPending ? "Processing..." : "Top Up Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BM Access Request Dialog */}
      <Dialog open={!!bmReqAccount} onOpenChange={(open) => { if (!open) setBmReqAccount(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request BM Access</DialogTitle>
            <DialogDescription>
              Request Business Manager partner access for <span className="font-medium text-foreground">{bmReqAccount?.account_name}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>BM Name *</Label>
              <Input
                value={bmReqForm.bm_name}
                onChange={(e) => setBmReqForm(f => ({ ...f, bm_name: e.target.value }))}
                placeholder="Business Manager name"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>BM ID *</Label>
              <Input
                value={bmReqForm.bm_id}
                onChange={(e) => setBmReqForm(f => ({ ...f, bm_id: e.target.value }))}
                placeholder="e.g. 123456789"
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBmReqAccount(null)}>Cancel</Button>
            <Button onClick={handleBmReqSubmit} disabled={bmReqLoading || !bmReqForm.bm_name || !bmReqForm.bm_id}>
              {bmReqLoading ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
