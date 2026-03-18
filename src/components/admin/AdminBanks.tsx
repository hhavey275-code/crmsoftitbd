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
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";
import { Plus, Trash2, UserPlus, Pencil, Building2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { logSystemAction } from "@/lib/systemLog";

const emptyForm = { bank_name: "", account_name: "", account_number: "", branch: "", routing_number: "" };

export function AdminBanks() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [showAdd, setShowAdd] = useState(false);
  const [showAssign, setShowAssign] = useState<string | null>(null);
  const [editingBank, setEditingBank] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedClient, setSelectedClient] = useState("");

  const { data: banks } = useQuery({
    queryKey: ["admin-banks"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("bank_accounts").select("*").order("created_at", { ascending: false });
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
      const { error } = await (supabase as any).from("bank_accounts").insert(form);
      if (error) throw error;
    },
    onSuccess: () => { logSystemAction("Bank Added", `${form.bank_name} — ${form.account_number}`); toast.success("Bank added!"); queryClient.invalidateQueries({ queryKey: ["admin-banks"] }); setShowAdd(false); setForm(emptyForm); },
    onError: (e: any) => toast.error(e.message),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("bank_accounts").update({
        bank_name: form.bank_name, account_name: form.account_name, account_number: form.account_number, branch: form.branch, routing_number: form.routing_number,
      }).eq("id", editingBank.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Bank updated!"); queryClient.invalidateQueries({ queryKey: ["admin-banks"] }); setEditingBank(null); setForm(emptyForm); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("bank_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Bank deleted"); queryClient.invalidateQueries({ queryKey: ["admin-banks"] }); },
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

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">Bank Accounts</h1>
        <Button size={isMobile ? "sm" : "default"} onClick={() => setShowAdd(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Bank
        </Button>
      </div>

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
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                        setEditingBank(b);
                        setForm({ bank_name: b.bank_name, account_name: b.account_name, account_number: b.account_number, branch: b.branch || "", routing_number: b.routing_number || "" });
                      }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setShowAssign(b.id)}>
                        <UserPlus className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:text-destructive" onClick={() => deleteMutation.mutate(b.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {(!banks || banks.length === 0) && (
            <p className="text-center text-muted-foreground py-8 text-sm">No banks added yet</p>
          )}
        </div>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-lg">All Banks</CardTitle></CardHeader>
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
                        <Button size="sm" variant="ghost" onClick={() => {
                          setEditingBank(b);
                          setForm({ bank_name: b.bank_name, account_name: b.account_name, account_number: b.account_number, branch: b.branch || "", routing_number: b.routing_number || "" });
                        }}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowAssign(b.id)}><UserPlus className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => deleteMutation.mutate(b.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(!banks || banks.length === 0) && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No banks added yet</TableCell></TableRow>
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
