import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { SpendProgressBar } from "@/components/SpendProgressBar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowUpCircle, ExternalLink, Wallet, CreditCard, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

interface InsightsData {
  today_spend: number;
  yesterday_spend: number;
  balance: number;
  cards: { id: string; display_string: string; type: number }[];
}

export function ClientAdAccounts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [topUpAccount, setTopUpAccount] = useState<any>(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [insights, setInsights] = useState<Record<string, InsightsData>>({});
  const [sortField, setSortField] = useState<string>("account_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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

  const { data: wallet } = useQuery({
    queryKey: ["client-wallet", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("balance").eq("user_id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (accounts && accounts.length > 0) {
      const ids = accounts.map((a: any) => a.id);
      supabase.functions.invoke("get-account-insights", {
        body: { ad_account_ids: ids },
      }).then(({ data }) => {
        if (data?.insights) setInsights(data.insights);
      }).catch(() => {});
    }
  }, [accounts]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
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

  const walletBalance = Number(wallet?.balance ?? 0);
  const parsedAmount = parseFloat(topUpAmount) || 0;
  const exceedsBalance = parsedAmount > walletBalance;

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
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Ad Accounts</h1>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button className="flex items-center font-medium" onClick={() => toggleSort("account_name")}>
                    Account <SortIcon field="account_name" />
                  </button>
                </TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead>
                  <button className="flex items-center font-medium" onClick={() => toggleSort("spend_cap")}>
                    Spend Cap / Spent <SortIcon field="spend_cap" />
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center font-medium" onClick={() => toggleSort("today_spend")}>
                    Today <SortIcon field="today_spend" />
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center font-medium" onClick={() => toggleSort("yesterday_spend")}>
                    Yesterday <SortIcon field="yesterday_spend" />
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center font-medium" onClick={() => toggleSort("balance")}>
                    Balance <SortIcon field="balance" />
                  </button>
                </TableHead>
                <TableHead>Cards</TableHead>
                <TableHead>Actions</TableHead>
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
                          <div className="font-semibold text-primary">{a.account_name}</div>
                          <div className="text-xs text-muted-foreground font-mono">ID: {a.account_id.replace(/^act_/, '')}</div>
                          {a.business_managers?.name && (
                            <div className="text-[11px] text-muted-foreground">{a.business_managers.name}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell"><StatusBadge status={a.status} /></TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <SpendProgressBar amountSpent={Number(a.amount_spent)} spendCap={Number(a.spend_cap)} />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium">${ins?.today_spend?.toLocaleString() ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium">${ins?.yesterday_spend?.toLocaleString() ?? '—'}</span>
                    </TableCell>
                    <TableCell>
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
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => { setTopUpAccount(a); setTopUpAmount(""); }}
                        >
                          <ArrowUpCircle className="h-4 w-4 mr-1" />
                          <span className="hidden sm:inline">Top Up</span>
                        </Button>
                        <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                          <a
                            href={`https://business.facebook.com/billing_hub/accounts/details?asset_id=${a.account_id.replace(/^act_/, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Billing
                          </a>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!accounts || accounts.length === 0) && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No ad accounts assigned to you yet</TableCell></TableRow>
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
                max={walletBalance}
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                placeholder="500.00"
              />
              {exceedsBalance && parsedAmount > 0 && (
                <p className="text-sm text-destructive">Amount exceeds your wallet balance</p>
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
