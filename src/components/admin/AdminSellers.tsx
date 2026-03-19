import { useState, useRef, useCallback, useEffect } from "react";
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
import { DollarSign, Banknote, ImageIcon, UserCog, ArrowLeftRight, Landmark, X, ScanLine, Loader2, Upload } from "lucide-react";
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
  const [showAssignBank, setShowAssignBank] = useState(false);
  const [selectedBankId, setSelectedBankId] = useState("");

  // OCR states
  const [showOcrDialog, setShowOcrDialog] = useState(false);
  const [ocrUploading, setOcrUploading] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrImageUrl, setOcrImageUrl] = useState<string | null>(null);
  const [ocrPreviewUrl, setOcrPreviewUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<{ bdt_amount: string; date: string; reference: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetOcr = () => {
    setOcrUploading(false);
    setOcrProcessing(false);
    setOcrImageUrl(null);
    setOcrPreviewUrl(null);
    setOcrResult(null);
  };

  const uploadOcrImage = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    setOcrUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `ocr-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("payment-proofs").upload(path, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("payment-proofs").getPublicUrl(path);
      const publicUrl = urlData.publicUrl;
      setOcrImageUrl(publicUrl);
      setOcrPreviewUrl(URL.createObjectURL(file));

      // Now call OCR
      setOcrUploading(false);
      setOcrProcessing(true);
      const { data, error } = await supabase.functions.invoke("ocr-seller-payment", {
        body: { image_url: publicUrl },
      });
      if (error) throw error;
      setOcrResult({
        bdt_amount: data.bdt_amount?.toString() || "",
        date: data.date || "",
        reference: data.reference || "",
      });
    } catch (e: any) {
      toast.error(e.message || "Upload/OCR failed");
      resetOcr();
    } finally {
      setOcrUploading(false);
      setOcrProcessing(false);
    }
  }, []);

  // Handle Ctrl+V paste
  useEffect(() => {
    if (!showOcrDialog) return;
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) uploadOcrImage(file);
          break;
        }
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [showOcrDialog, uploadOcrImage]);

  // Save OCR result as seller transaction
  const saveOcrMutation = useMutation({
    mutationFn: async () => {
      if (!ocrResult || !selectedSeller || !ocrImageUrl) throw new Error("Missing data");
      const bdtAmount = Number(ocrResult.bdt_amount);
      if (!bdtAmount || bdtAmount <= 0) throw new Error("Enter a valid BDT amount");
      const entry: any = {
        seller_id: selectedSeller.user_id,
        type: "bdt_payment",
        bdt_amount: bdtAmount,
        usdt_amount: 0,
        rate: 0,
        description: ocrResult.reference ? `TrxID: ${ocrResult.reference}` : undefined,
        proof_url: ocrImageUrl,
      };
      if (ocrResult.date) entry.created_at = new Date(ocrResult.date).toISOString();
      const { error } = await (supabase as any).from("seller_transactions").insert(entry);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("BDT Payment recorded from screenshot!");
      logSystemAction("OCR BDT Payment", `Seller: ${selectedSeller.full_name || selectedSeller.email}, Amount: ৳${ocrResult?.bdt_amount}`, user?.id, user?.email);
      queryClient.invalidateQueries({ queryKey: ["admin-seller-txns", selectedSeller.user_id] });
      setShowOcrDialog(false);
      resetOcr();
    },
    onError: (e: any) => toast.error(e.message),
  });

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
      const { data: profiles } = await supabase.from("profiles").select("*").in("user_id", clientIds);
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

  // Fetch unassigned active banks
  const { data: unassignedBanks } = useQuery({
    queryKey: ["unassigned-banks", selectedSeller?.user_id],
    enabled: !!selectedSeller,
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_accounts")
        .select("id, bank_name, account_number, account_name")
        .eq("status", "active")
        .is("seller_id", null);
      return (data as any[]) ?? [];
    },
  });

  // Assign bank to seller
  const assignBankMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBankId || !selectedSeller) throw new Error("Select a bank");
      const { error } = await supabase
        .from("bank_accounts")
        .update({ seller_id: selectedSeller.user_id })
        .eq("id", selectedBankId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bank assigned to seller!");
      logSystemAction("Bank Assigned to Seller", `Bank assigned to ${selectedSeller.full_name || selectedSeller.email}`, user?.id, user?.email);
      queryClient.invalidateQueries({ queryKey: ["admin-seller-banks", selectedSeller.user_id] });
      queryClient.invalidateQueries({ queryKey: ["unassigned-banks"] });
      setShowAssignBank(false);
      setSelectedBankId("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Unassign bank from seller
  const unassignBankMutation = useMutation({
    mutationFn: async (bankId: string) => {
      const { error } = await supabase
        .from("bank_accounts")
        .update({ seller_id: null })
        .eq("id", bankId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bank unassigned!");
      queryClient.invalidateQueries({ queryKey: ["admin-seller-banks", selectedSeller.user_id] });
      queryClient.invalidateQueries({ queryKey: ["unassigned-banks"] });
    },
    onError: (e: any) => toast.error(e.message),
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
      const { error } = await supabase
        .from("user_roles")
        .update({ role: "client" as any })
        .eq("user_id", sellerId)
        .eq("role", "seller" as any);
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
              <Button size="sm" variant="outline" onClick={() => { setShowAssignBank(true); setSelectedBankId(""); }}>
                <Landmark className="h-4 w-4 mr-1" /> Assign Bank
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEntryType("usdt_received"); setShowEntryDialog(true); }}>
                <DollarSign className="h-4 w-4 mr-1" /> Record USDT
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEntryType("bdt_payment"); setShowEntryDialog(true); }}>
                <Banknote className="h-4 w-4 mr-1" /> Record BDT Payment
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowOcrDialog(true); resetOcr(); }}>
                <ScanLine className="h-4 w-4 mr-1" /> OCR BDT Payment
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
                <span key={b.id} className="text-xs bg-muted px-2 py-1 rounded-md inline-flex items-center gap-1">
                  {b.bank_name} ****{b.account_number?.slice(-4)}
                  <button onClick={() => unassignBankMutation.mutate(b.id)} className="hover:text-destructive ml-0.5" title="Unassign">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Transaction Table — Google Sheets style */}
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] font-mono border-collapse" style={{ fontFeatureSettings: '"tnum", "ss01"', letterSpacing: '0.01em' }}>
                  <thead>
                    <tr className="bg-muted/60">
                      <th className="border border-border px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Date</th>
                      <th className="border border-border px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Type</th>
                      <th className="border border-border px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap">Payment (BDT)</th>
                      <th className="border border-border px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap">USDT</th>
                      <th className="border border-border px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap">Rate</th>
                      <th className="border border-border px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap">Converted BDT</th>
                      <th className="border border-border px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Note</th>
                      <th className="border border-border px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Proof</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sellerTxns?.map((t: any) => {
                      const convertedBdt = Number(t.usdt_amount || 0) * Number(t.rate || 0);
                      const typeLabel = t.type === "usdt_received" ? "USDT Received" : t.type === "bdt_payment" ? "BDT Payment" : "Client Top-Up";
                      const typeColor = t.type === "usdt_received" ? "text-blue-600" : t.type === "bdt_payment" ? "text-green-600" : "text-orange-500";
                      return (
                        <tr key={t.id} className="hover:bg-muted/30">
                          <td className="border border-border px-3 py-1.5 whitespace-nowrap">{format(new Date(t.created_at), "MMM d, yyyy")}</td>
                          <td className={cn("border border-border px-3 py-1.5 font-medium", typeColor)}>{typeLabel}</td>
                          <td className="border border-border px-3 py-1.5 text-right">{Number(t.bdt_amount) > 0 ? `৳${Number(t.bdt_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}</td>
                          <td className="border border-border px-3 py-1.5 text-right">{Number(t.usdt_amount) > 0 ? `$${Number(t.usdt_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}</td>
                          <td className="border border-border px-3 py-1.5 text-right">{Number(t.rate) > 0 ? Number(t.rate).toFixed(1) : "—"}</td>
                          <td className="border border-border px-3 py-1.5 text-right">{convertedBdt > 0 ? `৳${convertedBdt.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}</td>
                          <td className="border border-border px-3 py-1.5 max-w-[140px] truncate font-sans">{t.description || "—"}</td>
                          <td className="border border-border px-3 py-1.5 font-sans">
                            {t.proof_url ? (
                              <button onClick={() => setProofUrl(t.proof_url)} className="text-primary hover:underline flex items-center gap-1">
                                <ImageIcon className="h-3.5 w-3.5" /> View
                              </button>
                            ) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {(!sellerTxns || sellerTxns.length === 0) && (
                      <tr><td colSpan={8} className="border border-border text-center text-muted-foreground py-8">No transactions</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
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

      {/* OCR BDT Payment Dialog */}
      <Dialog open={showOcrDialog} onOpenChange={(v) => { setShowOcrDialog(v); if (!v) resetOcr(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>OCR BDT Payment</DialogTitle></DialogHeader>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadOcrImage(f);
              e.target.value = "";
            }}
          />

          {!ocrPreviewUrl && !ocrUploading && (
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Click to upload or <strong>Ctrl+V</strong> to paste screenshot</p>
            </div>
          )}

          {ocrUploading && (
            <div className="flex items-center justify-center py-8 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm text-muted-foreground">Uploading...</span>
            </div>
          )}

          {ocrPreviewUrl && (
            <img src={ocrPreviewUrl} alt="Payment screenshot" className="w-full rounded-md max-h-48 object-contain border" />
          )}

          {ocrProcessing && (
            <div className="flex items-center justify-center py-4 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm text-muted-foreground">Extracting data with AI...</span>
            </div>
          )}

          {ocrResult && (
            <div className="space-y-3">
              <div>
                <Label>BDT Amount</Label>
                <Input type="number" value={ocrResult.bdt_amount} onChange={(e) => setOcrResult({ ...ocrResult, bdt_amount: e.target.value })} />
              </div>
              <div>
                <Label>Transaction Date</Label>
                <Input type="date" value={ocrResult.date} onChange={(e) => setOcrResult({ ...ocrResult, date: e.target.value })} />
              </div>
              <div>
                <Label>Reference / TrxID</Label>
                <Input value={ocrResult.reference} onChange={(e) => setOcrResult({ ...ocrResult, reference: e.target.value })} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowOcrDialog(false); resetOcr(); }}>Cancel</Button>
            {ocrResult && (
              <Button onClick={() => saveOcrMutation.mutate()} disabled={saveOcrMutation.isPending}>
                {saveOcrMutation.isPending ? "Saving..." : "Confirm & Save"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
