import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CardBrandIcon } from "@/components/CardBrandIcon";
import { toast } from "sonner";
import { CreditCard, Loader2, Trash2 } from "lucide-react";

interface Props {
  adAccountId: string;
  currentCards?: { id?: string; display_string: string }[];
}

export function AdAccountPaymentMethods({ adAccountId, currentCards = [] }: Props) {
  const queryClient = useQueryClient();

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
      toast.success("Payment method removed");
      queryClient.invalidateQueries({ queryKey: ["account-all-cards", adAccountId] });
      queryClient.invalidateQueries({ queryKey: ["ad-account-insights-detail", adAccountId] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to remove"),
  });

  const displayCards = accountCards && accountCards.length > 0 ? accountCards : currentCards;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          Payment Methods
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loadingCards ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : displayCards.length > 0 ? (
          <div className="space-y-2">
            {displayCards.map((card, idx) => (
              <div key={card.id || idx} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <CardBrandIcon displayString={card.display_string} />
                  <span className="text-sm font-medium">{card.display_string}</span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (confirm("Remove this payment method from the ad account?")) {
                      removeMutation.mutate();
                    }
                  }}
                  disabled={removeMutation.isPending}
                >
                  {removeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
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
