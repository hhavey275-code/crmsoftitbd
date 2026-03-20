import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { SpendProgressBar } from "@/components/SpendProgressBar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowUpCircle, Search, Loader2 } from "lucide-react";
import { friendlyEdgeError } from "@/lib/utils";

export function ClientTikTokAccounts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isBackNav = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.type === 'back_forward';
  const [search, setSearch] = useState(() => isBackNav ? (sessionStorage.getItem("tiktokAccountsSearch") || "") : "");
  useEffect(() => { sessionStorage.setItem("tiktokAccountsSearch", search); }, [search]);
  const [topUpAccount, setTopUpAccount] = useState<any>(null);
  const [topUpAmount, setTopUpAmount] = useState("");

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["client-tiktok-accounts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_accounts")
        .select("*")
        .eq("platform", "tiktok")
        .order("account_name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const topUpMutation = useMutation({
    mutationFn: async () => {
      if (!topUpAccount || !topUpAmount) throw new Error("Missing data");
      const amt = parseFloat(topUpAmount);
      if (isNaN(amt) || amt <= 0) throw new Error("Invalid amount");

      const { data, error } = await supabase.functions.invoke("tiktok-topup", {
        body: { ad_account_id: topUpAccount.id, amount: amt, deduct_wallet: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success(`Top up successful: $${topUpAmount}`);
      setTopUpAccount(null);
      setTopUpAmount("");
      queryClient.invalidateQueries({ queryKey: ["client-tiktok-accounts"] });
    },
    onError: (err: any) => toast.error(friendlyEdgeError(err)),
  });

  const filtered = useMemo(() => {
    if (!search) return accounts;
    const s = search.toLowerCase();
    return accounts.filter(
      (a: any) =>
        a.account_name.toLowerCase().includes(s) ||
        a.account_id.toLowerCase().includes(s)
    );
  }, [accounts, search]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-foreground">TikTok Ad Accounts</h2>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search TikTok accounts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account Name</TableHead>
                <TableHead>Account ID</TableHead>
                <TableHead>Spend Cap</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No TikTok ad accounts assigned
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((acc: any) => (
                  <TableRow key={acc.id}>
                    <TableCell className="font-medium">{acc.account_name}</TableCell>
                    <TableCell className="text-muted-foreground">{acc.account_id}</TableCell>
                    <TableCell>
                      <SpendProgressBar amountSpent={acc.amount_spent} spendCap={acc.spend_cap} balanceAfterTopup={Number((acc as any).balance_after_topup ?? 0)} />
                    </TableCell>
                    <TableCell><StatusBadge status={acc.status} /></TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => setTopUpAccount(acc)}>
                        <ArrowUpCircle className="h-4 w-4 mr-1" /> Top Up
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Top Up Dialog */}
      <Dialog open={!!topUpAccount} onOpenChange={(o) => !o && setTopUpAccount(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Top Up TikTok Account</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{topUpAccount?.account_name} ({topUpAccount?.account_id})</p>
          <div>
            <Label>Amount (USD)</Label>
            <Input
              type="number"
              min="1"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              placeholder="Enter amount"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopUpAccount(null)}>Cancel</Button>
            <Button onClick={() => topUpMutation.mutate()} disabled={topUpMutation.isPending}>
              {topUpMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Top Up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
