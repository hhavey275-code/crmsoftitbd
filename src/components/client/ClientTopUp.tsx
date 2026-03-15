import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";
import { ArrowUpCircle, Banknote, DollarSign, MessageSquare, ImageIcon, X } from "lucide-react";
import { format } from "date-fns";

export function ClientTopUp() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [bdtAmount, setBdtAmount] = useState("");

  const isInactive = (profile as any)?.status === "inactive";
  const [selectedBank, setSelectedBank] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be under 5MB");
      return;
    }
    setProofFile(file);
    setProofPreview(URL.createObjectURL(file));
  };

  const clearFile = () => {
    setProofFile(null);
    setProofPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const { data: usdRate } = useQuery({
    queryKey: ["usd-rate", user?.id],
    queryFn: async () => {
      const clientRate = (profile as any)?.usd_rate;
      if (clientRate) return Number(clientRate);
      const { data } = await supabase.from("site_settings").select("value").eq("key", "usd_rate").single();
      return Number(data?.value ?? 120);
    },
    enabled: !!user,
  });

  const { data: assignedBanks } = useQuery({
    queryKey: ["client-assigned-banks", user?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("client_banks")
        .select("*, bank_accounts(*)")
        .eq("user_id", user!.id);
      return (data as any[]) ?? [];
    },
    enabled: !!user,
  });

  const { data: myRequests } = useQuery({
    queryKey: ["client-topup-history", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("top_up_requests")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    enabled: !!user,
  });

  const usdEquivalent = bdtAmount && usdRate ? (parseFloat(bdtAmount) / usdRate).toFixed(2) : "0.00";

  const selectedBankDetails = assignedBanks?.find((cb: any) => cb.bank_account_id === selectedBank)?.bank_accounts;

  const submitMutation = useMutation({
    mutationFn: async () => {
      let proofUrl: string | null = null;

      // Upload payment proof if provided
      if (proofFile) {
        const ext = proofFile.name.split(".").pop();
        const filePath = `${user!.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("payment-proofs")
          .upload(filePath, proofFile);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage
          .from("payment-proofs")
          .getPublicUrl(filePath);
        proofUrl = urlData.publicUrl;
      }

      const { error } = await supabase.from("top_up_requests").insert({
        user_id: user!.id,
        amount: parseFloat(usdEquivalent),
        bdt_amount: parseFloat(bdtAmount),
        usd_rate: usdRate,
        bank_account_id: selectedBank,
        payment_reference: paymentRef || null,
        payment_method: "bank_transfer",
        proof_url: proofUrl,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Top-up request submitted!");
      queryClient.invalidateQueries({ queryKey: ["client-pending-topups"] });
      queryClient.invalidateQueries({ queryKey: ["client-topup-history"] });
      setBdtAmount("");
      setSelectedBank("");
      setPaymentRef("");
      clearFile();
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Top-Up Wallet</h1>

      {isInactive && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="p-4 flex items-center gap-3">
            <span className="text-destructive font-semibold">⚠️ Your account was freezed for violating our policy. You cannot submit top-up requests.</span>
          </CardContent>
        </Card>
      )}

      <Card className="max-w-lg border-cyan-200 bg-cyan-50/50 dark:bg-cyan-950/20 dark:border-cyan-800">
        <CardContent className="p-4 flex items-center gap-3">
          <DollarSign className="h-5 w-5 text-cyan-600" />
          <p className="text-sm font-medium">Current USD Rate: <span className="text-lg font-bold text-cyan-700 dark:text-cyan-400">৳{usdRate}</span> per $1 USD</p>
        </CardContent>
      </Card>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-primary" />
            Submit Top-Up Request
          </CardTitle>
          <CardDescription>Select a bank, enter BDT amount, and submit your payment details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Payment Bank</Label>
            <Select value={selectedBank} onValueChange={setSelectedBank}>
              <SelectTrigger>
                <SelectValue placeholder="Select a bank" />
              </SelectTrigger>
              <SelectContent>
                {assignedBanks?.map((cb: any) => (
                  <SelectItem key={cb.bank_account_id} value={cb.bank_account_id}>
                    {cb.bank_accounts?.bank_name} — {cb.bank_accounts?.account_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {assignedBanks?.length === 0 && (
              <p className="text-xs text-muted-foreground">No banks assigned. Contact your admin.</p>
            )}
          </div>

          {selectedBankDetails && (
            <Card className="bg-muted/50">
              <CardContent className="p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">Payment Details</p>
                <p className="text-sm"><Banknote className="inline h-3 w-3 mr-1" />{selectedBankDetails.bank_name}</p>
                <p className="text-sm">A/C Name: <span className="font-medium">{selectedBankDetails.account_name}</span></p>
                <p className="text-sm">A/C No: <span className="font-medium">{selectedBankDetails.account_number}</span></p>
                {selectedBankDetails.branch && <p className="text-sm">Branch: {selectedBankDetails.branch}</p>}
                {selectedBankDetails.routing_number && <p className="text-sm">Routing: {selectedBankDetails.routing_number}</p>}
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            <Label>Amount (BDT)</Label>
            <Input type="number" min="1" step="1" value={bdtAmount} onChange={(e) => setBdtAmount(e.target.value)} placeholder="10000" />
          </div>

          {bdtAmount && parseFloat(bdtAmount) > 0 && (
            <div className="rounded-md bg-primary/10 p-3 text-center">
              <p className="text-sm text-muted-foreground">USD Equivalent</p>
              <p className="text-2xl font-bold text-primary">${usdEquivalent}</p>
              <p className="text-xs text-muted-foreground">@ ৳{usdRate}/USD</p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Payment Reference / Transaction ID</Label>
            <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="e.g. TXN123456" />
          </div>

          <div className="space-y-2">
            <Label>Payment Screenshot</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            {!proofPreview ? (
              <Button
                type="button"
                variant="outline"
                className="w-full border-dashed h-20 flex flex-col gap-1"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Click to attach payment screenshot</span>
              </Button>
            ) : (
              <div className="relative inline-block">
                <img src={proofPreview} alt="Payment proof" className="max-h-40 rounded-md border" />
                <button
                  type="button"
                  onClick={clearFile}
                  className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          <Button
            className="w-full"
            onClick={() => submitMutation.mutate()}
            disabled={isInactive || !bdtAmount || parseFloat(bdtAmount) <= 0 || !selectedBank || submitMutation.isPending}
          >
            {submitMutation.isPending ? "Submitting..." : isInactive ? "Account Frozen" : "Submit Request"}
          </Button>
        </CardContent>
      </Card>

      {/* My Requests History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">My Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>BDT</TableHead>
                <TableHead>USD</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {myRequests?.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy")}</TableCell>
                  <TableCell>{r.bdt_amount ? `৳${Number(r.bdt_amount).toLocaleString()}` : "—"}</TableCell>
                  <TableCell className="font-semibold">${Number(r.amount).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{r.payment_reference || "—"}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-sm max-w-[200px]">
                    {r.admin_note ? (
                      <span className="flex items-start gap-1 text-muted-foreground">
                        <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                        {r.admin_note}
                      </span>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {(!myRequests || myRequests.length === 0) && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No requests yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
