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
import { useState, Fragment, useMemo, useEffect } from "react";
import { Check, X, Pause, ImageIcon, Radio, ChevronDown, ChevronUp, MessageSquareText, RotateCcw, ClipboardCheck, FileText } from "lucide-react";
import { Link } from "react-router-dom";

type ActionType = "approved" | "rejected" | "hold";

const getTelegramDisplayText = (m: any) => {
  const raw = m?.raw_update || {};
  const payload = raw.message || raw.edited_message || raw.channel_post || raw.edited_channel_post || {};

  if (typeof m?.text === "string" && m.text.trim()) return m.text;
  if (typeof payload?.text === "string" && payload.text.trim()) return payload.text;
  if (typeof payload?.caption === "string" && payload.caption.trim()) return payload.caption;

  if (Array.isArray(payload?.new_chat_members) && payload.new_chat_members.length > 0) {
    const names = payload.new_chat_members
      .map((member: any) => member?.username || member?.first_name || "member")
      .join(", ");
    return `[service] new_chat_members: ${names}`;
  }

  if (payload?.left_chat_member) {
    return `[service] left_chat_member: ${payload.left_chat_member?.username || payload.left_chat_member?.first_name || "member"}`;
  }

  return "(non-text Telegram update)";
};

function BankSmsPanel({ request }: { request: any }) {
  const last4 = request.bankAccount?.account_number?.slice(-4) || "";
  const bdtAmount = request.bdt_amount ? Number(request.bdt_amount) : null;
  const createdAt = new Date(request.created_at);
  const windowMs = 60 * 60 * 1000;

  const { data: messages, isLoading } = useQuery({
    queryKey: ["bank-sms", request.id],
    queryFn: async () => {
      const from = new Date(createdAt.getTime() - windowMs).toISOString();
      const to = new Date(createdAt.getTime() + windowMs).toISOString();
      const { data } = await (supabase as any)
        .from("telegram_messages")
        .select("*")
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data as any[]) ?? [];
    },
  });

  const relevantMessages = messages?.filter((m: any) => {
    const text = getTelegramDisplayText(m).toLowerCase();
    const hasLast4 = last4 && text.includes(last4);
    const hasAmount = bdtAmount && text.includes(String(Math.round(bdtAmount)));
    const hasRef = request.payment_reference && text.includes(String(request.payment_reference).toLowerCase());
    return hasLast4 || hasAmount || hasRef;
  }) ?? [];

  if (isLoading) {
    return <div className="px-4 py-3 text-sm text-muted-foreground animate-pulse">Loading bank SMS...</div>;
  }

  if (relevantMessages.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-muted-foreground bg-muted/30 rounded-md">
        No matching bank SMS found
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {relevantMessages.map((m: any) => (
        <div key={m.update_id} className="p-3 bg-muted/40 rounded-md border text-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{format(new Date(m.created_at), "MMM d, HH:mm:ss")}</span>
          </div>
          <p className="whitespace-pre-wrap text-foreground">{getTelegramDisplayText(m)}</p>
        </div>
      ))}
    </div>
  );
}

function BankSmsTab() {
  const { data: messages, isLoading } = useQuery({
    queryKey: ["all-bank-sms"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("telegram_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      return (data as any[]) ?? [];
    },
  });

  const allMessages = messages ?? [];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground animate-pulse">Loading bank SMS...</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquareText className="h-5 w-5 text-primary" />
          Bank SMS Messages ({allMessages.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {allMessages.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No bank SMS messages found. Make sure the bot's Group Privacy is turned OFF in BotFather and the bot is added to your bank SMS group.
          </p>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {allMessages.map((m: any) => (
              <div key={m.update_id} className="p-3 bg-muted/40 rounded-md border text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{format(new Date(m.created_at), "MMM d, yyyy HH:mm:ss")}</span>
                  <span className="text-xs text-muted-foreground">Chat: {m.chat_id}</span>
                </div>
                <p className="whitespace-pre-wrap text-foreground">{getTelegramDisplayText(m)}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminTopUp() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [adminNote, setAdminNote] = useState("");
  const [proofDialog, setProofDialog] = useState<string | null>(null);
  const [isFetchingTelegram, setIsFetchingTelegram] = useState(false);
  const [expandedSms, setExpandedSms] = useState<Record<string, boolean>>({});
  const [verifyingIds, setVerifyingIds] = useState<Record<string, boolean>>({});
  const [actionDialog, setActionDialog] = useState<{
    id: string;
    action: ActionType;
    userId: string;
    amount: number;
    bdtAmount: number | null;
    usdRate: number | null;
  } | null>(null);

  // Realtime subscription for top_up_requests
  useEffect(() => {
    const channel = supabase
      .channel("admin-topup-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "top_up_requests" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin-topup-requests"] });
          queryClient.invalidateQueries({ queryKey: ["admin-wallets"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const toggleSms = (id: string) => {
    setExpandedSms(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const fetchTelegram = async () => {
    setIsFetchingTelegram(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-poll', { body: { quick: true } });
      if (error) throw error;
      toast.success(`Telegram synced! ${data?.processed ?? 0} messages fetched${data?.auto_verified ? `, ${data.auto_verified} request(s) auto-approved!` : ''}.`);
    } catch (err: any) {
      toast.error(`Telegram fetch failed: ${err.message}`);
    } finally {
      setIsFetchingTelegram(false);
    }
  };

  const reVerify = async (requestId: string) => {
    setVerifyingIds(prev => ({ ...prev, [requestId]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('verify-topup', { body: { request_id: requestId } });
      if (error) throw error;
      if (data?.auto_approved) {
        toast.success('Request auto-approved!');
        queryClient.invalidateQueries({ queryKey: ["admin-topup-requests"] });
        queryClient.invalidateQueries({ queryKey: ["admin-wallets"] });
      } else {
        toast.info(`Not auto-approved: ${data?.reason || 'No match found'}`);
      }
    } catch (err: any) {
      toast.error(`Verify failed: ${err.message}`);
    } finally {
      setVerifyingIds(prev => ({ ...prev, [requestId]: false }));
    }
  };

  const { data: requests } = useQuery({
    queryKey: ["admin-topup-requests"],
    queryFn: async () => {
      const { data } = await supabase
        .from("top_up_requests")
        .select("*")
        .order("created_at", { ascending: false });

      const rows = data ?? [];
      const userIds = [...new Set(rows.map((r: any) => r.user_id))];
      const reviewerIds = [...new Set(rows.filter((r: any) => r.reviewed_by).map((r: any) => r.reviewed_by))];
      const allIds = [...new Set([...userIds, ...reviewerIds])];
      const bankIds = [...new Set(rows.filter((r: any) => r.bank_account_id).map((r: any) => r.bank_account_id))];

      const [{ data: profiles }, { data: banks }] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, email").in("user_id", allIds),
        bankIds.length > 0
          ? supabase.from("bank_accounts").select("id, bank_name, account_number").in("id", bankIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profileMap: Record<string, any> = {};
      profiles?.forEach((p: any) => { profileMap[p.user_id] = p; });

      const bankMap: Record<string, any> = {};
      (banks ?? []).forEach((b: any) => { bankMap[b.id] = b; });

      return rows.map((r: any) => ({
        ...r,
        profile: profileMap[r.user_id] || null,
        reviewerProfile: r.reviewed_by ? profileMap[r.reviewed_by] || null : null,
        bankAccount: r.bank_account_id ? bankMap[r.bank_account_id] || null : null,
      }));
    },
  });

  const filtered = requests?.filter((r: any) =>
    statusFilter === "all" || statusFilter === "bank_sms" ? true : r.status === statusFilter
  );

  const processMutation = useMutation({
    mutationFn: async ({ id, action, userId, amount }: {
      id: string; action: ActionType; userId: string; amount: number;
    }) => {
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
      if ((action === "rejected" || action === "hold") && adminNote) {
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
          processed_by: `admin:${user!.id}`,
        } as any);
        if (txError) throw txError;
      }

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
    });
  };

  const getBankDisplay = (bank: any) => {
    if (!bank) return "—";
    const accNum = bank.account_number || "";
    const last4 = accNum.slice(-4);
    return `${bank.bank_name} ****${last4}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Top-Up Requests</h1>
        <Button
          size="sm"
          variant="outline"
          onClick={fetchTelegram}
          disabled={isFetchingTelegram}
          className="gap-1.5"
        >
          <Radio className="h-3.5 w-3.5" />
          {isFetchingTelegram ? "Fetching..." : "Fetch Telegram"}
        </Button>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="hold">On Hold</TabsTrigger>
          <TabsTrigger value="bank_sms" className="gap-1">
            <MessageSquareText className="h-3.5 w-3.5" />
            Bank SMS
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {statusFilter === "bank_sms" ? (
        <BankSmsTab />
      ) : (

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
                <TableHead className="w-12">SL</TableHead>
                <TableHead>Bank Account</TableHead>
                <TableHead>Client Name</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Transaction Ref</TableHead>
                <TableHead>Payment Proof</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Processed By</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered?.map((r: any, idx: number) => (
                <Fragment key={r.id}>
                  <TableRow>
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="text-sm">{getBankDisplay(r.bankAccount)}</TableCell>
                    <TableCell className="font-medium">
                      <Link to={`/clients/${r.user_id}`} className="text-primary hover:underline">
                        {r.profile?.full_name || r.profile?.email || "Unknown"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="font-semibold">{r.bdt_amount ? `৳${Number(r.bdt_amount).toLocaleString()}` : "—"}</span>
                        <span className="text-xs text-muted-foreground block">${Number(r.amount).toLocaleString()}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-mono">{r.payment_reference || "—"}</TableCell>
                    <TableCell>
                      {r.proof_url ? (
                        <button
                          onClick={() => setProofDialog(r.proof_url)}
                          className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                        >
                          <ImageIcon className="h-4 w-4" />
                          View
                        </button>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.reviewed_by === 'system' ? "Auto Approved by System" : r.reviewerProfile ? r.reviewerProfile.full_name || r.reviewerProfile.email : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {(r.status === "pending" || r.status === "hold") && (
                          <>
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
                          </>
                        )}
                        {r.status === "pending" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="hover:text-primary"
                            title="Re-verify"
                            onClick={() => reVerify(r.id)}
                            disabled={verifyingIds[r.id]}
                          >
                            <RotateCcw className={`h-4 w-4 ${verifyingIds[r.id] ? 'animate-spin' : ''}`} />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Bank SMS"
                          onClick={() => toggleSms(r.id)}
                          className={expandedSms[r.id] ? "text-primary" : ""}
                        >
                          <MessageSquareText className="h-4 w-4" />
                          {expandedSms[r.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedSms[r.id] && (
                    <TableRow>
                      <TableCell colSpan={9} className="bg-muted/20 p-3 space-y-4">
                        {r.admin_note && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <ClipboardCheck className="h-4 w-4 text-primary" />
                              <span className="text-sm font-semibold">Match Details</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {r.admin_note.split(' | ').map((entry: string, i: number) => {
                                const cleaned = entry.replace(/^Auto-verification:\s*/, '').trim();
                                if (!cleaned) return null;
                                const isPass = cleaned.startsWith('✅');
                                const isFail = cleaned.startsWith('❌');
                                const isWarn = cleaned.startsWith('⚠️');
                                // Split into label and detail
                                const parts = cleaned.match(/^(✅|❌|⚠️)\s*(.+?)(?:\s*\((.+)\))?$/);
                                const icon = parts?.[1] || '';
                                const label = parts?.[2] || cleaned;
                                const detail = parts?.[3] || '';
                                return (
                                  <div
                                    key={i}
                                    className={`px-3 py-2 rounded-lg border ${
                                      isPass ? 'bg-green-500/10 border-green-500/30' :
                                      isFail ? 'bg-destructive/10 border-destructive/30' :
                                      isWarn ? 'bg-yellow-500/10 border-yellow-500/30' :
                                      'bg-muted/40 border-border'
                                    }`}
                                  >
                                    <div className={`text-xs font-medium ${
                                      isPass ? 'text-green-700 dark:text-green-400' :
                                      isFail ? 'text-destructive' :
                                      isWarn ? 'text-yellow-700 dark:text-yellow-400' :
                                      'text-muted-foreground'
                                    }`}>
                                      {icon} {label}
                                    </div>
                                    {detail && (
                                      <div className="text-[11px] text-muted-foreground mt-0.5 break-all">{detail}</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <MessageSquareText className="h-4 w-4 text-primary" />
                            <span className="text-sm font-semibold">Bank SMS Messages</span>
                          </div>
                          <BankSmsPanel request={r} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
              {(!filtered || filtered.length === 0) && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No requests</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      )}

      {/* Payment Proof Image Dialog */}
      <Dialog open={!!proofDialog} onOpenChange={() => setProofDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payment Proof</DialogTitle>
          </DialogHeader>
          {proofDialog && (
            <a href={proofDialog} target="_blank" rel="noopener noreferrer">
              <img src={proofDialog} alt="Payment proof" className="w-full rounded-md cursor-pointer hover:opacity-90 transition-opacity" />
            </a>
          )}
        </DialogContent>
      </Dialog>

      {/* Action Confirmation Dialog */}
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
