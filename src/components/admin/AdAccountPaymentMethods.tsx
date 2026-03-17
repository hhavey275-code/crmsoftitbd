import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CardBrandIcon } from "@/components/CardBrandIcon";
import { toast } from "sonner";
import { CreditCard, Plus, Loader2, Trash2, RefreshCw } from "lucide-react";

interface FundingSource {
  id: string;
  display_string: string;
  type: string;
  from_account?: string;
}

interface Props {
  adAccountId: string;
  currentCard?: { id?: string; display_string: string } | null;
}

export function AdAccountPaymentMethods({ adAccountId, currentCard }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const queryClient = useQueryClient();

  // List BM's available funding sources (for the add dialog)
  const { data: bmSources, isLoading: loadingSources, refetch: refetchSources } = useQuery({
    queryKey: ["bm-funding-sources", adAccountId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-ad-account-partners", {
        body: { action: "list_funding_sources", ad_account_id: adAccountId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.funding_sources ?? []) as FundingSource[];
    },
    enabled: false,
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
      toast.success("Funding source attached");
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["ad-account-insights-detail", adAccountId] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to add"),
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-ad-account-partners", {
        body: { action: "remove_funding_source", ad_account_id: adAccountId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Funding source removed");
      queryClient.invalidateQueries({ queryKey: ["ad-account-insights-detail", adAccountId] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to remove"),
  });

  const handleOpenAdd = (isOpen: boolean) => {
    setAddOpen(isOpen);
    if (isOpen) refetchSources();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Payment Method
          </CardTitle>
          <Dialog open={addOpen} onOpenChange={handleOpenAdd}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8">
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Change
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Select Funding Source from BM</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Choose a funding source from the Business Manager's ad accounts to attach to this ad account.
              </p>
              <div className="space-y-2 max-h-[400px] overflow-y-auto mt-2">
                {loadingSources ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : !bmSources?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No funding sources found on this Business Manager.
                  </p>
                ) : (
                  bmSources.map((source) => (
                    <div
                      key={source.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <CardBrandIcon displayString={source.display_string} />
                        <div>
                          <p className="text-sm font-medium">{source.display_string}</p>
                          <p className="text-xs text-muted-foreground">
                            {source.from_account && `From: ${source.from_account}`}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => addMutation.mutate(source.id)}
                        disabled={addMutation.isPending}
                      >
                        {addMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Attach"}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {currentCard ? (
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <CardBrandIcon displayString={currentCard.display_string} />
              <span className="text-sm font-medium">{currentCard.display_string}</span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => {
                if (confirm("Remove funding source from this ad account?")) {
                  removeMutation.mutate();
                }
              }}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No payment method linked to this ad account.</p>
        )}
      </CardContent>
    </Card>
  );
}
