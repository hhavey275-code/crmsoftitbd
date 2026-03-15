import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowUpCircle, Building2, Copy } from "lucide-react";

const bankDetails = {
  bankName: "First National Bank",
  accountName: "Meta Ad Top-Up Platform Ltd",
  accountNumber: "1234567890",
  routingNumber: "021000021",
  swiftCode: "FNBAUS33",
};

export function ClientTopUp() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");

  const { data: adAccounts } = useQuery({
    queryKey: ["client-assigned-accounts", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("ad_accounts")
        .select("*")
        .eq("assigned_user_id", user!.id)
        .eq("status", "active");
      return data ?? [];
    },
    enabled: !!user,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("top_up_requests").insert({
        user_id: user!.id,
        amount: parseFloat(amount),
        payment_method: "bank_transfer",
        payment_reference: reference || null,
        ad_account_id: selectedAccount || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Top-up request submitted! We'll review it shortly.");
      queryClient.invalidateQueries({ queryKey: ["client-pending-topups"] });
      queryClient.invalidateQueries({ queryKey: ["client-topup-history"] });
      setAmount("");
      setReference("");
      setSelectedAccount("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Top-Up Wallet</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Bank Transfer Details
            </CardTitle>
            <CardDescription>Send your payment to the following account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(bankDetails).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-xs text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1")}</p>
                  <p className="font-medium font-mono text-sm">{value}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => copyToClipboard(value)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5 text-primary" />
              Submit Top-Up Request
            </CardTitle>
            <CardDescription>After making the transfer, submit your request</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Ad Account</Label>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an ad account" />
                </SelectTrigger>
                <SelectContent>
                  {adAccounts?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.account_name} ({a.account_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {adAccounts?.length === 0 && (
                <p className="text-xs text-muted-foreground">No ad accounts assigned. Contact your admin.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Amount (USD)</Label>
              <Input
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="500.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Reference / Transaction ID</Label>
              <Textarea
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Enter the reference number from your bank transfer"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => submitMutation.mutate()}
              disabled={!amount || parseFloat(amount) <= 0 || !selectedAccount || submitMutation.isPending}
            >
              {submitMutation.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
