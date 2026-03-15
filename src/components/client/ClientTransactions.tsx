import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export function ClientTransactions() {
  const { user } = useAuth();

  const { data: transactions } = useQuery({
    queryKey: ["client-transactions", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("transactions").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      return data ?? [];
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
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Balance After</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions?.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="capitalize font-medium">{tx.type.replace("_", " ")}</TableCell>
                  <TableCell className="font-semibold">${Number(tx.amount).toLocaleString()}</TableCell>
                  <TableCell>{tx.balance_after != null ? `$${Number(tx.balance_after).toLocaleString()}` : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{tx.description || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(tx.created_at), "MMM d, yyyy HH:mm")}</TableCell>
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
