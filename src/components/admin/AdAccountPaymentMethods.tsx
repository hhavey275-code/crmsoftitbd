import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CardBrandIcon } from "@/components/CardBrandIcon";
import { toast } from "sonner";
import { CreditCard, Loader2, Trash2, RefreshCw } from "lucide-react";

interface FundingSource {
  id: string;
  display_string: string;
  type: string;
  from_account?: string;
}

interface Props {
  adAccountId: string;
  currentCards?: { id?: string; display_string: string }[];
}

export function AdAccountPaymentMethods({ adAccountId, currentCards = [] }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const queryClient = useQueryClient();

  // Fetch all cards attached to THIS account from BM
  const { data: accountCards, isLoading: loadingCards } = useQuery({
    queryKey: ["account-all-cards", adAccountId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-ad-account-partners", {
        body: { action: "list_account_cards", ad_account_id: adAccountId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.cards ?? []) as { id: string; display_string: string; type: string }[];
    },
  });

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

  // Filter out funding sources that look invalid (just IDs with no proper card info)
  const filteredSources = bmSources?.filter((s) => {
    if (!s.display_string) return false;
    // Filter out sources that are just "Funding source {id}" with no real card info
    if (s.display_string.startsWith("Funding source ") && !s.display_string.includes("*")) return false;
    return true;
  }) ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Payment Methods
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
                <DialogDescription>
                  Choose a funding source from the Business Manager's owned & shared ad accounts to attach to this ad account.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 max-h-[400px] overflow-y-auto mt-2">
                {loadingSources ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : !filteredSources.length ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No active funding sources found on this Business Manager.
                  </p>
                ) : (
                  filteredSources.map((source) => (
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
        {currentCards.length > 0 ? (
          <div className="space-y-2">
            {currentCards.map((card, idx) => (
              <div key={card.id || idx} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <CardBrandIcon displayString={card.display_string} />
                  <span className="text-sm font-medium">{card.display_string}</span>
                </div>
                {idx === 0 && (
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
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No payment method linked to this ad account.</p>
        )}
      </CardContent>
    </Card>
  );
}
