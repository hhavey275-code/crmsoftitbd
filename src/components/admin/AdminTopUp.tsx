import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";
import { toast } from "sonner";
import { useState } from "react";
import { Check, X } from "lucide-react";

export function AdminTopUp() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [actionDialog, setActionDialog] = useState<{ id: string; action: "approved" | "rejected"; userId: string; amount: number; adAccountId: string | null } | null>(null);

  const { data: requests } = useQuery({
    queryKey: ["admin-topup-requests"],
    queryFn: async () => {
      const { data } = await supabase
        .from("topups")
        .select("*, profiles!inner(full_name, email), ad_accounts(account_name, account_id)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const processMutation = useMutation({
    mutationFn: async ({ id, action, userId, amount, adAccountId }: { id: string; action: "approved" | "rejected"; userId: string; amount: number; adAccountId: string | null }) => {
      const { error: updateError } = await supabase
        .from("topups")
        .update({ status: action })
        .eq("id", id);
      if (updateError) throw updateError;

      if (action === "approved") {
        const { data: wallet } = await supabase.from("wallets").select("balance").eq("user_id", userId).single();
        const currentBalance = Number(wallet?.balance ?? 0);

        if (currentBalance < amount) {
          throw new Error("Insufficient wallet balance");
        }

        const newBalance = currentBalance - amount;

        const { error: walletError } = await supabase.from("wallets").update({ balance: newBalance }).eq("user_id", userId);
        if (walletError) throw walletError;

        const { error: txError } = await supabase.from("wallet_transactions").insert({
          user_id: userId,
          type: "ad_spend",
          amount,
          reference_id: id,
          status: "completed",
        });
        if (txError) throw txError;

        if (adAccountId) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-spend-cap`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({ ad_account_id: adAccountId, amount }),
              }
            );
            const result = await res.json();
            if (!res.ok) {
              console.error("Spend cap update failed:", result.error);
            }
          } catch (apiErr) {
            console.error("Meta API call failed:", apiErr);
          }
        }
      }
    },
    onSuccess: (_, { action }) => {
      toast.success(`Request ${action}`);
      queryClient.invalidateQueries({ queryKey: ["admin-topup-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin-wallets"] });
      setActionDialog(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Top-Up Requests</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Ad Account</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Old Cap</TableHead>
                <TableHead>New Cap</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests?.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.profiles?.full_name || r.profiles?.email}</TableCell>
                  <TableCell className="text-sm">
                    {r.ad_accounts ? `${r.ad_accounts.account_name} (${r.ad_accounts.account_id})` : "—"}
                  </TableCell>
                  <TableCell className="font-semibold">${Number(r.amount).toLocaleString()}</TableCell>
                  <TableCell>${Number(r.old_spend_cap).toLocaleString()}</TableCell>
                  <TableCell>${Number(r.new_spend_cap).toLocaleString()}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy")}</TableCell>
                  <TableCell>
                    {r.status === "pending" && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="text-emerald-600 hover:text-emerald-700" onClick={() => setActionDialog({ id: r.id, action: "approved", userId: r.user_id, amount: r.amount, adAccountId: r.ad_account_id })}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setActionDialog({ id: r.id, action: "rejected", userId: r.user_id, amount: r.amount, adAccountId: r.ad_account_id })}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(!requests || requests.length === 0) && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No requests</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionDialog?.action === "approved" ? "Approve" : "Reject"} Top-Up Request</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {actionDialog?.action === "approved"
              ? `This will deduct $${actionDialog?.amount?.toLocaleString()} from the client's wallet and update the ad account spend cap via Meta API.`
              : "The client will be notified of the rejection."}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              variant={actionDialog?.action === "approved" ? "default" : "destructive"}
              onClick={() => actionDialog && processMutation.mutate(actionDialog)}
              disabled={processMutation.isPending}
            >
              {processMutation.isPending ? "Processing..." : actionDialog?.action === "approved" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
