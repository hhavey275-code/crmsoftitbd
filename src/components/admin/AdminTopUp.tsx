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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { toast } from "sonner";
import { useState } from "react";
import { Check, X, Pause } from "lucide-react";

type ActionType = "approved" | "rejected" | "hold";

export function AdminTopUp() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [adminNote, setAdminNote] = useState("");
  const [actionDialog, setActionDialog] = useState<{
    id: string;
    action: ActionType;
    userId: string;
    amount: number;
    bdtAmount: number | null;
    usdRate: number | null;
    proofUrl: string | null;
  } | null>(null);

  const { data: requests } = useQuery({
    queryKey: ["admin-topup-requests"],
    queryFn: async () => {
      const { data } = await supabase
        .from("top_up_requests")
        .select("*")
        .order("created_at", { ascending: false });

      const userIds = [...new Set((data ?? []).map((r: any) => r.user_id))];
      const reviewerIds = [...new Set((data ?? []).filter((r: any) => r.reviewed_by).map((r: any) => r.reviewed_by))];
      const allIds = [...new Set([...userIds, ...reviewerIds])];

      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", allIds);
      const profileMap: Record<string, any> = {};
      profiles?.forEach((p: any) => { profileMap[p.user_id] = p; });

      return (data ?? []).map((r: any) => ({
        ...r,
        profile: profileMap[r.user_id] || null,
        reviewerProfile: r.reviewed_by ? profileMap[r.reviewed_by] || null : null,
      }));
    },
  });

  const filtered = requests?.filter((r: any) =>
    statusFilter === "all" ? true : r.status === statusFilter
  );

  const processMutation = useMutation({
    mutationFn: async ({ id, action, userId, amount }: {
      id: string; action: ActionType; userId: string; amount: number;
    }) => {
      // Duplicate payment reference check on approve
      if (action === "approved") {
        const { data: reqData } = await supabase
          .from("top_up_requests")
          .select("payment_reference")
          .eq("id", id)
          .single();
        const ref = reqData?.payment_reference;
        if (ref) {
          const { data: existing } = await supabase
            .from("top_up_requests")
            .select("id")
            .eq("payment_reference", ref)
            .eq("status", "approved")
            .neq("id", id);
          if (existing && existing.length > 0) {
            throw new Error("This payment reference has already been used in an approved request!");
          }
        }
      }

      const updateData: any = { status: action, reviewed_by: user!.id };
      if (action === "rejected" && adminNote) {
        updateData.admin_note = adminNote;
      }
      if (action === "hold" && adminNote) {
        updateData.admin_note = adminNote;
      }

      const { error: updateError } = await supabase
        .from("top_up_requests")
        .update(updateData)
        .eq("id", id);
      if (updateError) throw updateError;

      if (action === "approved") {
        const { data: wallet } = await supabase.from("wallets").select("balance").eq("user_id", userId).single();
        const currentBalance = Number(wallet?.balance ?? 0);
        const newBalance = currentBalance + amount;

        const { error: walletError } = await supabase.from("wallets").update({ balance: newBalance }).eq("user_id", userId);
        if (walletError) throw walletError;

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

      // Create notification for the client
      await supabase.from("notifications").insert({
        user_id: userId,
        type: "top_up_update",
        title: action === "approved" ? "Top-Up Approved" : action === "rejected" ? "Top-Up Rejected" : "Top-Up On Hold",
        message: action === "approved"
          ? `Your top-up of $${amount} has been approved.`
          : action === "rejected"
          ? `Your top-up of $${amount} was rejected.${adminNote ? " Reason: " + adminNote : ""}`
          : `Your top-up of $${amount} is on hold.${adminNote ? " Note: " + adminNote : ""}`,
        reference_id: id,
      } as any);
    },
    onSuccess: (_, { action }) => {
      toast.success(`Request ${action === "hold" ? "put on hold" : action}`);
      queryClient.invalidateQueries({ queryKey: ["admin-topup-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin-wallets"] });
      setActionDialog(null);
      setAdminNote("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openAction = (r: any, action: ActionType) => {
    setAdminNote("");
    setActionDialog({
      id: r.id, action, userId: r.user_id, amount: r.amount,
      bdtAmount: r.bdt_amount, usdRate: r.usd_rate,
      proofUrl: r.proof_url,
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Top-Up Requests</h1>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="hold">On Hold</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {statusFilter === "all" ? "All" : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} Requests
            {filtered && ` (${filtered.length})`}
          </CardTitle>
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
                <TableHead>Reviewed By</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered?.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.profile?.full_name || r.profile?.email || "Unknown"}</TableCell>
                  <TableCell>{r.bdt_amount ? `৳${Number(r.bdt_amount).toLocaleString()}` : "—"}</TableCell>
                  <TableCell>{r.usd_rate ? `৳${r.usd_rate}` : "—"}</TableCell>
                  <TableCell className="font-semibold">${Number(r.amount).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{r.payment_reference || "—"}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.reviewerProfile ? r.reviewerProfile.full_name || r.reviewerProfile.email : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy")}</TableCell>
                  <TableCell>
                    {(r.status === "pending" || r.status === "hold") && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="hover:text-primary" title="Approve"
                          onClick={() => openAction(r, "approved")}>
                          <Check className="h-4 w-4" />
                        </Button>
                        {r.status !== "hold" && (
                          <Button size="sm" variant="ghost" className="hover:text-orange-500" title="Hold"
                            onClick={() => openAction(r, "hold")}>
                            <Pause className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="hover:text-destructive" title="Reject"
                          onClick={() => openAction(r, "rejected")}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(!filtered || filtered.length === 0) && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No requests</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!actionDialog} onOpenChange={() => { setActionDialog(null); setAdminNote(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.action === "approved" ? "Approve" : actionDialog?.action === "rejected" ? "Reject" : "Hold"} Top-Up Request
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {actionDialog?.action === "approved"
              ? `This will add $${actionDialog?.amount?.toLocaleString()} USD to the client's wallet${actionDialog?.bdtAmount ? ` (৳${Number(actionDialog.bdtAmount).toLocaleString()} BDT @ ৳${actionDialog.usdRate}/USD)` : ""}.`
              : actionDialog?.action === "rejected"
              ? "The client will be notified of the rejection."
              : "The request will be put on hold."}
          </p>
          {actionDialog?.proofUrl && (
            <div className="space-y-1">
              <Label className="text-xs">Payment Proof</Label>
              <a href={actionDialog.proofUrl} target="_blank" rel="noopener noreferrer">
                <img src={actionDialog.proofUrl} alt="Payment proof" className="max-h-48 rounded-md border cursor-pointer hover:opacity-80 transition-opacity" />
              </a>
            </div>
          )}
          {(actionDialog?.action === "rejected" || actionDialog?.action === "hold") && (
            <div className="space-y-2">
              <Label>{actionDialog.action === "rejected" ? "Rejection Reason" : "Note"}</Label>
              <Textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder={actionDialog.action === "rejected" ? "Explain why this request was rejected..." : "Add a note (optional)..."}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionDialog(null); setAdminNote(""); }}>Cancel</Button>
            <Button
              variant={actionDialog?.action === "approved" ? "default" : actionDialog?.action === "rejected" ? "destructive" : "outline"}
              onClick={() => actionDialog && processMutation.mutate(actionDialog)}
              disabled={processMutation.isPending || (actionDialog?.action === "rejected" && !adminNote)}
            >
              {processMutation.isPending ? "Processing..." : actionDialog?.action === "approved" ? "Approve" : actionDialog?.action === "rejected" ? "Reject" : "Hold"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
