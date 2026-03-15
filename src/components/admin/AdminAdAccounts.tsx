import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { SpendProgressBar } from "@/components/SpendProgressBar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowUpCircle, ExternalLink, Wallet, AlertTriangle } from "lucide-react";

export function AdminAdAccounts() {
  const queryClient = useQueryClient();
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

  const assignMutation = useMutation({
    mutationFn: async ({ accountId, userId }: { accountId: string; userId: string | null }) => {
      await (supabase as any).from("user_ad_accounts").delete().eq("ad_account_id", accountId);
      if (userId) {
        const { error } = await (supabase as any).from("user_ad_accounts").insert({
          user_id: userId,
          ad_account_id: accountId,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Assignment updated");
      queryClient.invalidateQueries({ queryKey: ["admin-ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-ad-accounts"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const getAssignedUserId = (accountId: string) => {
    const assignment = assignments?.find((a: any) => a.ad_account_id === accountId);
    return assignment?.user_id ?? null;
  };

  const getClientWallet = (userId: string | null) => {
    if (!userId) return null;
    return allWallets?.find((w: any) => w.user_id === userId);
  };

  const getClientName = (userId: string | null) => {
    if (!userId) return null;
    const client = clients?.find((c: any) => c.user_id === userId);
    return client?.full_name || client?.email || userId;
  };

  // Computed values for top-up dialog
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
                <TableHead>Account Name</TableHead>
                <TableHead>Account ID</TableHead>
                <TableHead>Business Manager</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Spend Cap / Spent</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts?.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.account_name}</TableCell>
                  <TableCell className="font-mono text-sm">{a.account_id}</TableCell>
                  <TableCell>{a.business_managers?.name || "—"}</TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell>
                    <SpendProgressBar amountSpent={Number(a.amount_spent)} spendCap={Number(a.spend_cap)} />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={getAssignedUserId(a.id) || "unassigned"}
                      onValueChange={(val) => assignMutation.mutate({ accountId: a.id, userId: val === "unassigned" ? null : val })}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {clients?.map((c: any) => (
                          <SelectItem key={c.user_id} value={c.user_id}>
                            {c.full_name || c.email || c.user_id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
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
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No ad accounts</TableCell></TableRow>
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
