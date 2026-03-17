import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
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
import { ArrowUpCircle, Banknote, DollarSign, MessageSquare, ImageIcon, X, FileText } from "lucide-react";
import { format } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";

export function ClientTopUp() {
  const isMobile = useIsMobile();
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

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          toast.error("File size must be under 5MB");
          return;
        }
        setProofFile(file);
        setProofPreview(URL.createObjectURL(file));
        toast.success("Screenshot pasted!");
        return;
      }
    }
  }, []);

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

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

  // Collect reviewed_by IDs for name resolution
  const reviewerIds = [
    ...new Set(
      (myRequests ?? [])
        .map((r: any) => r.reviewed_by)
        .filter(Boolean)
    ),
  ];

  const { data: reviewerProfiles } = useQuery({
    queryKey: ["reviewer-profiles", reviewerIds.join(",")],
    queryFn: async () => {
      if (reviewerIds.length === 0) return [];
      const { data } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", reviewerIds);
      return (data as any[]) ?? [];
    },
    enabled: reviewerIds.length > 0,
  });

  const getReviewerName = (r: any) => {
    if (r.status !== "approved") return "—";
    if (!r.reviewed_by) return "Auto Approved";
    const p = reviewerProfiles?.find((pr: any) => pr.user_id === r.reviewed_by);
    return p?.full_name || p?.email || "Admin";
  };

  // Realtime subscription for top_up_requests
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("client-topup-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "top_up_requests", filter: `user_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["client-topup-history", user.id] });
          queryClient.invalidateQueries({ queryKey: ["client-wallet"] });
          queryClient.invalidateQueries({ queryKey: ["client-pending-topups"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const usdEquivalent = bdtAmount && usdRate ? (parseFloat(bdtAmount) / usdRate).toFixed(2) : "0.00";

  const selectedBankDetails = assignedBanks?.find((cb: any) => cb.bank_account_id === selectedBank)?.bank_accounts;

  const fetchTelegramFirst = async () => {
    try {
      await supabase.functions.invoke('telegram-poll', { body: { quick: true } });
    } catch (err) {
      console.log('telegram-poll pre-fetch skipped:', err);
    }
  };

  const verifyWithRetry = async (requestId: string, attempt = 1) => {
    const maxRetries = 5;
    const retryDelayMs = 5 * 60 * 1000; // 5 minutes

    // Fetch Telegram messages before each verify attempt
    await fetchTelegramFirst();

    try {
      const { data, error } = await supabase.functions.invoke('verify-topup', {
        body: { request_id: requestId },
      });
      if (error) throw error;

      if (data?.auto_approved) {
        toast.success("Payment auto-approved! ✅");
        queryClient.invalidateQueries({ queryKey: ["client-topup-history"] });
        queryClient.invalidateQueries({ queryKey: ["client-wallet"] });
        return; // Stop retrying — approved
      }

      if (attempt < maxRetries) {
        toast.info(`Verifying payment... retry ${attempt}/${maxRetries} in 5 min`);
        setTimeout(() => verifyWithRetry(requestId, attempt + 1), retryDelayMs);
        return;
      }

      // All retries exhausted
      toast.info("Payment pending manual review by admin.");
    } catch (err) {
      console.error('verify-topup error:', err);
      // Still retry on error if attempts remain
      if (attempt < maxRetries) {
        setTimeout(() => verifyWithRetry(requestId, attempt + 1), retryDelayMs);
      }
    }
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      let proofUrl: string | null = null;

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

      const { data: inserted, error } = await supabase.from("top_up_requests").insert({
        user_id: user!.id,
        amount: parseFloat(usdEquivalent),
        bdt_amount: parseFloat(bdtAmount),
        usd_rate: usdRate,
        bank_account_id: selectedBank,
        payment_reference: paymentRef || null,
        payment_method: "bank_transfer",
        proof_url: proofUrl,
      } as any).select("id").single();
      if (error) throw error;

      // Trigger async auto-verification with retry
      if (inserted?.id) {
        verifyWithRetry(inserted.id);
      }
    },
    onSuccess: () => {
      toast.success("Top-up request submitted! Verifying payment...");
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
    <div className="space-y-4 md:space-y-6">
      <h1 className="text-xl md:text-2xl font-bold">Top-Up Wallet</h1>

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowUpCircle className="h-5 w-5 text-primary" />
              Submit Top-Up Request
            </CardTitle>
            <CardDescription className="text-xs">Select a bank, enter BDT amount, and submit your payment details</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3">
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

            <Button
              className="w-full"
              onClick={() => submitMutation.mutate()}
              disabled={isInactive || !bdtAmount || parseFloat(bdtAmount) <= 0 || !selectedBank || submitMutation.isPending}
            >
              {submitMutation.isPending ? "Submitting..." : isInactive ? "Account Frozen" : "Submit Request"}
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Payment Proof</CardTitle>
            <CardDescription className="text-xs">Attach your payment reference and screenshot</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3">
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
                  className="w-full border-dashed h-32 flex flex-col gap-1"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Click to attach or Ctrl+V to paste screenshot</span>
                </Button>
              ) : (
                <div className="relative inline-block">
                  <img src={proofPreview} alt="Payment proof" className="max-h-48 rounded-md border" />
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
          </CardContent>
        </Card>
      </div>

      {/* My Requests History */}
      <Card className="shadow-sm">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">My Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {isMobile ? (
            <div className="space-y-2.5">
              {myRequests?.map((r: any) => (
                <div key={r.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold">${Number(r.amount).toLocaleString()}</span>
                      {r.bdt_amount && (
                        <span className="text-xs text-muted-foreground ml-1.5">
                          (৳{Number(r.bdt_amount).toLocaleString()})
                        </span>
                      )}
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[11px] text-muted-foreground">
                      {format(new Date(r.created_at), "MMM d, yyyy")}
                    </span>
                    {r.payment_reference && (
                      <span className="text-[11px] text-muted-foreground">Ref: {r.payment_reference}</span>
                    )}
                  </div>
                  {r.admin_note && !r.admin_note.startsWith('Auto-verification:') && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                      <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                      {r.admin_note}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[11px] text-muted-foreground">
                      {getReviewerName(r)}
                    </span>
                    {r.status === "approved" && (
                      <Button size="sm" variant="ghost" className="gap-1 text-primary hover:underline h-6 px-2 text-xs" asChild>
                        <Link to={`/invoice/${r.id}`} target="_blank">
                          <FileText className="h-3 w-3" />
                          Invoice
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {(!myRequests || myRequests.length === 0) && (
                <p className="text-center text-muted-foreground py-6 text-sm">No requests yet</p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>BDT</TableHead>
                  <TableHead>USD</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Processed By</TableHead>
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
                    <TableCell>
                      {r.status === "approved" ? (
                        <Button size="sm" variant="ghost" className="gap-1 text-primary hover:underline" asChild>
                          <Link to={`/invoice/${r.id}`} target="_blank">
                            <FileText className="h-3.5 w-3.5" />
                            Invoice
                          </Link>
                        </Button>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px]">
                      {r.admin_note && !r.admin_note.startsWith('Auto-verification:') ? (
                        <span className="flex items-start gap-1 text-muted-foreground">
                          <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                          {r.admin_note}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="text-foreground">{getReviewerName(r)}</span>
                      {r.status === "approved" && (
                        <span className="block text-[10px] text-muted-foreground">
                          {format(new Date(new Date(r.updated_at).toLocaleString("en-US", { timeZone: "Asia/Dhaka" })), "MMM d, yyyy hh:mm a")}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {(!myRequests || myRequests.length === 0) && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No requests yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
