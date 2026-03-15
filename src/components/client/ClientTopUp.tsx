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
import { ArrowUpCircle } from "lucide-react";

export function ClientTopUp() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");

  const { data: adAccounts } = useQuery({
    queryKey: ["client-assigned-accounts", user?.id],
    queryFn: async () => {
      const { data: assignments } = await (supabase as any)
        .from("user_ad_accounts")
        .select("ad_account_id")
        .eq("user_id", user!.id);
      
      if (!assignments || assignments.length === 0) return [];
      
      const accountIds = assignments.map((a: any) => a.ad_account_id);
      const { data } = await supabase
        .from("ad_accounts")
        .select("*")
        .in("id", accountIds)
        .eq("status", "active");
      return (data as any[]) ?? [];
    },
    enabled: !!user,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const selectedAcc = adAccounts?.find((a: any) => a.id === selectedAccount);
      const { error } = await (supabase as any).from("topups").insert({
        user_id: user!.id,
        amount: parseFloat(amount),
        ad_account_id: selectedAccount || null,
        old_spend_cap: Number(selectedAcc?.spend_cap ?? 0),
        new_spend_cap: Number(selectedAcc?.spend_cap ?? 0) + parseFloat(amount),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Top-up request submitted!");
      queryClient.invalidateQueries({ queryKey: ["client-pending-topups"] });
      setAmount("");
      setSelectedAccount("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Top-Up Wallet</h1>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-primary" />
            Submit Top-Up Request
          </CardTitle>
          <CardDescription>Select an ad account and enter the amount</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Ad Account</Label>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger>
                <SelectValue placeholder="Select an ad account" />
              </SelectTrigger>
              <SelectContent>
                {adAccounts?.map((a: any) => (
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
  );
}
