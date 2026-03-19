import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { DollarSign, TrendingUp, TrendingDown, ImageIcon } from "lucide-react";
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

  // Calculate totals
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

  // Due/Advance = Total BDT paid to seller + Client topups to seller's bank - USDT value in BDT
  const dueAdvance = totals.totalBdtPaid + totals.totalClientBdt - totals.totalConvertedBdt;

  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="text-xl md:text-2xl font-bold">Seller Dashboard</h1>

      {/* Summary Cards */}
      <div className={cn("grid gap-3", isMobile ? "grid-cols-2" : "grid-cols-4")}>
        <Card className="border">
          <CardContent className="p-3 md:p-4 text-center">
            <p className="text-xs text-muted-foreground">Due / Advance</p>
            <p className={cn("text-lg md:text-2xl font-bold", dueAdvance >= 0 ? "text-green-600" : "text-red-500")}>
              {dueAdvance >= 0 ? "+" : ""}৳{Math.abs(dueAdvance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">{dueAdvance >= 0 ? "Advance (আপনি বেশি পেয়েছেন)" : "Due (আপনাকে দিতে হবে)"}</p>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3 md:p-4 text-center">
            <p className="text-xs text-muted-foreground">Total BDT Received</p>
            <p className="text-lg md:text-xl font-bold text-primary">৳{(totals.totalBdtPaid + totals.totalClientBdt).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3 md:p-4 text-center">
            <p className="text-xs text-muted-foreground">Total USDT Given</p>
            <p className="text-lg md:text-xl font-bold">${totals.totalUsdt.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-3 md:p-4 text-center">
            <p className="text-xs text-muted-foreground">USDT Value (BDT)</p>
            <p className="text-lg md:text-xl font-bold">৳{totals.totalConvertedBdt.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Ledger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground animate-pulse">Loading...</div>
          ) : !transactions?.length ? (
            <p className="text-center text-muted-foreground py-8">No transactions yet</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs text-right">Payment (BDT)</TableHead>
                    <TableHead className="text-xs text-right">USDT</TableHead>
                    <TableHead className="text-xs text-right">Rate</TableHead>
                    <TableHead className="text-xs text-right">Converted BDT</TableHead>
                    <TableHead className="text-xs">Note</TableHead>
                    <TableHead className="text-xs">Proof</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t: any) => {
                    const convertedBdt = Number(t.usdt_amount || 0) * Number(t.rate || 0);
                    const typeLabel = t.type === "usdt_received" ? "USDT Received" : t.type === "bdt_payment" ? "BDT Payment" : "Client Top-Up";
                    const typeColor = t.type === "usdt_received" ? "text-blue-600" : t.type === "bdt_payment" ? "text-green-600" : "text-orange-500";
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs whitespace-nowrap">{format(new Date(t.created_at), "MMM d, yyyy")}</TableCell>
                        <TableCell className={cn("text-xs font-medium", typeColor)}>{typeLabel}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{Number(t.bdt_amount) > 0 ? `৳${Number(t.bdt_amount).toLocaleString()}` : "—"}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{Number(t.usdt_amount) > 0 ? `$${Number(t.usdt_amount).toLocaleString()}` : "—"}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{Number(t.rate) > 0 ? t.rate : "—"}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{convertedBdt > 0 ? `৳${convertedBdt.toLocaleString()}` : "—"}</TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate">{t.description || "—"}</TableCell>
                        <TableCell className="text-xs">
                          {t.proof_url ? (
                            <button onClick={() => setProofUrl(t.proof_url)} className="text-primary hover:underline flex items-center gap-1">
                              <ImageIcon className="h-3.5 w-3.5" /> View
                            </button>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Totals Row */}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell className="text-xs" colSpan={2}>Total</TableCell>
                    <TableCell className="text-xs text-right font-mono">৳{(totals.totalBdtPaid + totals.totalClientBdt).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right font-mono">${totals.totalUsdt.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right">—</TableCell>
                    <TableCell className="text-xs text-right font-mono">৳{totals.totalConvertedBdt.toLocaleString()}</TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
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
