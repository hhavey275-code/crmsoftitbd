import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";
import { Plus, Trash2, UserPlus, Pencil, Building2, BarChart3, RotateCcw, MinusCircle } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { logSystemAction } from "@/lib/systemLog";
import { format } from "date-fns";

const emptyForm = { bank_name: "", account_name: "", account_number: "", branch: "", routing_number: "", telegram_group_id: "", seller_id: "" };

function BankStatsDialog({ bankId, bankName, open, onClose }: { bankId: string; bankName: string; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawNote, setWithdrawNote] = useState("");
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);

  const { data: stats, isLoading } = useQuery({
    queryKey: ["bank-stats", bankId],
    enabled: open && !!bankId,
    queryFn: async () => {
      const [{ data: topups }, { data: withdrawals }] = await Promise.all([
        supabase.from("top_up_requests").select("bdt_amount, amount, created_at").eq("bank_account_id", bankId).eq("status", "approved").order("created_at", { ascending: false }),
        (supabase as any).from("transactions").select("amount, created_at, description").eq("bank_account_id", bankId).eq("type", "withdraw").order("created_at", { ascending: false }),
      ]);

      const topupRows = topups ?? [];
      const withdrawRows = (withdrawals as any[]) ?? [];
      const totalBdt = topupRows.reduce((s, r: any) => s + Number(r.bdt_amount || 0), 0);
      const totalUsd = topupRows.reduce((s, r: any) => s + Number(r.amount || 0), 0);
      const totalWithdrawn = withdrawRows.reduce((s, r: any) => s + Number(r.amount || 0), 0);

      // Group by day (topups)
      const dayMap: Record<string, { bdt: number; usd: number; count: number; withdrawn: number }> = {};
      for (const r of topupRows) {
        const day = format(new Date((r as any).created_at), "yyyy-MM-dd");
        if (!dayMap[day]) dayMap[day] = { bdt: 0, usd: 0, count: 0, withdrawn: 0 };
        dayMap[day].bdt += Number((r as any).bdt_amount || 0);
        dayMap[day].usd += Number((r as any).amount || 0);
        dayMap[day].count += 1;
      }
      for (const w of withdrawRows) {
        const day = format(new Date(w.created_at), "yyyy-MM-dd");
        if (!dayMap[day]) dayMap[day] = { bdt: 0, usd: 0, count: 0, withdrawn: 0 };
        dayMap[day].withdrawn += Number(w.amount || 0);
      }

      const daily = Object.entries(dayMap)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, v]) => ({ date, ...v }));

      return { totalBdt, totalUsd, totalCount: topupRows.length, totalWithdrawn, netBdt: totalBdt - totalWithdrawn, daily, withdrawals: withdrawRows };
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const amt = Number(withdrawAmount);
      if (!amt || amt <= 0) throw new Error("Enter a valid amount");
      const { error } = await (supabase as any).from("transactions").insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        type: "withdraw",
        amount: amt,
        bank_account_id: bankId,
        description: withdrawNote || `Bank withdraw from ${bankName}`,
        processed_by: "admin",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Withdraw recorded!");
      queryClient.invalidateQueries({ queryKey: ["bank-stats", bankId] });
      setWithdrawAmount("");
      setWithdrawNote("");
      setShowWithdrawForm(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            {bankName} — Stats
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground animate-pulse">Loading stats...</div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="border">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Received (BDT)</p>
                  <p className="text-lg font-bold text-primary">৳{stats?.totalBdt?.toLocaleString() ?? 0}</p>
                </CardContent>
              </Card>
              <Card className="border">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Withdrawn</p>
                  <p className="text-lg font-bold text-red-500">৳{stats?.totalWithdrawn?.toLocaleString() ?? 0}</p>
                </CardContent>
              </Card>
              <Card className="border">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Net Balance (BDT)</p>
                  <p className="text-lg font-bold text-green-600">৳{stats?.netBdt?.toLocaleString() ?? 0}</p>
                </CardContent>
              </Card>
              <Card className="border">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total USD / Txns</p>
                  <p className="text-lg font-bold">${stats?.totalUsd?.toLocaleString() ?? 0} <span className="text-xs text-muted-foreground">({stats?.totalCount ?? 0})</span></p>
                </CardContent>
              </Card>
            </div>

            {/* Record Withdraw */}
            <div>
              {!showWithdrawForm ? (
                <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => setShowWithdrawForm(true)}>
                  <MinusCircle className="h-4 w-4" /> Record Withdraw
                </Button>
              ) : (
                <div className="space-y-2 p-3 border rounded-md bg-muted/30">
                  <Label className="text-xs">Withdraw Amount (BDT)</Label>
                  <Input type="number" placeholder="Amount" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} />
                  <Input placeholder="Note (optional)" value={withdrawNote} onChange={e => setWithdrawNote(e.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setShowWithdrawForm(false)}>Cancel</Button>
                    <Button size="sm" onClick={() => withdrawMutation.mutate()} disabled={withdrawMutation.isPending}>
                      {withdrawMutation.isPending ? "Saving..." : "Save Withdraw"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Day-by-day */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Day-by-Day Breakdown</h3>
              {stats?.daily && stats.daily.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs text-right">Received</TableHead>
                      <TableHead className="text-xs text-right">Withdrawn</TableHead>
                      <TableHead className="text-xs text-right">#</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.daily.map((d) => (
                      <TableRow key={d.date}>
                        <TableCell className="text-xs">{format(new Date(d.date), "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-xs text-right font-mono">৳{d.bdt.toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-right font-mono text-red-500">{d.withdrawn > 0 ? `৳${d.withdrawn.toLocaleString()}` : "—"}</TableCell>
                        <TableCell className="text-xs text-right">{d.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No transactions yet</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AdminBanks() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [showAdd, setShowAdd] = useState(false);
  const [showAssign, setShowAssign] = useState<string | null>(null);
  const [editingBank, setEditingBank] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedClient, setSelectedClient] = useState("");
  const [statsBank, setStatsBank] = useState<{ id: string; name: string } | null>(null);
  const [bankTab, setBankTab] = useState("active");

  const { data: banks } = useQuery({
    queryKey: ["admin-banks", bankTab],
    queryFn: async () => {
      const { data } = await (supabase as any).from("bank_accounts").select("*").eq("status", bankTab).order("created_at", { ascending: false });
      return (data as any[]) ?? [];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*");
      return (data as any[]) ?? [];
    },
  });

  const { data: clientBanks } = useQuery({
    queryKey: ["admin-client-banks"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("client_banks").select("*, bank_accounts(bank_name), profiles!inner(full_name, email)");
      return (data as any[]) ?? [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const insertData: any = { bank_name: form.bank_name, account_name: form.account_name, account_number: form.account_number, branch: form.branch, routing_number: form.routing_number };
      if (form.telegram_group_id) insertData.telegram_group_id = form.telegram_group_id;
      if (form.seller_id) insertData.seller_id = form.seller_id;
      const { error } = await (supabase as any).from("bank_accounts").insert(insertData);
      if (error) throw error;
    },
    onSuccess: () => { logSystemAction("Bank Added", `${form.bank_name} — ${form.account_number}`); toast.success("Bank added!"); queryClient.invalidateQueries({ queryKey: ["admin-banks"] }); setShowAdd(false); setForm(emptyForm); },
    onError: (e: any) => toast.error(e.message),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const updateData: any = {
        bank_name: form.bank_name, account_name: form.account_name, account_number: form.account_number, branch: form.branch, routing_number: form.routing_number,
        telegram_group_id: form.telegram_group_id || null,
        seller_id: form.seller_id || null,
      };
      const { error } = await (supabase as any).from("bank_accounts").update(updateData).eq("id", editingBank.id);
      if (error) throw error;
    },
    onSuccess: () => { logSystemAction("Bank Updated", `${form.bank_name} — ${form.account_number}`); toast.success("Bank updated!"); queryClient.invalidateQueries({ queryKey: ["admin-banks"] }); setEditingBank(null); setForm(emptyForm); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("bank_accounts").update({ status: "inactive" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { logSystemAction("Bank Deactivated", "Bank set to inactive"); toast.success("Bank deactivated"); queryClient.invalidateQueries({ queryKey: ["admin-banks"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("bank_accounts").update({ status: "active" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { logSystemAction("Bank Reactivated", "Bank set to active"); toast.success("Bank reactivated!"); queryClient.invalidateQueries({ queryKey: ["admin-banks"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("client_banks").insert({ user_id: selectedClient, bank_account_id: showAssign });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Bank assigned to client!"); queryClient.invalidateQueries({ queryKey: ["admin-client-banks"] }); setShowAssign(null); setSelectedClient(""); },
    onError: (e: any) => toast.error(e.message),
  });

  const unassignMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("client_banks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Assignment removed"); queryClient.invalidateQueries({ queryKey: ["admin-client-banks"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const isActive = bankTab === "active";

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">Bank Accounts</h1>
        <Button size={isMobile ? "sm" : "default"} onClick={() => setShowAdd(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Bank
        </Button>
      </div>

      {/* Active / Inactive Toggle */}
      <Tabs value={bankTab} onValueChange={setBankTab}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="inactive">Inactive</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* All Banks */}
      {isMobile ? (
        <div className="space-y-2.5">
          {banks?.map((b: any) => (
            <Card key={b.id} className="border border-border/60 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold truncate">{b.bank_name}</p>
                      <StatusBadge status={b.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">{b.account_name}</p>
                    <p className="text-xs font-mono text-muted-foreground">{b.account_number}</p>
                    {b.branch && <p className="text-[11px] text-muted-foreground">Branch: {b.branch}</p>}
                    <div className="flex items-center gap-1.5 mt-2">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setStatsBank({ id: b.id, name: b.bank_name })}>
                        <BarChart3 className="h-3.5 w-3.5" />
                      </Button>
                      {isActive ? (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                            setEditingBank(b);
                            setForm({ bank_name: b.bank_name, account_name: b.account_name, account_number: b.account_number, branch: b.branch || "", routing_number: b.routing_number || "", telegram_group_id: b.telegram_group_id || "", seller_id: b.seller_id || "" });
                          }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setShowAssign(b.id)}>
                            <UserPlus className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:text-destructive" onClick={() => deleteMutation.mutate(b.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-green-600" onClick={() => reactivateMutation.mutate(b.id)}>
                          <RotateCcw className="h-3.5 w-3.5" /> Reactivate
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {(!banks || banks.length === 0) && (
            <p className="text-center text-muted-foreground py-8 text-sm">{isActive ? "No active banks" : "No inactive banks"}</p>
          )}
        </div>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-lg">{isActive ? "Active" : "Inactive"} Banks</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bank Name</TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Account Number</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {banks?.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.bank_name}</TableCell>
                    <TableCell>{b.account_name}</TableCell>
                    <TableCell>{b.account_number}</TableCell>
                    <TableCell>{b.branch || "—"}</TableCell>
                    <TableCell><StatusBadge status={b.status} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setStatsBank({ id: b.id, name: b.bank_name })} title="View Stats">
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                        {isActive ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => {
                              setEditingBank(b);
                              setForm({ bank_name: b.bank_name, account_name: b.account_name, account_number: b.account_number, branch: b.branch || "", routing_number: b.routing_number || "", telegram_group_id: b.telegram_group_id || "", seller_id: b.seller_id || "" });
                            }}><Pencil className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setShowAssign(b.id)}><UserPlus className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => deleteMutation.mutate(b.id)}><Trash2 className="h-4 w-4" /></Button>
                          </>
                        ) : (
                          <Button size="sm" variant="ghost" className="text-green-600 gap-1" onClick={() => reactivateMutation.mutate(b.id)}>
                            <RotateCcw className="h-4 w-4" /> Reactivate
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(!banks || banks.length === 0) && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">{isActive ? "No active banks" : "No inactive banks"}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Client Bank Assignments */}
      {isMobile ? (
        <div>
          <h2 className="text-base font-semibold mb-2">Client Bank Assignments</h2>
          <div className="space-y-2">
            {clientBanks?.map((cb: any) => (
              <Card key={cb.id} className="border border-border/60 shadow-sm">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{cb.profiles?.full_name || cb.profiles?.email}</p>
                    <p className="text-xs text-muted-foreground">{cb.bank_accounts?.bank_name}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="hover:text-destructive h-7 w-7 p-0" onClick={() => unassignMutation.mutate(cb.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </CardContent>
              </Card>
            ))}
            {(!clientBanks || clientBanks.length === 0) && (
              <p className="text-center text-muted-foreground py-4 text-sm">No assignments</p>
            )}
          </div>
        </div>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-lg">Client Bank Assignments</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientBanks?.map((cb: any) => (
                  <TableRow key={cb.id}>
                    <TableCell className="font-medium">{cb.profiles?.full_name || cb.profiles?.email}</TableCell>
                    <TableCell>{cb.bank_accounts?.bank_name}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => unassignMutation.mutate(cb.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!clientBanks || clientBanks.length === 0) && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No assignments</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Bank Stats Dialog */}
      {statsBank && (
        <BankStatsDialog bankId={statsBank.id} bankName={statsBank.name} open={!!statsBank} onClose={() => setStatsBank(null)} />
      )}

      {/* Add Bank Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Bank Account</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Bank Name</Label><Input value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} /></div>
            <div><Label>Account Name</Label><Input value={form.account_name} onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))} /></div>
            <div><Label>Account Number</Label><Input value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} /></div>
            <div><Label>Branch</Label><Input value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))} /></div>
            <div><Label>Routing Number</Label><Input value={form.routing_number} onChange={e => setForm(f => ({ ...f, routing_number: e.target.value }))} /></div>
            <div><Label>Telegram Group ID <span className="text-xs text-muted-foreground">(for proof forwarding)</span></Label><Input placeholder="-100xxxxxxxxxx" value={form.telegram_group_id} onChange={e => setForm(f => ({ ...f, telegram_group_id: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={!form.bank_name || !form.account_name || !form.account_number || addMutation.isPending}>
              {addMutation.isPending ? "Adding..." : "Add Bank"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Bank Dialog */}
      <Dialog open={!!showAssign} onOpenChange={() => setShowAssign(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Bank to Client</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Select Client</Label>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger><SelectValue placeholder="Choose a client" /></SelectTrigger>
              <SelectContent>
                {profiles?.map((p: any) => (
                  <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(null)}>Cancel</Button>
            <Button onClick={() => assignMutation.mutate()} disabled={!selectedClient || assignMutation.isPending}>
              {assignMutation.isPending ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Bank Dialog */}
      <Dialog open={!!editingBank} onOpenChange={(open) => { if (!open) { setEditingBank(null); setForm(emptyForm); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Bank Account</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Bank Name</Label><Input value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} /></div>
            <div><Label>Account Name</Label><Input value={form.account_name} onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))} /></div>
            <div><Label>Account Number</Label><Input value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} /></div>
            <div><Label>Branch</Label><Input value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))} /></div>
            <div><Label>Routing Number</Label><Input value={form.routing_number} onChange={e => setForm(f => ({ ...f, routing_number: e.target.value }))} /></div>
            <div><Label>Telegram Group ID <span className="text-xs text-muted-foreground">(for proof forwarding)</span></Label><Input placeholder="-100xxxxxxxxxx" value={form.telegram_group_id} onChange={e => setForm(f => ({ ...f, telegram_group_id: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingBank(null); setForm(emptyForm); }}>Cancel</Button>
            <Button onClick={() => editMutation.mutate()} disabled={!form.bank_name || !form.account_name || !form.account_number || editMutation.isPending}>
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
