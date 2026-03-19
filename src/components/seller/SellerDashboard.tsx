import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { ImageIcon } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export function SellerDashboard() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [proofUrl, setProofUrl] = useState<string | null>(null);

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["seller-transactions", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("seller_transactions")
        .select("*")
        .eq("seller_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    enabled: !!user,
  });

  const totals = transactions?.reduce(
    (acc: any, t: any) => {
      if (t.type === "bdt_payment") acc.totalBdtPaid += Number(t.bdt_amount || 0);
      if (t.type === "usdt_received") {
        acc.totalUsdt += Number(t.usdt_amount || 0);
        acc.totalConvertedBdt += Number(t.usdt_amount || 0) * Number(t.rate || 0);
      }
      if (t.type === "client_topup") acc.totalClientBdt += Number(t.bdt_amount || 0);
      return acc;
    },
    { totalBdtPaid: 0, totalUsdt: 0, totalConvertedBdt: 0, totalClientBdt: 0 }
  ) ?? { totalBdtPaid: 0, totalUsdt: 0, totalConvertedBdt: 0, totalClientBdt: 0 };

  const dueAdvance = totals.totalBdtPaid + totals.totalClientBdt - totals.totalConvertedBdt;

  const getTypeLabel = (type: string) =>
    type === "usdt_received" ? "USDT Received" : type === "bdt_payment" ? "BDT Payment" : "Client Top-Up";
  const getTypeColor = (type: string) =>
    type === "usdt_received" ? "text-blue-600" : type === "bdt_payment" ? "text-green-600" : "text-orange-500";

  const fmt = (v: number, prefix: string) => v > 0 ? `${prefix}${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "0";

  return (
    <div className="space-y-3 md:space-y-6">
      <h1 className="text-lg md:text-2xl font-bold">Seller Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        <Card className="border col-span-2 md:col-span-1">
          <CardContent className="p-3 md:p-4 text-center">
            <p className="text-[10px] md:text-xs text-muted-foreground">Due / Advance</p>
            <p className={cn("text-base md:text-2xl font-bold", dueAdvance >= 0 ? "text-green-600" : "text-red-500")}>
              {dueAdvance >= 0 ? "+" : ""}৳{Math.abs(dueAdvance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
            <p className="text-[9px] md:text-[10px] text-muted-foreground mt-0.5">
              {dueAdvance >= 0 ? "Advance (আপনি বেশি পেয়েছেন)" : "Due (আপনাকে দিতে হবে)"}
            </p>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3 md:p-4 text-center">
            <p className="text-[10px] md:text-xs text-muted-foreground">BDT Received</p>
            <p className="text-sm md:text-xl font-bold text-primary">৳{(totals.totalBdtPaid + totals.totalClientBdt).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3 md:p-4 text-center">
            <p className="text-[10px] md:text-xs text-muted-foreground">USDT Given</p>
            <p className="text-sm md:text-xl font-bold">${totals.totalUsdt.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3 md:p-4 text-center">
            <p className="text-[10px] md:text-xs text-muted-foreground">USDT (BDT)</p>
            <p className="text-sm md:text-xl font-bold">৳{totals.totalConvertedBdt.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Ledger */}
      <Card>
        <CardHeader className="p-3 md:p-6 pb-2 md:pb-2">
          <CardTitle className="text-base md:text-lg">Transaction History</CardTitle>
        </CardHeader>
        <CardContent className="p-2 md:p-6 pt-0">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground animate-pulse">Loading...</div>
          ) : !transactions?.length ? (
            <p className="text-center text-muted-foreground py-8">No transactions yet</p>
          ) : isMobile ? (
            /* ── Mobile: Card-based layout ── */
            <div className="space-y-2">
              {transactions.map((t: any) => {
                const convertedBdt = Number(t.usdt_amount || 0) * Number(t.rate || 0);
                return (
                  <Card key={t.id} className="border">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className={cn("text-xs font-bold", getTypeColor(t.type))}>
                          {getTypeLabel(t.type)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(t.created_at), "MMM d, yyyy")}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">BDT:</span>
                          <span className="font-semibold">{fmt(Number(t.bdt_amount), "৳")}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">USDT:</span>
                          <span className="font-semibold">{fmt(Number(t.usdt_amount), "$")}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Rate:</span>
                          <span className="font-semibold">{Number(t.rate) > 0 ? t.rate : "0"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Conv:</span>
                          <span className="font-semibold">{fmt(convertedBdt, "৳")}</span>
                        </div>
                      </div>
                      {t.description && (
                        <p className="text-[10px] text-muted-foreground mt-1.5 truncate">📝 {t.description}</p>
                      )}
                      {t.proof_url && (
                        <button
                          onClick={() => setProofUrl(t.proof_url)}
                          className="text-[10px] text-primary hover:underline flex items-center gap-1 mt-1"
                        >
                          <ImageIcon className="h-3 w-3" /> View Proof
                        </button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

              {/* Mobile Totals */}
              <Card className="border bg-muted/50">
                <CardContent className="p-3">
                  <p className="text-xs font-bold mb-1">Total</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">BDT:</span>
                      <span className="font-bold">৳{(totals.totalBdtPaid + totals.totalClientBdt).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">USDT:</span>
                      <span className="font-bold">${totals.totalUsdt.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Conv BDT:</span>
                      <span className="font-bold">৳{totals.totalConvertedBdt.toLocaleString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            /* ── Desktop: Table layout ── */
            <div className="overflow-x-auto">
              <table
                className="w-full text-[13px] font-medium border-collapse border border-border"
                style={{ fontFamily: "'Google Sans', 'Roboto', 'Arial', sans-serif" }}
              >
                <thead>
                  <tr className="bg-muted/60">
                    <th className="border border-border px-3 py-2 text-center text-xs font-semibold">Date</th>
                    <th className="border border-border px-3 py-2 text-center text-xs font-semibold">Type</th>
                    <th className="border border-border px-3 py-2 text-center text-xs font-semibold">BDT</th>
                    <th className="border border-border px-3 py-2 text-center text-xs font-semibold">USDT</th>
                    <th className="border border-border px-3 py-2 text-center text-xs font-semibold">Rate</th>
                    <th className="border border-border px-3 py-2 text-center text-xs font-semibold">Conv BDT</th>
                    <th className="border border-border px-3 py-2 text-center text-xs font-semibold">Note</th>
                    <th className="border border-border px-3 py-2 text-center text-xs font-semibold">Proof</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t: any) => {
                    const convertedBdt = Number(t.usdt_amount || 0) * Number(t.rate || 0);
                    return (
                      <tr key={t.id} className="hover:bg-muted/30">
                        <td className="border border-border px-3 py-1.5 text-center text-xs whitespace-nowrap">
                          {format(new Date(t.created_at), "MMM d, yyyy")}
                        </td>
                        <td className={cn("border border-border px-3 py-1.5 text-center text-xs font-bold", getTypeColor(t.type))}>
                          {getTypeLabel(t.type)}
                        </td>
                        <td className="border border-border px-3 py-1.5 text-center text-xs font-semibold">
                          {fmt(Number(t.bdt_amount), "৳")}
                        </td>
                        <td className="border border-border px-3 py-1.5 text-center text-xs font-semibold">
                          {fmt(Number(t.usdt_amount), "$")}
                        </td>
                        <td className="border border-border px-3 py-1.5 text-center text-xs font-semibold">
                          {Number(t.rate) > 0 ? t.rate : "0"}
                        </td>
                        <td className="border border-border px-3 py-1.5 text-center text-xs font-semibold">
                          {fmt(convertedBdt, "৳")}
                        </td>
                        <td className="border border-border px-3 py-1.5 text-center text-xs max-w-[120px] truncate">
                          {t.description || "0"}
                        </td>
                        <td className="border border-border px-3 py-1.5 text-center text-xs">
                          {t.proof_url ? (
                            <button onClick={() => setProofUrl(t.proof_url)} className="text-primary hover:underline inline-flex items-center gap-1">
                              <ImageIcon className="h-3.5 w-3.5" /> View
                            </button>
                          ) : "0"}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Totals Row */}
                  <tr className="bg-muted/50 font-bold">
                    <td className="border border-border px-3 py-2 text-center text-xs" colSpan={2}>Total</td>
                    <td className="border border-border px-3 py-2 text-center text-xs font-bold">
                      ৳{(totals.totalBdtPaid + totals.totalClientBdt).toLocaleString()}
                    </td>
                    <td className="border border-border px-3 py-2 text-center text-xs font-bold">
                      ${totals.totalUsdt.toLocaleString()}
                    </td>
                    <td className="border border-border px-3 py-2 text-center text-xs">0</td>
                    <td className="border border-border px-3 py-2 text-center text-xs font-bold">
                      ৳{totals.totalConvertedBdt.toLocaleString()}
                    </td>
                    <td className="border border-border px-3 py-2 text-center text-xs" colSpan={2}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Proof Dialog */}
      <Dialog open={!!proofUrl} onOpenChange={() => setProofUrl(null)}>
        <DialogContent className="max-w-lg">
          {proofUrl && <img src={proofUrl} alt="Proof" className="w-full rounded-md" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
