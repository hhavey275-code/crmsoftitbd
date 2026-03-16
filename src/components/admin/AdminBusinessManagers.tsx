import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, RefreshCw, Building2, ChevronDown, ChevronRight, Clock, AlertCircle, CheckCircle2, Search, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

interface SyncedAccount {
  account_id: string;
  account_name: string;
  business_manager_id: string;
  business_name: string | null;
  status: string;
  spend_cap: number;
  amount_spent: number;
}

export function AdminBusinessManagers() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [bmId, setBmId] = useState("");
  const [bmName, setBmName] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [expandedBm, setExpandedBm] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState<string | null>(null);

  // Selective import state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [syncedAccounts, setSyncedAccounts] = useState<SyncedAccount[]>([]);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
  const [importStatusFilter, setImportStatusFilter] = useState("all");
  const [importSearch, setImportSearch] = useState("");
  const [existingAccountIds, setExistingAccountIds] = useState<Set<string>>(new Set());

  // Edit BM state
  const [editOpen, setEditOpen] = useState(false);
  const [editBmId, setEditBmId] = useState<string | null>(null);
  const [editAccessToken, setEditAccessToken] = useState("");

  const { data: bms } = useQuery({
    queryKey: ["admin-business-managers"],
    queryFn: async () => {
      const { data } = await supabase.from("business_managers").select("*").order("created_at", { ascending: false });
      return (data as any[]) ?? [];
    },
  });

  const { data: adAccounts } = useQuery({
    queryKey: ["admin-bm-ad-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*").not("business_manager_id", "is", null);
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

  const { data: syncLogs } = useQuery({
    queryKey: ["admin-sync-logs", showLogs],
    queryFn: async () => {
      if (!showLogs) return [];
      const { data } = await (supabase as any)
        .from("sync_logs")
        .select("*")
        .eq("business_manager_id", showLogs)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data as any[]) ?? [];
    },
    enabled: !!showLogs,
  });

  const addBmMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("business_managers").insert({
        bm_id: bmId,
        name: bmName,
        access_token: accessToken,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      toast.success("Business Manager connected! Syncing ad accounts...");
      queryClient.invalidateQueries({ queryKey: ["admin-business-managers"] });
      setOpen(false);
      setBmId("");
      setBmName("");
      setAccessToken("");
      if (data?.id) {
        setExpandedBm(data.id);
        syncMutation.mutate(data.id);
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  const syncMutation = useMutation({
    mutationFn: async (businessManagerId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-bm-accounts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ business_manager_id: businessManagerId }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Sync failed");
      return result;
    },
    onSuccess: async (result) => {
      const accounts: SyncedAccount[] = result.accounts ?? [];
      if (accounts.length === 0) {
        toast.info("No accounts found from Meta");
        return;
      }
      // Load existing account_ids to detect duplicates
      const { data: existing } = await supabase.from("ad_accounts").select("account_id");
      const existingIds = new Set((existing ?? []).map((a: any) => a.account_id));
      setExistingAccountIds(existingIds);

      // Only show accounts that are NOT already imported
      setSyncedAccounts(accounts);
      setSelectedImportIds(new Set());
      setImportStatusFilter("all");
      setImportSearch("");
      setImportDialogOpen(true);

      queryClient.invalidateQueries({ queryKey: ["admin-business-managers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sync-logs"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const importMutation = useMutation({
    mutationFn: async (accounts: SyncedAccount[]) => {
      const rows = accounts.map((a) => ({
        account_id: a.account_id,
        account_name: a.account_name,
        business_manager_id: a.business_manager_id,
        business_name: a.business_name,
        status: a.status,
        spend_cap: a.spend_cap,
        amount_spent: a.amount_spent,
      }));
      const { error } = await supabase.from("ad_accounts").upsert(rows, { onConflict: "account_id" });
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} account(s) imported successfully`);
      setImportDialogOpen(false);
      setSyncedAccounts([]);
      setSelectedImportIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["admin-bm-ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["billings-accounts"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleImportSelected = () => {
    const toImport = syncedAccounts.filter((a) => selectedImportIds.has(a.account_id));
    if (toImport.length === 0) {
      toast.error("No accounts selected");
      return;
    }
    importMutation.mutate(toImport);
  };

  const filteredSyncedAccounts = useMemo(() => {
    const q = importSearch.toLowerCase();
    return syncedAccounts.filter((a) => {
      if (importStatusFilter !== "all" && a.status !== importStatusFilter) return false;
      if (q && !a.account_name.toLowerCase().includes(q) && !a.account_id.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [syncedAccounts, importStatusFilter, importSearch]);

  const newAccountsCount = syncedAccounts.filter((a) => !existingAccountIds.has(a.account_id)).length;
  const alreadyImportedCount = syncedAccounts.filter((a) => existingAccountIds.has(a.account_id)).length;

  const updateTokenMutation = useMutation({
    mutationFn: async ({ id, token }: { id: string; token: string }) => {
      const { error } = await supabase
        .from("business_managers")
        .update({ access_token: token })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Access token updated");
      setEditOpen(false);
      setEditBmId(null);
      setEditAccessToken("");
      queryClient.invalidateQueries({ queryKey: ["admin-business-managers"] });
    },
    onError: (err: any) => toast.error(err.message),
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
      queryClient.invalidateQueries({ queryKey: ["admin-user-ad-accounts"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const getAssignedUserId = (accountId: string) => {
    return assignments?.find((a: any) => a.ad_account_id === accountId)?.user_id ?? null;
  };

  const bmAccounts = (bmId: string) => {
    const accounts = adAccounts?.filter((a: any) => a.business_manager_id === bmId) ?? [];
    const statusOrder: Record<string, number> = { active: 0, pending: 1, disabled: 2 };
    return accounts.sort((a: any, b: any) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3));
  };

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      if (!bms || bms.length === 0) throw new Error("No Business Managers to sync");
      const { data: { session } } = await supabase.auth.getSession();
      const allSyncedAccounts: SyncedAccount[] = [];
      const results = await Promise.allSettled(
        bms.map(async (bm: any) => {
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-bm-accounts`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session?.access_token}`,
              },
              body: JSON.stringify({ business_manager_id: bm.id }),
            }
          );
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || "Sync failed");
          if (result.accounts) allSyncedAccounts.push(...result.accounts);
          return result;
        })
      );
      const succeeded = results.filter(r => r.status === "fulfilled").length;
      return { succeeded, total: bms.length, accounts: allSyncedAccounts };
    },
    onSuccess: async (result) => {
      toast.success(`Synced ${result.succeeded} of ${result.total} Business Managers`);
      if (result.accounts.length > 0) {
        const { data: existing } = await supabase.from("ad_accounts").select("account_id");
        const existingIds = new Set((existing ?? []).map((a: any) => a.account_id));
        setExistingAccountIds(existingIds);
        setSyncedAccounts(result.accounts);
        setSelectedImportIds(new Set());
        setImportStatusFilter("all");
        setImportSearch("");
        setImportDialogOpen(true);
      }
      queryClient.invalidateQueries({ queryKey: ["admin-business-managers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sync-logs"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleImportSelect = (accountId: string) => {
    setSelectedImportIds((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  const toggleSelectAllImport = () => {
    const importable = filteredSyncedAccounts.filter((a) => !existingAccountIds.has(a.account_id));
    const allSelected = importable.every((a) => selectedImportIds.has(a.account_id));
    if (allSelected) {
      setSelectedImportIds((prev) => {
        const next = new Set(prev);
        importable.forEach((a) => next.delete(a.account_id));
        return next;
      });
    } else {
      setSelectedImportIds((prev) => {
        const next = new Set(prev);
        importable.forEach((a) => next.add(a.account_id));
        return next;
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Business Managers</h1>
        <div className="flex items-center gap-2">
          {bms && bms.length > 0 && (
            <Button
              variant="outline"
              onClick={() => syncAllMutation.mutate()}
              disabled={syncAllMutation.isPending}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncAllMutation.isPending ? "animate-spin" : ""}`} />
              {syncAllMutation.isPending ? "Syncing All..." : "Sync All"}
            </Button>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Connect BM</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect Business Manager</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Business Manager ID</Label>
                <Input value={bmId} onChange={(e) => setBmId(e.target.value)} placeholder="123456789012345" />
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={bmName} onChange={(e) => setBmName(e.target.value)} placeholder="My Business" />
              </div>
              <div className="space-y-2">
                <Label>Access Token</Label>
                <Input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="EAA..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => addBmMutation.mutate()} disabled={!bmId || !bmName || !accessToken || addBmMutation.isPending}>
                {addBmMutation.isPending ? "Connecting..." : "Connect"}
              </Button>
            </DialogFooter>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {bms?.map((bm: any) => (
        <Card key={bm.id}>
          <CardHeader className="cursor-pointer" onClick={() => setExpandedBm(expandedBm === bm.id ? null : bm.id)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {expandedBm === bm.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Building2 className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-lg">{bm.name}</CardTitle>
                  <div className="flex items-center gap-3 mt-0.5">
                    <p className="text-xs text-muted-foreground font-mono">ID: {bm.bm_id}</p>
                    {bm.last_synced_at && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Synced {formatDistanceToNow(new Date(bm.last_synced_at), { addSuffix: true })}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {bmAccounts(bm.id).length} account{bmAccounts(bm.id).length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={bm.status} />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditBmId(bm.id);
                    setEditAccessToken("");
                    setEditOpen(true);
                  }}
                >
                  <Pencil className="mr-1 h-3 w-3" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowLogs(showLogs === bm.id ? null : bm.id);
                  }}
                >
                  <Clock className="mr-1 h-3 w-3" />
                  Logs
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); syncMutation.mutate(bm.id); }}
                  disabled={syncMutation.isPending}
                >
                  <RefreshCw className={`mr-1 h-3 w-3 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                  Sync
                </Button>
              </div>
            </div>
          </CardHeader>

          {showLogs === bm.id && (
            <CardContent className="border-t bg-muted/30">
              <h3 className="text-sm font-semibold mb-3">Sync History</h3>
              {syncLogs && syncLogs.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {syncLogs.map((log: any) => (
                    <div key={log.id} className="flex items-center justify-between text-sm rounded-md border p-2 bg-background">
                      <div className="flex items-center gap-2">
                        {log.status === "success" ? (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        )}
                        <span>
                          {log.status === "success"
                            ? `Synced ${log.synced_count}/${log.total_count} accounts`
                            : log.error_message || "Sync failed"}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(log.created_at), "MMM d, yyyy HH:mm")}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No sync logs yet.</p>
              )}
            </CardContent>
          )}

          {expandedBm === bm.id && (
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Account ID</TableHead>
                    <TableHead>Business Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Spend Cap</TableHead>
                    <TableHead>Spent</TableHead>
                    <TableHead>Assigned To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bmAccounts(bm.id).map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.account_name}</TableCell>
                      <TableCell className="font-mono text-sm">{a.account_id}</TableCell>
                      <TableCell>{a.business_name || "—"}</TableCell>
                      <TableCell><StatusBadge status={a.status} /></TableCell>
                      <TableCell>${Number(a.spend_cap).toLocaleString()}</TableCell>
                      <TableCell>${Number(a.amount_spent).toLocaleString()}</TableCell>
                      <TableCell>
                        <Select
                          value={getAssignedUserId(a.id) || "unassigned"}
                          onValueChange={(val) => assignMutation.mutate({ accountId: a.id, userId: val === "unassigned" ? null : val })}
                        >
                          <SelectTrigger className="w-[180px]">
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
                    </TableRow>
                  ))}
                  {bmAccounts(bm.id).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No accounts imported. Click "Sync" to fetch from Meta.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      ))}

      {(!bms || bms.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Building2 className="mx-auto h-12 w-12 mb-4 opacity-30" />
            <p>No Business Managers connected yet.</p>
            <p className="text-sm mt-1">Click "Connect BM" to get started.</p>
          </CardContent>
        </Card>
      )}

      {/* Import Selection Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Select Accounts to Import</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {syncedAccounts.length} accounts found · {newAccountsCount} new · {alreadyImportedCount} already imported
            </p>
          </DialogHeader>
          <div className="flex items-center gap-2 mt-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search accounts..."
                value={importSearch}
                onChange={(e) => setImportSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={importStatusFilter} onValueChange={setImportStatusFilter}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 overflow-y-auto mt-2 border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={
                        filteredSyncedAccounts.filter((a) => !existingAccountIds.has(a.account_id)).length > 0 &&
                        filteredSyncedAccounts
                          .filter((a) => !existingAccountIds.has(a.account_id))
                          .every((a) => selectedImportIds.has(a.account_id))
                      }
                      onCheckedChange={toggleSelectAllImport}
                    />
                  </TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Account ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Spend Cap</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSyncedAccounts.map((a) => {
                  const alreadyExists = existingAccountIds.has(a.account_id);
                  return (
                    <TableRow key={a.account_id} className={alreadyExists ? "opacity-50" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={selectedImportIds.has(a.account_id)}
                          onCheckedChange={() => toggleImportSelect(a.account_id)}
                          disabled={alreadyExists}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="text-sm">{a.account_name}</span>
                          {alreadyExists && (
                            <span className="ml-2 text-xs text-muted-foreground">(already imported)</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{a.account_id.replace(/^act_/, "")}</TableCell>
                      <TableCell><StatusBadge status={a.status} /></TableCell>
                      <TableCell>${a.spend_cap.toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })}
                {filteredSyncedAccounts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No accounts match your filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleImportSelected}
              disabled={selectedImportIds.size === 0 || importMutation.isPending}
            >
              {importMutation.isPending ? "Importing..." : `Import ${selectedImportIds.size} Account(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
