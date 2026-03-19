import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { SpendProgressBar } from "@/components/SpendProgressBar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowUpCircle, RefreshCw, Plus, Search, Loader2 } from "lucide-react";
import { friendlyEdgeError } from "@/lib/utils";
import { logSystemAction } from "@/lib/systemLog";

export function AdminTikTokAccounts() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [topUpAccount, setTopUpAccount] = useState<any>(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [showAddBc, setShowAddBc] = useState(false);
  const [bcName, setBcName] = useState("");
  const [bcId, setBcId] = useState("");
  const [bcToken, setBcToken] = useState("");
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Fetch TikTok ad accounts
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["tiktok-ad-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_accounts")
        .select("*, business_managers(name)")
        .eq("platform", "tiktok")
        .order("account_name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch TikTok BMs
  const { data: bms = [] } = useQuery({
    queryKey: ["tiktok-bms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_managers")
        .select("*")
        .eq("platform", "tiktok")
        .eq("status", "active");
      if (error) throw error;
      return data;
    },
  });

  // Add TikTok BC
  const addBcMutation = useMutation({
    mutationFn: async () => {
      if (!bcName || !bcId || !bcToken) throw new Error("All fields required");
      const { error } = await supabase.from("business_managers").insert({
        name: bcName,
        bm_id: bcId,
        access_token: bcToken,
        platform: "tiktok",
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("TikTok Business Center added");
      queryClient.invalidateQueries({ queryKey: ["tiktok-bms"] });
      setShowAddBc(false);
      setBcName("");
      setBcId("");
      setBcToken("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Sync TikTok accounts
  const syncMutation = useMutation({
    mutationFn: async (bmId: string) => {
      setSyncingId(bmId);
      const { data, error } = await supabase.functions.invoke("tiktok-sync", {
        body: { business_manager_id: bmId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Synced ${data.synced_count ?? 0} TikTok accounts`);
      queryClient.invalidateQueries({ queryKey: ["tiktok-ad-accounts"] });
      setSyncingId(null);
    },
    onError: (err: any) => {
      toast.error(friendlyEdgeError(err));
      setSyncingId(null);
    },
  });

  // Top up TikTok account
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
      toast.success(`Top up successful: $${topUpAmount}`);
      setTopUpAccount(null);
      setTopUpAmount("");
      queryClient.invalidateQueries({ queryKey: ["tiktok-ad-accounts"] });
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
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold text-foreground">TikTok Ad Accounts</h2>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowAddBc(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add BC
          </Button>
          {bms.map((bm: any) => (
            <Button
              key={bm.id}
              size="sm"
              variant="outline"
              disabled={syncingId === bm.id}
              onClick={() => syncMutation.mutate(bm.id)}
            >
              {syncingId === bm.id ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Sync {bm.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search TikTok accounts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account Name</TableHead>
                <TableHead>Account ID</TableHead>
                <TableHead>BC</TableHead>
                <TableHead>Spend Cap</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No TikTok ad accounts found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((acc: any) => (
                  <TableRow key={acc.id}>
                    <TableCell className="font-medium">{acc.account_name}</TableCell>
                    <TableCell className="text-muted-foreground">{acc.account_id}</TableCell>
                    <TableCell>{(acc as any).business_managers?.name ?? "—"}</TableCell>
                    <TableCell>
                      <SpendProgressBar amountSpent={acc.amount_spent} spendCap={acc.spend_cap} />
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

      {/* Add BC Dialog */}
      <Dialog open={showAddBc} onOpenChange={setShowAddBc}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add TikTok Business Center</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>BC Name</Label>
              <Input value={bcName} onChange={(e) => setBcName(e.target.value)} placeholder="My TikTok BC" />
            </div>
            <div>
              <Label>BC ID</Label>
              <Input value={bcId} onChange={(e) => setBcId(e.target.value)} placeholder="e.g. 7012345678901234567" />
            </div>
            <div>
              <Label>Access Token</Label>
              <Input value={bcToken} onChange={(e) => setBcToken(e.target.value)} placeholder="TikTok API access token" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBc(false)}>Cancel</Button>
            <Button onClick={() => addBcMutation.mutate()} disabled={addBcMutation.isPending}>
              {addBcMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
