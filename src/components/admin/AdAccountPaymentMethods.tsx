import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CardBrandIcon } from "@/components/CardBrandIcon";
import { toast } from "sonner";
import { CreditCard, Plus, Loader2, Trash2 } from "lucide-react";

interface FundingSource {
  id: string;
  display_string: string;
  type: string;
}

interface Props {
  adAccountId: string;
}

export function AdAccountPaymentMethods({ adAccountId }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const queryClient = useQueryClient();

  // List current payment methods on this ad account
  const { data: methods, isLoading, refetch } = useQuery({
    queryKey: ["ad-account-payment-methods", adAccountId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-ad-account-partners", {
        body: { action: "list_funding_sources", ad_account_id: adAccountId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.funding_sources ?? []) as FundingSource[];
    },
  });

  // List BM's funding sources for adding (only fetched when dialog opens)
  const { data: bmSources, isLoading: loadingBmSources, refetch: refetchBm } = useQuery({
    queryKey: ["bm-funding-sources-for-add", adAccountId],
    queryFn: async () => {
      // We reuse the same endpoint — it lists what's on the ad account
      // For "add" we'd need BM-level sources, but Meta doesn't have a clean endpoint
      // So we'll just show the add dialog with a funding source ID input
      return [] as FundingSource[];
    },
    enabled: false,
  });

  const removeMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      const { data, error } = await supabase.functions.invoke("manage-ad-account-partners", {
        body: { action: "remove_funding_source", ad_account_id: adAccountId, payment_method_id: paymentMethodId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Payment method removed");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["ad-account-insights-detail", adAccountId] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to remove"),
  });

  const addMutation = useMutation({
    mutationFn: async (fundingSourceId: string) => {
      const { data, error } = await supabase.functions.invoke("manage-ad-account-partners", {
        body: { action: "add_funding_source", ad_account_id: adAccountId, funding_source_id: fundingSourceId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Funding source added");
      setAddOpen(false);
      setFundingSourceInput("");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["ad-account-insights-detail", adAccountId] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to add"),
  });

  const [fundingSourceInput, setFundingSourceInput] = useState("");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Payment Methods
          </CardTitle>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Funding Source</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Enter the Meta funding source ID to attach to this ad account.
                </p>
                <input
                  type="text"
                  value={fundingSourceInput}
                  onChange={(e) => setFundingSourceInput(e.target.value)}
                  placeholder="Funding Source ID"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <Button
                  onClick={() => addMutation.mutate(fundingSourceInput)}
                  disabled={!fundingSourceInput.trim() || addMutation.isPending}
                  className="w-full"
                >
                  {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Attach to Ad Account
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !methods?.length ? (
          <p className="text-sm text-muted-foreground">No payment methods linked.</p>
        ) : (
          <div className="space-y-2">
            {methods.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-2.5 border rounded-lg">
                <div className="flex items-center gap-3">
                  <CardBrandIcon displayString={m.display_string} />
                  <div>
                    <span className="text-sm font-medium">{m.display_string}</span>
                    <p className="text-xs text-muted-foreground capitalize">{m.type}</p>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (confirm("Are you sure you want to remove this payment method?")) {
                      removeMutation.mutate(m.id);
                    }
                  }}
                  disabled={removeMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
