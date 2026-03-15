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
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions?.map((tx: any) => (
                <TableRow key={tx.id}>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{format(new Date(tx.created_at), "MMM d, yyyy HH:mm")}</TableCell>
                  <TableCell className="capitalize font-medium">{tx.type.replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-sm">{tx.description || "—"}</TableCell>
                  <TableCell className={cn("font-semibold", Number(tx.amount) >= 0 ? "text-green-600" : "text-red-600")}>
                    {Number(tx.amount) >= 0 ? "+" : ""}${Math.abs(Number(tx.amount)).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium">${Number(tx.balance_after ?? 0).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {(!transactions || transactions.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No transactions yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
