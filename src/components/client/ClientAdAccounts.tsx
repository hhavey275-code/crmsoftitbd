import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
import { ArrowUpCircle, ExternalLink, Wallet, CreditCard, ArrowUp, ArrowDown, ArrowUpDown, RefreshCw, AppWindow } from "lucide-react";

interface InsightsData {
  today_spend: number;
  yesterday_spend: number;
  balance: number;
  cards: { id: string; display_string: string; type: number }[];
  updated_at?: string;
}

export function ClientAdAccounts() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [topUpAccount, setTopUpAccount] = useState<any>(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [sortField, setSortField] = useState<string>("account_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isInactive = (profile as any)?.status === "inactive";
  const dueLimit = Number((profile as any)?.due_limit ?? 0);

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
  });

  const { data: wallet } = useQuery({
    queryKey: ["client-wallet", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("balance").eq("user_id", user!.id).single();
      return data;
    },
    enabled: !!user,
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

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const sortedAccounts = useMemo(() => {
    if (!accounts) return [];
    return [...accounts].sort((a, b) => {
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
  }, [accounts, sortField, sortDir]);

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

  const walletBalance = Number(wallet?.balance ?? 0);
  const effectiveBalance = walletBalance + dueLimit;
  const parsedAmount = parseFloat(topUpAmount) || 0;
  const exceedsBalance = parsedAmount > effectiveBalance;
  const usingDueLimit = parsedAmount > walletBalance && parsedAmount <= effectiveBalance;

  const topUpMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("update-spend-cap", {
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
    onError: (err: any) => toast.error(err.message),
  });

  const lastUpdated = useMemo(() => {
    const times = Object.values(insights).map((i: any) => i.updated_at).filter(Boolean);
    if (times.length === 0) return null;
    return new Date(Math.min(...times.map((t: string) => new Date(t).getTime())));
  }, [insights]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ad Accounts</h1>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Last synced: {lastUpdated.toLocaleString()}
            </span>
          )}
          {selectedIds.size > 0 && (
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

      {isInactive && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="p-4 flex items-center gap-3">
            <span className="text-destructive font-semibold">⚠️ Your account has been frozen by admin. You cannot top up ad accounts.</span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
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
                <TableHead className="w-[90px] hidden sm:table-cell">
                  <span className="text-xs font-medium">Status</span>
                </TableHead>
                <TableHead className="w-[110px]">
                  <span className="text-xs font-medium">Card Name</span>
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
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(a.id)}
                        onCheckedChange={() => toggleSelect(a.id)}
                        aria-label={`Select ${a.account_name}`}
                      />
                    </TableCell>
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
                    <TableCell className="hidden sm:table-cell"><StatusBadge status={a.status} /></TableCell>
                    <TableCell>
                      <div className="text-sm whitespace-nowrap">
                        {ins?.cards && ins.cards.length > 0 ? (
                          ins.cards.map((card: any, i: number) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{card.display_string}</span>
                            </div>
                          ))
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
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
                        disabled={isInactive}
                        onClick={() => { setTopUpAccount(a); setTopUpAmount(""); }}
                      >
                        <ArrowUpCircle className="h-3.5 w-3.5 mr-1" />
                        <span className="hidden sm:inline">Top Up</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!accounts || accounts.length === 0) && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No ad accounts assigned to you yet</TableCell></TableRow>
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
    </div>
  );
}
