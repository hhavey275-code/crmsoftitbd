import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";

export function ClientWallet() {
  const { user } = useAuth();

  const { data: wallet } = useQuery({
    queryKey: ["client-wallet", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("*").eq("user_id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const { data: topUps } = useQuery({
    queryKey: ["client-topup-history", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("top_up_requests").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Wallet</h1>
      <Card className="bg-primary text-primary-foreground">
        <CardContent className="p-8">
          <p className="text-sm opacity-80">Available Balance</p>
          <p className="text-4xl font-bold mt-1">${Number(wallet?.balance ?? 0).toLocaleString()}</p>
          <p className="text-sm mt-2 opacity-70">{wallet?.currency ?? "USD"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Top-Up History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topUps?.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-semibold">${Number(t.amount).toLocaleString()}</TableCell>
                  <TableCell className="capitalize">{t.payment_method.replace("_", " ")}</TableCell>
                  <TableCell className="text-sm">{t.payment_reference || "—"}</TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(t.created_at), "MMM d, yyyy")}</TableCell>
                </TableRow>
              ))}
              {(!topUps || topUps.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No top-ups yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
