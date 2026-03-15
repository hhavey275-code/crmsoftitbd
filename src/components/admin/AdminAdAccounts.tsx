import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowUpCircle, ExternalLink, Wallet, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown, CreditCard, RefreshCw, AppWindow, Search, ListChecks, Trash2 } from "lucide-react";
import { CardBrandIcon } from "@/components/CardBrandIcon";

interface InsightsData {
  today_spend: number;
  yesterday_spend: number;
  balance: number;
  cards: { id: string; display_string: string; type: number }[];
  updated_at?: string;
}

export function AdminAdAccounts() {
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: accounts } = useQuery({
    queryKey: ["admin-ad-accounts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ad_accounts")
        .select("*, business_managers(name)")
        .order("created_at", { ascending: false });
      return (data as any[]) ?? [];
    },
  });

  const { data: insights = {}, refetch: refetchInsights } = useQuery({
    queryKey: ["admin-insights-cache"],
    queryFn: async () => {
      if (!accounts || accounts.length === 0) return {};
      const ids = accounts.map((a: any) => a.id);
      const { data } = await supabase.functions.invoke("get-account-insights", {
        body: { ad_account_ids: ids, source: "cache" },
      });
      return (data?.insights as Record<string, InsightsData>) ?? {};
    },
    enabled: !!accounts && accounts.length > 0,
  });

  const { data: assignments } = useQuery({
    queryKey: ["admin-user-ad-accounts"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("user_ad_accounts").select("*");
      return (data as any[]) ?? [];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["admin-clients-list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, email");
      return (data as any[]) ?? [];
    },
  });

  const { data: allWallets } = useQuery({
    queryKey: ["admin-all-wallets"],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("user_id, balance");
      return (data as any[]) ?? [];
    },
  });

  const refreshAllMutation = useMutation({
    mutationFn: async () => {
      if (!accounts || accounts.length === 0) return;
      const ids = accounts.map((a: any) => a.id);
      const { data, error } = await supabase.functions.invoke("get-account-insights", {
        body: { ad_account_ids: ids, source: "meta" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("All accounts updated from Meta");
      refetchInsights();
    },
    onError: (err: any) => toast.error(err.message || "Failed to refresh"),
  });

  const refreshSelectedMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      const { data, error } = await supabase.functions.invoke("get-account-insights", {
        body: { ad_account_ids: ids, source: "meta" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(`${selectedIds.size} account(s) updated from Meta`);
      refetchInsights();
      setSelectedIds(new Set());
    },
    onError: (err: any) => toast.error(err.message || "Failed to refresh"),
  });

  const getAssignedUserId = (accountId: string) => {
    const assignment = assignments?.find((a: any) => a.ad_account_id === accountId);
    return assignment?.user_id ?? null;
  };

  const getClientName = (userId: string | null) => {
    if (!userId) return "Unassigned";
    const client = clients?.find((c: any) => c.user_id === userId);
    return client?.full_name || client?.email || userId;
  };

  const getClientWallet = (userId: string | null) => {
    if (!userId) return null;
    return allWallets?.find((w: any) => w.user_id === userId);
  };

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
        const insA = insights[a.id];
        const insB = insights[b.id];
        switch (sortField) {
          case "account_name": valA = a.account_name?.toLowerCase(); valB = b.account_name?.toLowerCase(); break;
          case "today_spend": valA = insA?.today_spend ?? 0; valB = insB?.today_spend ?? 0; break;
          case "yesterday_spend": valA = insA?.yesterday_spend ?? 0; valB = insB?.yesterday_spend ?? 0; break;
          case "balance": valA = insA?.balance ?? 0; valB = insB?.balance ?? 0; break;
          case "spend_cap": valA = Number(a.spend_cap); valB = Number(b.spend_cap); break;
          default: valA = a.account_name?.toLowerCase(); valB = b.account_name?.toLowerCase();
        }
        if (valA < valB) return sortDir === "asc" ? -1 : 1;
        if (valA > valB) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
  }, [accounts, insights, sortField, sortDir, search, statusFilter, cardFilter]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!sortedAccounts.length) return;
    if (selectedIds.size === sortedAccounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedAccounts.map((a: any) => a.id)));
    }
  };

  const allSelected = sortedAccounts.length > 0 && selectedIds.size === sortedAccounts.length;

  const assignedUserId = topUpAccount ? getAssignedUserId(topUpAccount.id) : null;
  const assignedWallet = getClientWallet(assignedUserId);
  const assignedClientName = getClientName(assignedUserId);
  const clientBalance = Number(assignedWallet?.balance ?? 0);
  const parsedAmount = parseFloat(topUpAmount) || 0;
  const willGoNegative = parsedAmount > clientBalance;

  const topUpMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("update-spend-cap", {
        body: {
          ad_account_id: topUpAccount.id,
          amount: parsedAmount,
          deduct_wallet: !!assignedUserId,
          target_user_id: assignedUserId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Spend cap updated: $${Number(data.old_spend_cap).toLocaleString()} → $${Number(data.new_spend_cap).toLocaleString()}`);
      setTopUpAccount(null);
      setTopUpAmount("");
      queryClient.invalidateQueries({ queryKey: ["admin-ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-all-wallets"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Find the oldest updated_at across all insights
  const lastUpdated = useMemo(() => {
    const times = Object.values(insights).map((i: any) => i.updated_at).filter(Boolean);
    if (times.length === 0) return null;
    return new Date(Math.min(...times.map((t: string) => new Date(t).getTime())));
  }, [insights]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">All Ad Accounts</h1>
        <div className="flex items-center gap-3">
          {lastUpdated && (
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
              {refreshSelectedMutation.isPending ? "Updating..." : `Update ${selectedIds.size} Selected`}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshAllMutation.mutate()}
            disabled={refreshAllMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshAllMutation.isPending ? 'animate-spin' : ''}`} />
            {refreshAllMutation.isPending ? "Updating..." : "Update All from Meta"}
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
            <SelectItem value="unsettled">Unsettled</SelectItem>
          </SelectContent>
        </Select>
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
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                {showSelect && (
                  <TableHead className="w-[40px]" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
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
                <TableHead className="w-[90px]">
                  <button className="flex items-center text-xs font-medium" onClick={() => toggleSort("balance")}>
                    Balance <SortIcon field="balance" />
                  </button>
                </TableHead>
                <TableHead className="w-[100px]">
                  <button className="flex items-center text-xs font-medium" onClick={() => toggleSort("today_spend")}>
                    Today <SortIcon field="today_spend" />
                  </button>
                </TableHead>
                <TableHead className="w-[100px]">
                  <button className="flex items-center text-xs font-medium" onClick={() => toggleSort("yesterday_spend")}>
                    Yesterday <SortIcon field="yesterday_spend" />
                  </button>
                </TableHead>
                <TableHead className="w-[110px]">
                  <span className="text-xs font-medium">Card Name</span>
                </TableHead>
                <TableHead className="w-[90px]">
                  <span className="text-xs font-medium">Client</span>
                </TableHead>
                <TableHead className="w-[60px]">
                  <span className="text-xs font-medium">Billing</span>
                </TableHead>
                <TableHead className="w-[80px]">
                  <span className="text-xs font-medium">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedAccounts.map((a: any) => {
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
                          <div className="mt-0.5">
                            <span className="text-xs text-muted-foreground font-mono">{a.account_id.replace(/^act_/, '')}</span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <SpendProgressBar amountSpent={Number(a.amount_spent)} spendCap={Number(a.spend_cap)} />
                    </TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="text-sm">${ins?.balance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—'}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="text-sm">$ {ins?.today_spend?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—'}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="text-sm">$ {ins?.yesterday_spend?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm whitespace-nowrap">
                        {ins?.cards && ins.cards.length > 0 ? (
                          ins.cards.map((card: any, i: number) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <CardBrandIcon displayString={card.display_string} size="xs" />
                              <span>{card.display_string}</span>
                            </div>
                          ))
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{getClientName(getAssignedUserId(a.id))}</span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <a
                        href={`https://business.facebook.com/billing_hub/accounts/details?asset_id=${a.account_id.replace(/^act_/, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setTopUpAccount(a); setTopUpAmount(""); }}
                      >
                        <ArrowUpCircle className="h-3.5 w-3.5 mr-1" />
                        Top Up
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!accounts || accounts.length === 0) && (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">No ad accounts</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!topUpAccount} onOpenChange={(open) => !open && setTopUpAccount(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Increase Spend Limit</DialogTitle>
            <DialogDescription>
              Top up <span className="font-semibold">{topUpAccount?.account_name}</span> ({topUpAccount?.account_id?.replace(/^act_/, '')})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {assignedUserId ? (
              <div className="p-3 rounded-lg bg-muted space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Assigned Client</span>
                  <span className="font-medium">{assignedClientName}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    Client Wallet Balance
                  </span>
                  <span className={`font-semibold ${clientBalance < 0 ? 'text-destructive' : ''}`}>
                    ${clientBalance.toLocaleString()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-muted text-sm text-muted-foreground">
                No client assigned — wallet will not be deducted
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
              {willGoNegative && parsedAmount > 0 && assignedUserId && (
                <div className="flex items-center gap-2 text-sm text-yellow-600">
                  <AlertTriangle className="h-4 w-4" />
                  Client balance will go negative by ${(parsedAmount - clientBalance).toLocaleString()}
                </div>
              )}
            </div>
            {parsedAmount > 0 && (
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
              disabled={!topUpAmount || parsedAmount <= 0 || topUpMutation.isPending}
            >
              {topUpMutation.isPending ? "Processing..." : "Top Up Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
