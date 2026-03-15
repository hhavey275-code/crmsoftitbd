import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowUpCircle, Banknote, DollarSign } from "lucide-react";

export function ClientTopUp() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [bdtAmount, setBdtAmount] = useState("");

  const isInactive = (profile as any)?.status === "inactive";
  const [selectedBank, setSelectedBank] = useState("");
  const [paymentRef, setPaymentRef] = useState("");

  // Get USD rate
  const { data: usdRate } = useQuery({
    queryKey: ["usd-rate"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "usd_rate").single();
      return Number(data?.value ?? 120);
    },
  });

  // Get assigned banks
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

  const usdEquivalent = bdtAmount && usdRate ? (parseFloat(bdtAmount) / usdRate).toFixed(2) : "0.00";

  const selectedBankDetails = assignedBanks?.find((cb: any) => cb.bank_account_id === selectedBank)?.bank_accounts;

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("top_up_requests").insert({
        user_id: user!.id,
        amount: parseFloat(usdEquivalent),
        bdt_amount: parseFloat(bdtAmount),
        usd_rate: usdRate,
        bank_account_id: selectedBank,
        payment_reference: paymentRef || null,
        payment_method: "bank_transfer",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Top-up request submitted!");
      queryClient.invalidateQueries({ queryKey: ["client-pending-topups"] });
      setBdtAmount("");
      setSelectedBank("");
      setPaymentRef("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Top-Up Wallet</h1>

      {/* USD Rate Info */}
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
          {/* Bank Selection */}
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

          {/* Bank Details */}
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

          {/* BDT Amount */}
          <div className="space-y-2">
            <Label>Amount (BDT)</Label>
            <Input
              type="number"
              min="1"
              step="1"
              value={bdtAmount}
              onChange={(e) => setBdtAmount(e.target.value)}
              placeholder="10000"
            />
          </div>

          {/* USD Equivalent */}
          {bdtAmount && parseFloat(bdtAmount) > 0 && (
            <div className="rounded-md bg-primary/10 p-3 text-center">
              <p className="text-sm text-muted-foreground">USD Equivalent</p>
              <p className="text-2xl font-bold text-primary">${usdEquivalent}</p>
              <p className="text-xs text-muted-foreground">@ ৳{usdRate}/USD</p>
            </div>
          )}

          {/* Payment Reference */}
          <div className="space-y-2">
            <Label>Payment Reference / Transaction ID</Label>
            <Input
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder="e.g. TXN123456"
            />
          </div>

          <Button
            className="w-full"
            onClick={() => submitMutation.mutate()}
            disabled={!bdtAmount || parseFloat(bdtAmount) <= 0 || !selectedBank || submitMutation.isPending}
          >
            {submitMutation.isPending ? "Submitting..." : "Submit Request"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
