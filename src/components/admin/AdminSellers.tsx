import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { DollarSign, Banknote, ImageIcon, UserCog, ArrowLeftRight } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { logSystemAction } from "@/lib/systemLog";

export function AdminSellers() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [showConvert, setShowConvert] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedSeller, setSelectedSeller] = useState<any>(null);
  const [entryType, setEntryType] = useState<"usdt_received" | "bdt_payment">("usdt_received");
  const [entryForm, setEntryForm] = useState({ usdt_amount: "", bdt_amount: "", rate: "", description: "" });
  const [showEntryDialog, setShowEntryDialog] = useState(false);
  const [proofUrl, setProofUrl] = useState<string | null>(null);

  // Fetch all sellers (users with seller role)
  const { data: sellers } = useQuery({
    queryKey: ["admin-sellers"],
    queryFn: async () => {
      const { data: roles } = await (supabase as any).from("user_roles").select("user_id").eq("role", "seller");
      if (!roles?.length) return [];
      const sellerIds = roles.map((r: any) => r.user_id);
      const { data: profiles } = await supabase.from("profiles").select("*").in("user_id", sellerIds);
      return (profiles as any[]) ?? [];
    },
  });

  // Fetch all clients (for convert dialog)
  const { data: clients } = useQuery({
    queryKey: ["admin-clients-for-convert"],
    queryFn: async () => {
      const { data: roles } = await (supabase as any).from("user_roles").select("user_id").eq("role", "client");
      if (!roles?.length) return [];
      const clientIds = roles.map((r: any) => r.user_id);
      const { data: profiles } = await supabase.from("profiles").select("*").in("user_id", clientIds).eq("status", "approved");
      return (profiles as any[]) ?? [];
    },
  });

  // Fetch transactions for selected seller
  const { data: sellerTxns } = useQuery({
    queryKey: ["admin-seller-txns", selectedSeller?.user_id],
    enabled: !!selectedSeller,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("seller_transactions")
        .select("*")
        .eq("seller_id", selectedSeller.user_id)
        .order("created_at", { ascending: false });
      return (data as any[]) ?? [];
    },
  });

  // Fetch assigned banks for selected seller
  const { data: sellerBanks } = useQuery({
    queryKey: ["admin-seller-banks", selectedSeller?.user_id],
    enabled: !!selectedSeller,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("bank_accounts")
        .select("id, bank_name, account_number")
        .eq("seller_id", selectedSeller.user_id)
        .eq("status", "active");
      return (data as any[]) ?? [];
    },
  });

  // Calculate totals for selected seller
  const sellerTotals = sellerTxns?.reduce(
    (acc: any, t: any) => {
      if (t.type === "bdt_payment") acc.totalBdtPaid += Number(t.bdt_amount || 0);
      if (t.type === "usdt_received") {
        acc.totalUsdt += Number(t.usdt_amount || 0);
        acc.totalConvertedBdt += Number(t.usdt_amount || 0) * Number(t.rate || 0);
      }
      if (t.type === "client_topup") acc.totalClientBdt += Number(t.bdt_amount || 0);
      return acc;
    },
    { totalBdtPaid: 0, totalUsdt: 0, totalConvertedBdt: 0, totalClientBdt: 0 }
  ) ?? { totalBdtPaid: 0, totalUsdt: 0, totalConvertedBdt: 0, totalClientBdt: 0 };

  const dueAdvance = sellerTotals.totalBdtPaid + sellerTotals.totalClientBdt - sellerTotals.totalConvertedBdt;

  // Convert client to seller
  const convertMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClientId) throw new Error("Select a client");
      const { data, error } = await supabase
        .from("user_roles")
        .update({ role: "seller" as any })
        .eq("user_id", selectedClientId)
        .eq("role", "client" as any)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Client role not found for this user");
    },
    onSuccess: () => {
      const client = clients?.find((c: any) => c.user_id === selectedClientId);
      toast.success(`${client?.full_name || client?.email} converted to seller!`);
      logSystemAction("Client Converted to Seller", `${client?.full_name || client?.email}`, user?.id, user?.email);
      queryClient.invalidateQueries({ queryKey: ["admin-sellers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-clients-for-convert"] });
      setShowConvert(false);
      setSelectedClientId("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Revert seller back to client
  const revertMutation = useMutation({
    mutationFn: async (sellerId: string) => {
      const { error } = await (supabase as any)
        .from("user_roles")
        .update({ role: "client" })
        .eq("user_id", sellerId);
      if (error) throw error;
      return sellerId;
    },
    onSuccess: (_data, sellerId) => {
      const seller = sellers?.find((s: any) => s.user_id === sellerId);
      toast.success(`${seller?.full_name || seller?.email} reverted to client!`);
      logSystemAction("Seller Reverted to Client", `${seller?.full_name || seller?.email}`, user?.id, user?.email);
      if (selectedSeller?.user_id === sellerId) setSelectedSeller(null);
      queryClient.invalidateQueries({ queryKey: ["admin-sellers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-clients-for-convert"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Add entry (USDT received or BDT payment)
  const addEntryMutation = useMutation({
    mutationFn: async () => {
      const entry: any = {
        seller_id: selectedSeller.user_id,
        type: entryType,
        description: entryForm.description || undefined,
      };
      if (entryType === "usdt_received") {
        entry.usdt_amount = Number(entryForm.usdt_amount);
        entry.rate = Number(entryForm.rate);
        entry.bdt_amount = 0;
        if (!entry.usdt_amount || !entry.rate) throw new Error("Enter USDT amount and rate");
      } else {
        entry.bdt_amount = Number(entryForm.bdt_amount);
        entry.usdt_amount = 0;
        entry.rate = 0;
        if (!entry.bdt_amount) throw new Error("Enter BDT amount");
      }
      const { error } = await (supabase as any).from("seller_transactions").insert(entry);
      if (error) throw error;
    },
    onSuccess: () => {
      const label = entryType === "usdt_received" ? "USDT Received" : "BDT Payment";
      toast.success(`${label} recorded!`);
      logSystemAction(`Seller ${label}`, `Seller: ${selectedSeller.full_name || selectedSeller.email}`, user?.id, user?.email);
      queryClient.invalidateQueries({ queryKey: ["admin-seller-txns", selectedSeller.user_id] });
      setShowEntryDialog(false);
      setEntryForm({ usdt_amount: "", bdt_amount: "", rate: "", description: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">Sellers</h1>
        <Button size={isMobile ? "sm" : "default"} onClick={() => setShowConvert(true)}>
          <UserCog className="mr-1.5 h-4 w-4" /> Convert Client to Seller
        </Button>
      </div>

      {/* Sellers List */}
      <div className={cn("grid gap-3", isMobile ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-3")}>
        {sellers?.map((s: any) => (
          <Card
            key={s.user_id}
            className={cn("cursor-pointer border transition-all hover:shadow-md", selectedSeller?.user_id === s.user_id && "ring-2 ring-primary")}
            onClick={() => setSelectedSeller(s)}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold truncate">{s.full_name || s.email}</p>
                <p className="text-xs text-muted-foreground truncate">{s.email}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive shrink-0"
                onClick={(e) => { e.stopPropagation(); revertMutation.mutate(s.user_id); }}
                title="Revert to Client"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
        {(!sellers || sellers.length === 0) && (
          <p className="text-muted-foreground text-sm col-span-full text-center py-8">No sellers yet. Convert a client to seller to get started.</p>
        )}
      </div>

      {/* Selected Seller Detail */}
      {selectedSeller && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold">{selectedSeller.full_name || selectedSeller.email} — Ledger</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { setEntryType("usdt_received"); setShowEntryDialog(true); }}>
                <DollarSign className="h-4 w-4 mr-1" /> Record USDT
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEntryType("bdt_payment"); setShowEntryDialog(true); }}>
                <Banknote className="h-4 w-4 mr-1" /> Record BDT Payment
              </Button>
            </div>
          </div>

          {/* Summary */}
          <div className={cn("grid gap-3", isMobile ? "grid-cols-2" : "grid-cols-4")}>
            <Card className="border">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Due / Advance</p>
                <p className={cn("text-lg font-bold", dueAdvance >= 0 ? "text-green-600" : "text-red-500")}>
                  {dueAdvance >= 0 ? "+" : ""}৳{Math.abs(dueAdvance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card className="border">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">BDT Received (Total)</p>
                <p className="text-lg font-bold text-primary">৳{(sellerTotals.totalBdtPaid + sellerTotals.totalClientBdt).toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="border">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">USDT Given</p>
                <p className="text-lg font-bold">${sellerTotals.totalUsdt.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="border">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">USDT Value (BDT)</p>
                <p className="text-lg font-bold">৳{sellerTotals.totalConvertedBdt.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          {/* Assigned Banks */}
          {sellerBanks && sellerBanks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground self-center">Assigned Banks:</span>
              {sellerBanks.map((b: any) => (
                <span key={b.id} className="text-xs bg-muted px-2 py-1 rounded-md">{b.bank_name} ****{b.account_number?.slice(-4)}</span>
              ))}
            </div>
          )}

          {/* Transaction Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs text-right">Payment (BDT)</TableHead>
                      <TableHead className="text-xs text-right">USDT</TableHead>
                      <TableHead className="text-xs text-right">Rate</TableHead>
                      <TableHead className="text-xs text-right">Converted BDT</TableHead>
                      <TableHead className="text-xs">Note</TableHead>
                      <TableHead className="text-xs">Proof</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sellerTxns?.map((t: any) => {
                      const convertedBdt = Number(t.usdt_amount || 0) * Number(t.rate || 0);
                      const typeLabel = t.type === "usdt_received" ? "USDT Received" : t.type === "bdt_payment" ? "BDT Payment" : "Client Top-Up";
                      const typeColor = t.type === "usdt_received" ? "text-blue-600" : t.type === "bdt_payment" ? "text-green-600" : "text-orange-500";
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="text-xs whitespace-nowrap">{format(new Date(t.created_at), "MMM d, yyyy")}</TableCell>
                          <TableCell className={cn("text-xs font-medium", typeColor)}>{typeLabel}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{Number(t.bdt_amount) > 0 ? `৳${Number(t.bdt_amount).toLocaleString()}` : "—"}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{Number(t.usdt_amount) > 0 ? `$${Number(t.usdt_amount).toLocaleString()}` : "—"}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{Number(t.rate) > 0 ? t.rate : "—"}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{convertedBdt > 0 ? `৳${convertedBdt.toLocaleString()}` : "—"}</TableCell>
                          <TableCell className="text-xs max-w-[120px] truncate">{t.description || "—"}</TableCell>
                          <TableCell className="text-xs">
                            {t.proof_url ? (
                              <button onClick={() => setProofUrl(t.proof_url)} className="text-primary hover:underline flex items-center gap-1">
                                <ImageIcon className="h-3.5 w-3.5" /> View
                              </button>
                            ) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {(!sellerTxns || sellerTxns.length === 0) && (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No transactions</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Convert Client to Seller Dialog */}
      <Dialog open={showConvert} onOpenChange={setShowConvert}>
        <DialogContent>
          <DialogHeader><DialogTitle>Convert Client to Seller</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Select Client</Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a client..." />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map((c: any) => (
                    <SelectItem key={c.user_id} value={c.user_id}>
                      {c.full_name || c.email} — {c.email}
                    </SelectItem>
                  ))}
                  {(!clients || clients.length === 0) && (
                    <SelectItem value="_none" disabled>No approved clients available</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConvert(false)}>Cancel</Button>
            <Button onClick={() => convertMutation.mutate()} disabled={!selectedClientId || convertMutation.isPending}>
              {convertMutation.isPending ? "Converting..." : "Convert to Seller"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Entry Dialog */}
      <Dialog open={showEntryDialog} onOpenChange={setShowEntryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{entryType === "usdt_received" ? "Record USDT Received" : "Record BDT Payment"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {entryType === "usdt_received" ? (
              <>
                <div><Label>USDT Amount</Label><Input type="number" placeholder="e.g. 500" value={entryForm.usdt_amount} onChange={e => setEntryForm(f => ({ ...f, usdt_amount: e.target.value }))} /></div>
                <div><Label>Rate (BDT per USDT)</Label><Input type="number" placeholder="e.g. 125" value={entryForm.rate} onChange={e => setEntryForm(f => ({ ...f, rate: e.target.value }))} /></div>
                {entryForm.usdt_amount && entryForm.rate && (
                  <p className="text-sm text-muted-foreground">Converted: ৳{(Number(entryForm.usdt_amount) * Number(entryForm.rate)).toLocaleString()}</p>
                )}
              </>
            ) : (
              <div><Label>BDT Amount</Label><Input type="number" placeholder="e.g. 50000" value={entryForm.bdt_amount} onChange={e => setEntryForm(f => ({ ...f, bdt_amount: e.target.value }))} /></div>
            )}
            <div><Label>Note (optional)</Label><Input value={entryForm.description} onChange={e => setEntryForm(f => ({ ...f, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEntryDialog(false)}>Cancel</Button>
            <Button onClick={() => addEntryMutation.mutate()} disabled={addEntryMutation.isPending}>
              {addEntryMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Proof Dialog */}
      <Dialog open={!!proofUrl} onOpenChange={() => setProofUrl(null)}>
        <DialogContent className="max-w-lg">
          {proofUrl && <img src={proofUrl} alt="Proof" className="w-full rounded-md" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
