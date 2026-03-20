import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";
import { ArrowUpCircle, Banknote, DollarSign, ImageIcon, X, FileText, ChevronLeft, ChevronRight, Check, CreditCard, Building2, Wallet, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import { logSystemAction } from "@/lib/systemLog";
import { cn } from "@/lib/utils";

type PaymentMethod = "online_transfer" | "atm_deposit" | "cash_deposit";

const STEPS = [
  { label: "Method", icon: CreditCard },
  { label: "Bank", icon: Building2 },
  { label: "Details", icon: FileText },
  { label: "Review", icon: Check },
];

export function ClientTopUp() {
  const isMobile = useIsMobile();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const isInactive = (profile as any)?.status === "inactive";

  // Wizard state
  const [step, setStep] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [selectedBank, setSelectedBank] = useState("");
  const [bdtAmount, setBdtAmount] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("File size must be under 5MB"); return; }
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
        if (file.size > 5 * 1024 * 1024) { toast.error("File size must be under 5MB"); return; }
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

  // Queries
  const { data: usdRate } = useQuery({
    queryKey: ["usd-rate", user?.id],
    queryFn: async () => {
      const { data: freshProfile } = await supabase.from("profiles").select("usd_rate").eq("user_id", user!.id).single();
      const clientRate = freshProfile?.usd_rate;
      if (clientRate != null && clientRate > 0) return Number(clientRate);
      const { data } = await supabase.from("site_settings").select("value").eq("key", "usd_rate").single();
      return Number(data?.value ?? 120);
    },
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: wallet } = useQuery({
    queryKey: ["client-wallet", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("balance").eq("user_id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const { data: assignedBanks } = useQuery({
    queryKey: ["client-assigned-banks", user?.id],
    queryFn: async () => {
      const { data } = await (supabase as any).from("client_banks").select("*, bank_accounts(*)").eq("user_id", user!.id);
      return (data as any[]) ?? [];
    },
    enabled: !!user,
  });

  const { data: myRequests } = useQuery({
    queryKey: ["client-topup-history", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("top_up_requests").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    },
    enabled: !!user,
  });

  const reviewerIds = [...new Set((myRequests ?? []).map((r: any) => r.reviewed_by).filter(Boolean))];
  const { data: reviewerProfiles } = useQuery({
    queryKey: ["reviewer-profiles", reviewerIds.join(",")],
    queryFn: async () => {
      if (reviewerIds.length === 0) return [];
      const { data } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", reviewerIds);
      return (data as any[]) ?? [];
    },
    enabled: reviewerIds.length > 0,
  });

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel("client-topup-realtime").on("postgres_changes", { event: "*", schema: "public", table: "top_up_requests", filter: `user_id=eq.${user.id}` }, () => {
      queryClient.invalidateQueries({ queryKey: ["client-topup-history", user.id] });
      queryClient.invalidateQueries({ queryKey: ["client-wallet"] });
      queryClient.invalidateQueries({ queryKey: ["client-pending-topups"] });
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const usdEquivalent = bdtAmount && usdRate ? (parseFloat(bdtAmount) / usdRate).toFixed(2) : "0.00";
  const selectedBankDetails = assignedBanks?.find((cb: any) => cb.bank_account_id === selectedBank)?.bank_accounts;

  const fetchTelegramFirst = async () => {
    try { await supabase.functions.invoke('telegram-poll', { body: { quick: true } }); } catch (err) { console.log('telegram-poll pre-fetch skipped:', err); }
  };

  const verifyWithRetry = async (requestId: string, attempt = 1) => {
    const maxRetries = 4;
    const retryDelayMs = 3 * 60 * 1000;
    await fetchTelegramFirst();
    try {
      const { data, error } = await supabase.functions.invoke('verify-topup', { body: { request_id: requestId } });
      if (error) throw error;
      if (data?.auto_approved) { toast.success("Payment auto-approved! ✅"); queryClient.invalidateQueries({ queryKey: ["client-topup-history"] }); queryClient.invalidateQueries({ queryKey: ["client-wallet"] }); return; }
      if (attempt < maxRetries) { toast.info(`Verifying payment... retry ${attempt}/${maxRetries} in 3 min`); setTimeout(() => verifyWithRetry(requestId, attempt + 1), retryDelayMs); return; }
      toast.info("Payment pending manual review by admin.");
    } catch (err) {
      console.error('verify-topup error:', err);
      if (attempt < maxRetries) { setTimeout(() => verifyWithRetry(requestId, attempt + 1), retryDelayMs); }
    }
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      let proofUrl: string | null = null;
      if (proofFile) {
        const ext = proofFile.name.split(".").pop();
        const filePath = `${user!.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("payment-proofs").upload(filePath, proofFile);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("payment-proofs").getPublicUrl(filePath);
        proofUrl = urlData.publicUrl;
      }
      const { data: inserted, error } = await supabase.from("top_up_requests").insert({
        user_id: user!.id,
        amount: parseFloat(usdEquivalent),
        bdt_amount: parseFloat(bdtAmount),
        usd_rate: usdRate,
        bank_account_id: selectedBank,
        payment_reference: paymentRef || null,
        payment_method: paymentMethod === "online_transfer" ? "bank_transfer" : paymentMethod,
        proof_url: proofUrl,
      } as any).select("id").single();
      if (error) throw error;
      if (inserted?.id) { verifyWithRetry(inserted.id); }
    },
    onSuccess: () => {
      toast.success("Top-up request submitted! Verifying payment...");
      logSystemAction("Top-Up Submitted", `$${usdEquivalent} (৳${bdtAmount})`, user!.id, profile?.full_name || user!.email);
      queryClient.invalidateQueries({ queryKey: ["client-pending-topups"] });
      queryClient.invalidateQueries({ queryKey: ["client-topup-history"] });
      // Reset wizard
      setStep(0);
      setBdtAmount("");
      setSelectedBank("");
      setPaymentRef("");
      setPaymentMethod(null);
      clearFile();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const methodLabel = (m: PaymentMethod | null) => {
    if (m === "online_transfer") return "Online Bank Transfer";
    if (m === "atm_deposit") return "ATM Deposit";
    if (m === "cash_deposit") return "Cash Deposit";
    return "";
  };

  // Step Progress
  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-1 mb-6">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const isCompleted = i < step;
        const isCurrent = i === step;
        return (
          <div key={i} className="flex items-center gap-1">
            <div className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all",
              isCurrent && "bg-primary text-primary-foreground shadow-sm",
              isCompleted && "bg-primary/15 text-primary",
              !isCurrent && !isCompleted && "bg-muted text-muted-foreground"
            )}>
              <Icon className="h-3.5 w-3.5" />
              {!isMobile && <span>{s.label}</span>}
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
        );
      })}
    </div>
  );

  // Header bar
  const HeaderBar = () => (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-5 w-5 text-primary" />
        <span className="text-sm font-medium">Balance: <span className="text-lg font-bold text-primary">${Number(wallet?.balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
      </div>
      <div className="flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm">Rate: <span className="font-semibold">৳{usdRate}</span>/USD</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
        <ArrowUpCircle className="h-5 w-5 md:h-6 md:w-6 text-primary" />
        Top-Up Wallet
      </h1>

      {isInactive && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="p-4 flex items-center gap-3">
            <span className="text-destructive font-semibold">⚠️ Your account was frozen for violating our policy. You cannot submit top-up requests.</span>
          </CardContent>
        </Card>
      )}

      <HeaderBar />
      <StepIndicator />

      {/* Step 0: Select Payment Method */}
      {step === 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Select Payment Method</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([
              { value: "online_transfer" as PaymentMethod, label: "Online Bank Transfer", desc: "Transfer via internet banking", icon: "🏦" },
              { value: "atm_deposit" as PaymentMethod, label: "ATM Deposit", desc: "Deposit via ATM machine", icon: "🏧" },
              { value: "cash_deposit" as PaymentMethod, label: "Cash Deposit", desc: "Deposit cash at bank branch", icon: "💵" },
            ]).map((m) => (
              <Card
                key={m.value}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md active:scale-[0.97] border-2",
                  paymentMethod === m.value ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-primary/40"
                )}
                onClick={() => { setPaymentMethod(m.value); setStep(1); }}
              >
                <CardContent className="p-4 text-center space-y-2">
                  <span className="text-3xl">{m.icon}</span>
                  <p className="font-semibold text-sm">{m.label}</p>
                  <p className="text-xs text-muted-foreground">{m.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Step 1: Select Bank */}
      {step === 1 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStep(0)} className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <h2 className="text-lg font-semibold">Select Payment Bank</h2>
          </div>

          {assignedBanks?.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No banks assigned. Contact your admin.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {assignedBanks?.map((cb: any) => {
                const bank = cb.bank_accounts;
                if (!bank) return null;
                const isSelected = selectedBank === cb.bank_account_id;
                return (
                  <Card
                    key={cb.bank_account_id}
                    className={cn(
                      "cursor-pointer transition-all hover:shadow-md active:scale-[0.97] border-2",
                      isSelected ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-primary/40"
                    )}
                    onClick={() => { setSelectedBank(cb.bank_account_id); setStep(2); }}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center gap-3">
                        {bank.logo_url ? (
                          <img src={bank.logo_url} alt={bank.bank_name} className="h-10 w-10 rounded-lg border object-contain bg-white shrink-0" />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                            <Building2 className="h-5 w-5 text-blue-600" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm">{bank.bank_name}</p>
                          <p className="text-xs text-muted-foreground">{bank.account_name}</p>
                        </div>
                      </div>
                      <div className="text-xs space-y-0.5 text-muted-foreground pl-[52px]">
                        <p>A/C: <span className="font-mono font-medium text-foreground">{bank.account_number}</span></p>
                        {bank.branch && <p>Branch: {bank.branch}</p>}
                        {bank.routing_number && <p>Routing: {bank.routing_number}</p>}
                      </div>
                      <div className="flex justify-end">
                        <span className="text-xs text-primary font-medium flex items-center gap-1">
                          Select <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Payment Details */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <h2 className="text-lg font-semibold">Payment Details</h2>
          </div>

          {/* Selected bank summary */}
          {selectedBankDetails && (
            <Card className="bg-muted/50 border">
              <CardContent className="p-3 flex items-center gap-3">
                {selectedBankDetails.logo_url ? (
                  <img src={selectedBankDetails.logo_url} alt="" className="h-9 w-9 rounded-lg border object-contain bg-white shrink-0" />
                ) : (
                  <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4 text-blue-600" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{selectedBankDetails.bank_name}</p>
                  <p className="text-xs text-muted-foreground">{selectedBankDetails.account_name} — {selectedBankDetails.account_number}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Amount */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Amount (BDT)</Label>
                <Input type="number" min="1" step="1" value={bdtAmount} onChange={(e) => setBdtAmount(e.target.value)} placeholder="10000" className="text-lg" />
                <p className="text-xs text-muted-foreground">Minimum: ৳500</p>
              </div>

              {bdtAmount && parseFloat(bdtAmount) > 0 && (
                <div className="rounded-lg bg-primary/10 p-4 text-center">
                  <p className="text-xs text-muted-foreground">USD Equivalent</p>
                  <p className="text-3xl font-bold text-primary">${usdEquivalent}</p>
                  <p className="text-xs text-muted-foreground">@ ৳{usdRate}/USD</p>
                </div>
              )}

              {paymentMethod !== "cash_deposit" && (
                <div className="space-y-2">
                  <Label>Transaction Reference / ID</Label>
                  <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="e.g. TXN123456" />
                </div>
              )}
            </div>

            {/* Proof */}
            <div className="space-y-2">
              <Label>Payment Screenshot</Label>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              {!proofPreview ? (
                <Button type="button" variant="outline" className="w-full border-dashed h-36 flex flex-col gap-2" onClick={() => fileInputRef.current?.click()}>
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Click to attach or Ctrl+V to paste</span>
                </Button>
              ) : (
                <div className="relative inline-block">
                  <img src={proofPreview} alt="Payment proof" className="max-h-48 rounded-md border" />
                  <button type="button" onClick={clearFile} className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <Button className="w-full" onClick={() => setStep(3)} disabled={!bdtAmount || parseFloat(bdtAmount) <= 0}>
            Continue to Review <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Step 3: Review & Submit */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Edit Details
            </Button>
            <h2 className="text-lg font-semibold">Review & Confirm</h2>
          </div>

          <Card className="border">
            <CardContent className="p-4 space-y-4">
              {/* Method */}
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Payment Method</span>
                <span className="text-sm font-medium">{methodLabel(paymentMethod)}</span>
              </div>

              {/* Bank */}
              {selectedBankDetails && (
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Payment To</span>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    {selectedBankDetails.logo_url ? (
                      <img src={selectedBankDetails.logo_url} alt="" className="h-9 w-9 rounded-lg border object-contain bg-white shrink-0" />
                    ) : (
                      <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                        <Building2 className="h-4 w-4 text-blue-600" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold">{selectedBankDetails.bank_name}</p>
                      <p className="text-xs text-muted-foreground">{selectedBankDetails.account_name} — {selectedBankDetails.account_number}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Amount */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-xs text-muted-foreground">BDT Amount</p>
                  <p className="text-lg font-bold">৳{Number(bdtAmount).toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg bg-primary/10 text-center">
                  <p className="text-xs text-muted-foreground">USD Amount</p>
                  <p className="text-lg font-bold text-primary">${usdEquivalent}</p>
                </div>
              </div>

              {/* Reference */}
              {paymentRef && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Reference</span>
                  <span className="text-sm font-mono font-medium">{paymentRef}</span>
                </div>
              )}

              {/* Proof */}
              {proofPreview && (
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Payment Proof</span>
                  <img src={proofPreview} alt="Proof" className="max-h-32 rounded-md border" />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Edit
            </Button>
            <Button
              className="flex-1"
              onClick={() => submitMutation.mutate()}
              disabled={isInactive || submitMutation.isPending}
            >
              {submitMutation.isPending ? "Submitting..." : isInactive ? "Account Frozen" : "Confirm & Submit"}
            </Button>
          </div>
        </div>
      )}

      {/* My Requests History */}
      <Card className="shadow-sm mt-6">
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
                      {r.bdt_amount && <span className="text-xs text-muted-foreground ml-1.5">(৳{Number(r.bdt_amount).toLocaleString()})</span>}
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[11px] text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy")}</span>
                    {r.payment_reference && <span className="text-[11px] text-muted-foreground">Ref: {r.payment_reference}</span>}
                  </div>
                  {r.status === "approved" && (
                    <div className="flex justify-end mt-2">
                      <Button size="sm" variant="ghost" className="gap-1 text-primary hover:underline h-6 px-2 text-xs" asChild>
                        <Link to={`/invoice/${r.id}`} target="_blank"><FileText className="h-3 w-3" />Invoice</Link>
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {(!myRequests || myRequests.length === 0) && <p className="text-center text-muted-foreground py-6 text-sm">No requests yet</p>}
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
                          <Link to={`/invoice/${r.id}`} target="_blank"><FileText className="h-3.5 w-3.5" />Invoice</Link>
                        </Button>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {(!myRequests || myRequests.length === 0) && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No requests yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
