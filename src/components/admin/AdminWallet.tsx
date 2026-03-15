import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function AdminWallet() {
  const { data: wallets } = useQuery({
    queryKey: ["admin-all-wallets"],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("*, profiles!inner(full_name, email, company)");
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">All Wallets</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Client Balances</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Currency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wallets?.map((w: any) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">{w.profiles?.full_name || "—"}</TableCell>
                  <TableCell>{w.profiles?.email || "—"}</TableCell>
                  <TableCell>{w.profiles?.company || "—"}</TableCell>
                  <TableCell className="text-right font-semibold">${Number(w.balance).toLocaleString()}</TableCell>
                  <TableCell>{w.currency}</TableCell>
                </TableRow>
              ))}
              {(!wallets || wallets.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No wallets found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
