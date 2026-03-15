import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { SpendProgressBar } from "@/components/SpendProgressBar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowUpCircle, ExternalLink, Wallet, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown, CreditCard, RefreshCw } from "lucide-react";

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
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());

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

  const refreshSingle = async (accountId: string) => {
    setRefreshingIds(prev => new Set(prev).add(accountId));
    try {
      const { error } = await supabase.functions.invoke("get-account-insights", {
        body: { ad_account_ids: [accountId], source: "meta" },
      });
      if (error) throw error;
      await refetchInsights();
      toast.success("Account updated");
    } catch {
      toast.error("Failed to refresh");
    } finally {
      setRefreshingIds(prev => { const s = new Set(prev); s.delete(accountId); return s; });
    }
  };

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

  const sortedAccounts = useMemo(() => {
    if (!accounts) return [];
    return [...accounts].sort((a, b) => {
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
  }, [accounts, insights, sortField, sortDir]);

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
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[220px]">
                  <button className="flex items-center font-medium" onClick={() => toggleSort("account_name")}>
                    Account <SortIcon field="account_name" />
                  </button>
                </TableHead>
                <TableHead className="w-[80px]">Status</TableHead>
                <TableHead className="w-[150px]">
                  <button className="flex items-center font-medium" onClick={() => toggleSort("spend_cap")}>
                    Spend Cap / Spent <SortIcon field="spend_cap" />
                  </button>
                </TableHead>
                <TableHead className="w-[90px]">
                  <button className="flex items-center font-medium" onClick={() => toggleSort("today_spend")}>
                    Today <SortIcon field="today_spend" />
                  </button>
                </TableHead>
                <TableHead className="w-[90px]">
                  <button className="flex items-center font-medium" onClick={() => toggleSort("yesterday_spend")}>
                    Yesterday <SortIcon field="yesterday_spend" />
                  </button>
                </TableHead>
                <TableHead className="w-[90px]">
                  <button className="flex items-center font-medium" onClick={() => toggleSort("balance")}>
                    Balance <SortIcon field="balance" />
                  </button>
                </TableHead>
                <TableHead className="w-[130px]">Cards</TableHead>
                <TableHead className="w-[120px]">Assigned To</TableHead>
                <TableHead className="w-[160px]">Actions</TableHead>
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
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
                          </svg>
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-primary">{a.account_name}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">ID: {a.account_id.replace(/^act_/, '')}</div>
                          {a.business_managers?.name && (
                            <div className="text-[11px] text-muted-foreground">{a.business_managers.name}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <SpendProgressBar amountSpent={Number(a.amount_spent)} spendCap={Number(a.spend_cap)} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="text-sm font-medium">${ins?.today_spend?.toLocaleString() ?? '—'}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="text-sm font-medium">${ins?.yesterday_spend?.toLocaleString() ?? '—'}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="text-sm font-semibold">${ins?.balance?.toLocaleString() ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs space-y-0.5">
                        {ins?.cards && ins.cards.length > 0 ? (
                          ins.cards.map((card: any, i: number) => (
                            <div key={i} className="flex items-center gap-1">
                              <CreditCard className="h-3 w-3 text-muted-foreground" />
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
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          onClick={() => { setTopUpAccount(a); setTopUpAmount(""); }}
                        >
                          <ArrowUpCircle className="h-4 w-4 mr-1" />
                          Top Up
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => refreshSingle(a.id)}
                          disabled={refreshingIds.has(a.id)}
                          title="Refresh from Meta"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${refreshingIds.has(a.id) ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <a
                            href={`https://business.facebook.com/billing_hub/accounts/details?asset_id=${a.account_id.replace(/^act_/, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!accounts || accounts.length === 0) && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No ad accounts</TableCell></TableRow>
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
