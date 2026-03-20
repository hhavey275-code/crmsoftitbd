import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { SpendProgressBar } from "@/components/SpendProgressBar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowUpCircle, Search, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { friendlyEdgeError } from "@/lib/utils";

interface PendingTopUp {
  ad_account_id: string;
  account_name: string;
  account_id: string;
  amount: number;
  old_spend_cap: number;
  expected_new_cap: number;
  billing_url: string;
}

export function ClientTikTokAccounts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(() => sessionStorage.getItem("tiktokAccountsSearch") || "");
  useEffect(() => { sessionStorage.setItem("tiktokAccountsSearch", search); }, [search]);
  const [topUpAccount, setTopUpAccount] = useState<any>(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [pendingTopUp, setPendingTopUp] = useState<PendingTopUp | null>(null);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Restore pending top-up from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem("pendingTikTokTopUp");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setPendingTopUp(parsed);
        setShowVerifyDialog(true);
      } catch { /* ignore */ }
    }
  }, []);

  // Fetch wallet balance
  const { data: wallet } = useQuery({
    queryKey: ["client-wallet", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("balance").eq("user_id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });

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
    onSuccess: (data) => {
      if (data.pending_verify) {
        // Save pending state and redirect
        const pending: PendingTopUp = {
          ad_account_id: data.ad_account_id,
          account_name: topUpAccount.account_name,
          account_id: data.account_id,
          amount: data.amount,
          old_spend_cap: data.old_spend_cap,
          expected_new_cap: data.expected_new_cap,
          billing_url: data.billing_url,
        };
        sessionStorage.setItem("pendingTikTokTopUp", JSON.stringify(pending));
        setPendingTopUp(pending);

        setTopUpAccount(null);
        setTopUpAmount("");
        queryClient.invalidateQueries({ queryKey: ["client-tiktok-accounts"] });
        queryClient.invalidateQueries({ queryKey: ["client-wallet"] });

        // Redirect to TikTok billing
        window.open(data.billing_url, "_blank");

        // Show verify dialog after a short delay
        setTimeout(() => setShowVerifyDialog(true), 1000);
      } else {
        toast.success(`Top up successful: $${topUpAmount}`);
        setTopUpAccount(null);
        setTopUpAmount("");
        queryClient.invalidateQueries({ queryKey: ["client-tiktok-accounts"] });
        queryClient.invalidateQueries({ queryKey: ["client-wallet"] });
      }
    },
    onError: (err: any) => toast.error(friendlyEdgeError(err)),
  });

  const handleVerify = async (confirmed: boolean) => {
    if (!confirmed || !pendingTopUp) {
      // If user says "No" — they didn't increase. Just close, no action.
      sessionStorage.removeItem("pendingTikTokTopUp");
      setPendingTopUp(null);
      setShowVerifyDialog(false);
      toast.info("Top-up not verified. Contact admin if you need assistance.");
      return;
    }

    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("tiktok-verify-topup", {
        body: {
          ad_account_id: pendingTopUp.ad_account_id,
          amount: pendingTopUp.amount,
          old_spend_cap: pendingTopUp.old_spend_cap,
        },
      });

      if (error) throw error;

      if (data?.verified) {
        toast.success("Top-up verified successfully! Spending cap updated.", { duration: 5000 });
        sessionStorage.removeItem("pendingTikTokTopUp");
        setPendingTopUp(null);
        setShowVerifyDialog(false);
        queryClient.invalidateQueries({ queryKey: ["client-tiktok-accounts"] });
      } else if (data?.mismatch) {
        toast.error(data.error || "Spending cap mismatch. Your account has been frozen.", { duration: 10000 });
        sessionStorage.removeItem("pendingTikTokTopUp");
        setPendingTopUp(null);
        setShowVerifyDialog(false);
      } else if (data?.error) {
        toast.error(data.error);
      }
    } catch (err: any) {
      toast.error(friendlyEdgeError(err));
    } finally {
      setVerifying(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return accounts;
    const s = search.toLowerCase();
    return accounts.filter(
      (a: any) =>
        a.account_name.toLowerCase().includes(s) ||
        a.account_id.toLowerCase().includes(s)
    );
  }, [accounts, search]);

  const walletBalance = Number(wallet?.balance ?? 0);
  const parsedAmount = parseFloat(topUpAmount) || 0;
  const insufficientFunds = parsedAmount > walletBalance;

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
                      <SpendProgressBar amountSpent={acc.amount_spent} spendCap={acc.spend_cap} balanceAfterTopup={Number((acc as any).balance_after_topup ?? 0)} platform="tiktok" />
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
            <DialogDescription>
              Wallet balance থেকে amount কেটে নেওয়া হবে এবং TikTok Billing page এ redirect হবে।
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{topUpAccount?.account_name} ({topUpAccount?.account_id})</p>
          
          <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Wallet Balance:</span>
              <span className="font-medium">${walletBalance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current Spend Cap:</span>
              <span className="font-medium">${Number(topUpAccount?.spend_cap ?? 0).toFixed(2)}</span>
            </div>
            {parsedAmount > 0 && (
              <div className="flex justify-between border-t pt-1 mt-1">
                <span className="text-muted-foreground">New Spend Cap:</span>
                <span className="font-semibold text-emerald-600">${(Number(topUpAccount?.spend_cap ?? 0) + parsedAmount).toFixed(2)}</span>
              </div>
            )}
          </div>

          <div>
            <Label>Amount (USD)</Label>
            <Input
              type="number"
              min="1"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              placeholder="Enter amount"
            />
            {insufficientFunds && (
              <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Insufficient wallet balance
              </p>
            )}
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-200">
            <p className="font-medium mb-1">⚠️ গুরুত্বপূর্ণ:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Top Up click করলে wallet থেকে amount কেটে নেবে</li>
              <li>TikTok Billing page open হবে — সেখানে exactly এই পরিমাণ limit বাড়ান</li>
              <li>CRM এ ফিরে আসলে confirm করতে হবে</li>
              <li>ভুল amount বাড়ালে account freeze হয়ে যাবে</li>
            </ol>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTopUpAccount(null)}>Cancel</Button>
            <Button
              onClick={() => topUpMutation.mutate()}
              disabled={topUpMutation.isPending || insufficientFunds || parsedAmount <= 0}
            >
              {topUpMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Top Up & Open TikTok
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verification Confirmation Dialog */}
      <AlertDialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Top-Up Confirmation
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>আপনি কি TikTok এ exactly <strong className="text-foreground">${pendingTopUp?.amount}</strong> spending limit বাড়িয়েছেন?</p>
                <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>Account:</span>
                    <span className="font-medium">{pendingTopUp?.account_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Amount:</span>
                    <span className="font-medium">${pendingTopUp?.amount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Expected New Cap:</span>
                    <span className="font-medium">${pendingTopUp?.expected_new_cap}</span>
                  </div>
                </div>
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2 text-xs text-destructive">
                  ⚠️ ভুল amount বাড়ালে আপনার account freeze হয়ে যাবে!
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleVerify(false)} disabled={verifying}>
              না, বাড়াইনি
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handleVerify(true)} disabled={verifying}>
              {verifying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              হ্যাঁ, বাড়িয়েছি — Verify করো
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
