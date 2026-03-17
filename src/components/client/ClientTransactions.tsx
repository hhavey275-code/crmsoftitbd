import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export function ClientTransactions() {
  const { user } = useAuth();

  const { data: transactions } = useQuery({
    queryKey: ["client-transactions", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return (data as any[]) ?? [];
    },
    enabled: !!user,
  });

  // Collect all profile IDs from processed_by
  const profileIds = [
    ...new Set(
      (transactions ?? [])
        .map((tx: any) => {
          const pb = tx.processed_by || "";
          if (pb.startsWith("admin:") || pb.startsWith("client:")) return pb.split(":")[1];
          return null;
        })
        .filter(Boolean)
    ),
  ];

  const { data: profiles } = useQuery({
    queryKey: ["tx-profiles", profileIds.join(",")],
    queryFn: async () => {
      if (profileIds.length === 0) return [];
      const { data } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", profileIds);
      return (data as any[]) ?? [];
    },
    enabled: profileIds.length > 0,
  });

  const getProcessedBy = (tx: any) => {
    const pb = tx.processed_by || "";
    if (pb === "system") return "Auto Approved by System";
    if (pb.startsWith("admin:") || pb.startsWith("client:")) {
      const id = pb.split(":")[1];
      const p = profiles?.find((pr: any) => pr.user_id === id);
      return p?.full_name || p?.email || "—";
    }
    return "—";
  };

  const renderDescription = (tx: any) => {
    const desc = tx.description || "—";
    if (desc.includes("\n")) {
      const [name, accountId] = desc.split("\n");
      return (
        <div>
          <span>{name}</span>
          <span className="block text-xs text-muted-foreground">{accountId}</span>
        </div>
      );
    }
    return desc;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Transaction History</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Balance After</TableHead>
                <TableHead>Processed By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions?.map((tx: any) => (
                <TableRow key={tx.id}>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{format(new Date(tx.created_at), "MMM d, yyyy HH:mm")}</TableCell>
                  <TableCell className="capitalize font-medium">{tx.type.replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-sm">{renderDescription(tx)}</TableCell>
                  <TableCell className={cn("font-semibold", Number(tx.amount) >= 0 ? "text-green-600" : "text-red-600")}>
                    {Number(tx.amount) >= 0 ? "+" : ""}${Math.abs(Number(tx.amount)).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium">${Number(tx.balance_after ?? 0).toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{getProcessedBy(tx)}</TableCell>
                </TableRow>
              ))}
              {(!transactions || transactions.length === 0) && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No transactions yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
