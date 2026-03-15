import { useState } from "react";
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
import { ArrowUpCircle, ExternalLink, Wallet, AlertTriangle } from "lucide-react";

export function AdminAdAccounts() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [topUpAccount, setTopUpAccount] = useState<any>(null);
  const [topUpAmount, setTopUpAmount] = useState("");

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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">All Ad Accounts</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ad Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Business Manager</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Spend Cap / Spent</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts?.map((a: any) => (
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
                        <div className="text-xs text-muted-foreground font-mono">ID: {a.account_id}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{a.business_managers?.name || "—"}</TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <SpendProgressBar amountSpent={Number(a.amount_spent)} spendCap={Number(a.spend_cap)} />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{getClientName(getAssignedUserId(a.id))}</span>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => { setTopUpAccount(a); setTopUpAmount(""); }}
                      >
                        <ArrowUpCircle className="h-4 w-4 mr-1" />
                        Top Up
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
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
              ))}
              {(!accounts || accounts.length === 0) && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No ad accounts</TableCell></TableRow>
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
              Top up <span className="font-semibold">{topUpAccount?.account_name}</span> ({topUpAccount?.account_id})
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
