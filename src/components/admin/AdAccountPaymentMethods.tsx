import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CardBrandIcon } from "@/components/CardBrandIcon";
import { toast } from "sonner";
import { CreditCard, Plus, Loader2 } from "lucide-react";

interface Props {
  adAccountId: string;
  cards?: Array<{ display_string: string; id?: string }> | null;
}

export function AdAccountPaymentMethods({ adAccountId, cards }: Props) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: fundingSources, isLoading: loadingSources, refetch } = useQuery({
    queryKey: ["bm-funding-sources", adAccountId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-ad-account-partners", {
        body: { action: "list_funding_sources", ad_account_id: adAccountId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.funding_sources ?? []) as Array<{ id: string; display_string: string; type: string }>;
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
      toast.success("Funding source added successfully");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["ad-account-insights-detail", adAccountId] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to add funding source"),
  });

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) refetch();
  };

  const cardList = Array.isArray(cards) ? cards : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Payment Methods
          </CardTitle>
          <Dialog open={open} onOpenChange={handleOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Funding Source from BM</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {loadingSources ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : !fundingSources?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No funding sources found on this Business Manager.
                  </p>
                ) : (
                  fundingSources.map((source) => (
                    <div
                      key={source.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <CardBrandIcon displayString={source.display_string} />
                        <div>
                          <p className="text-sm font-medium">{source.display_string}</p>
                          <p className="text-xs text-muted-foreground capitalize">{source.type}</p>
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
        {cardList.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payment methods linked.</p>
        ) : (
          <div className="space-y-2">
            {cardList.map((card, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 border rounded-lg">
                <CardBrandIcon displayString={card.display_string} />
                <span className="text-sm font-medium">{card.display_string}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
