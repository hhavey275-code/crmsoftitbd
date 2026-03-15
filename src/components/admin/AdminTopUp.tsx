import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { toast } from "sonner";
import { useState } from "react";
import { Check, X } from "lucide-react";

export function AdminTopUp() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [actionDialog, setActionDialog] = useState<{ id: string; action: "approved" | "rejected"; userId: string; amount: number } | null>(null);
  const [note, setNote] = useState("");

  const { data: requests } = useQuery({
    queryKey: ["admin-topup-requests"],
    queryFn: async () => {
      const { data } = await supabase.from("top_up_requests").select("*, profiles!inner(full_name, email)").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const processMutation = useMutation({
    mutationFn: async ({ id, action, userId, amount }: { id: string; action: "approved" | "rejected"; userId: string; amount: number }) => {
      // Update the request status
      const { error: updateError } = await supabase
        .from("top_up_requests")
        .update({ status: action, admin_note: note || null, reviewed_by: user?.id })
        .eq("id", id);
      if (updateError) throw updateError;

      if (action === "approved") {
        // Get current wallet balance
        const { data: wallet } = await supabase.from("wallets").select("balance").eq("user_id", userId).single();
        const newBalance = Number(wallet?.balance ?? 0) + amount;

        // Update wallet
        const { error: walletError } = await supabase.from("wallets").update({ balance: newBalance }).eq("user_id", userId);
        if (walletError) throw walletError;

        // Insert transaction
        const { error: txError } = await supabase.from("transactions").insert({
          user_id: userId,
          type: "top_up",
          amount,
          balance_after: newBalance,
          description: `Top-up approved`,
          reference_id: id,
        });
        if (txError) throw txError;
      }
    },
    onSuccess: (_, { action }) => {
      toast.success(`Request ${action}`);
      queryClient.invalidateQueries({ queryKey: ["admin-topup-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin-wallets"] });
      setActionDialog(null);
      setNote("");
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
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests?.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.profiles?.full_name || r.profiles?.email}</TableCell>
                  <TableCell className="font-semibold">${Number(r.amount).toLocaleString()}</TableCell>
                  <TableCell className="capitalize">{r.payment_method.replace("_", " ")}</TableCell>
                  <TableCell className="text-sm">{r.payment_reference || "—"}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy")}</TableCell>
                  <TableCell>
                    {r.status === "pending" && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="text-emerald-600 hover:text-emerald-700" onClick={() => setActionDialog({ id: r.id, action: "approved", userId: r.user_id, amount: r.amount })}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setActionDialog({ id: r.id, action: "rejected", userId: r.user_id, amount: r.amount })}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(!requests || requests.length === 0) && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No requests</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!actionDialog} onOpenChange={() => { setActionDialog(null); setNote(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionDialog?.action === "approved" ? "Approve" : "Reject"} Top-Up Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {actionDialog?.action === "approved"
                ? `This will credit $${actionDialog?.amount?.toLocaleString()} to the client's wallet.`
                : "The client will be notified of the rejection."}
            </p>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionDialog(null); setNote(""); }}>Cancel</Button>
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
