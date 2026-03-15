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
  const [actionDialog, setActionDialog] = useState<{
    id: string;
    action: "approved" | "rejected";
    userId: string;
    amount: number;
    bdtAmount: number | null;
    usdRate: number | null;
  } | null>(null);

  const { data: requests } = useQuery({
    queryKey: ["admin-topup-requests"],
    queryFn: async () => {
      const { data } = await supabase
        .from("top_up_requests")
        .select("*")
        .order("created_at", { ascending: false });
      
      // Fetch profiles separately for display
      const userIds = [...new Set((data ?? []).map((r: any) => r.user_id))];
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds);
      const profileMap: Record<string, any> = {};
      profiles?.forEach((p: any) => { profileMap[p.user_id] = p; });

      return (data ?? []).map((r: any) => ({
        ...r,
        profile: profileMap[r.user_id] || null,
      }));
    },
  });

  const processMutation = useMutation({
    mutationFn: async ({ id, action, userId, amount }: {
      id: string; action: "approved" | "rejected"; userId: string; amount: number;
    }) => {
      // Update request status
      const { error: updateError } = await supabase
        .from("top_up_requests")
        .update({ status: action, reviewed_by: user!.id } as any)
        .eq("id", id);
      if (updateError) throw updateError;

      if (action === "approved") {
        // Add USD amount to wallet
        const { data: wallet } = await supabase.from("wallets").select("balance").eq("user_id", userId).single();
        const currentBalance = Number(wallet?.balance ?? 0);
        const newBalance = currentBalance + amount;

        const { error: walletError } = await supabase.from("wallets").update({ balance: newBalance }).eq("user_id", userId);
        if (walletError) throw walletError;

        // Create transaction record
        const { error: txError } = await supabase.from("transactions").insert({
          user_id: userId,
          type: "top_up",
          amount: amount,
          balance_after: newBalance,
          reference_id: id,
          description: "Wallet top-up approved",
        });
        if (txError) throw txError;
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
                <TableHead>BDT Amount</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>USD Amount</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests?.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.profile?.full_name || r.profile?.email || "Unknown"}</TableCell>
                  <TableCell>{r.bdt_amount ? `৳${Number(r.bdt_amount).toLocaleString()}` : "—"}</TableCell>
                  <TableCell>{r.usd_rate ? `৳${r.usd_rate}` : "—"}</TableCell>
                  <TableCell className="font-semibold">${Number(r.amount).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{r.payment_reference || "—"}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy")}</TableCell>
                  <TableCell>
                    {r.status === "pending" && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="hover:text-primary" onClick={() => setActionDialog({
                          id: r.id, action: "approved", userId: r.user_id, amount: r.amount,
                          bdtAmount: r.bdt_amount, usdRate: r.usd_rate,
                        })}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="hover:text-destructive" onClick={() => setActionDialog({
                          id: r.id, action: "rejected", userId: r.user_id, amount: r.amount,
                          bdtAmount: r.bdt_amount, usdRate: r.usd_rate,
                        })}>
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
              ? `This will add $${actionDialog?.amount?.toLocaleString()} USD to the client's wallet${actionDialog?.bdtAmount ? ` (৳${Number(actionDialog.bdtAmount).toLocaleString()} BDT @ ৳${actionDialog.usdRate}/USD)` : ""}.`
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
