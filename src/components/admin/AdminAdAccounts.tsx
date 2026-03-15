import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function AdminAdAccounts() {
  const queryClient = useQueryClient();

  const { data: accounts } = useQuery({
    queryKey: ["admin-ad-accounts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ad_accounts")
        .select("*, business_managers(name), profiles:assigned_user_id(full_name, email)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["admin-clients-list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, email");
      return data ?? [];
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ accountId, userId }: { accountId: string; userId: string | null }) => {
      const { error } = await supabase
        .from("ad_accounts")
        .update({ assigned_user_id: userId })
        .eq("id", accountId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assignment updated");
      queryClient.invalidateQueries({ queryKey: ["admin-ad-accounts"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">All Ad Accounts</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ad Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account Name</TableHead>
                <TableHead>Account ID</TableHead>
                <TableHead>Business Manager</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Spend Cap</TableHead>
                <TableHead>Spent</TableHead>
                <TableHead>Assigned To</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts?.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.account_name}</TableCell>
                  <TableCell className="font-mono text-sm">{a.account_id}</TableCell>
                  <TableCell>{a.business_managers?.name || "—"}</TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell>${Number(a.spend_cap).toLocaleString()}</TableCell>
                  <TableCell>${Number(a.amount_spent).toLocaleString()}</TableCell>
                  <TableCell>
                    <Select
                      value={a.assigned_user_id || "unassigned"}
                      onValueChange={(val) => assignMutation.mutate({ accountId: a.id, userId: val === "unassigned" ? null : val })}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {clients?.map((c: any) => (
                          <SelectItem key={c.user_id} value={c.user_id}>
                            {c.full_name || c.email || c.user_id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
              {(!accounts || accounts.length === 0) && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No ad accounts</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
