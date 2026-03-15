import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export function AdminAdAccounts() {
  const queryClient = useQueryClient();

  const { data: accounts } = useQuery({
    queryKey: ["admin-ad-accounts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ad_accounts")
        .select("*, business_managers(name)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: assignments } = useQuery({
    queryKey: ["admin-user-ad-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("user_ad_accounts").select("*");
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
      // Remove existing assignment for this account
      await supabase.from("user_ad_accounts").delete().eq("ad_account_id", accountId);
      // Insert new assignment if not unassigned
      if (userId) {
        const { error } = await supabase.from("user_ad_accounts").insert({
          user_id: userId,
          ad_account_id: accountId,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Assignment updated");
      queryClient.invalidateQueries({ queryKey: ["admin-ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-ad-accounts"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const getAssignedUserId = (accountId: string) => {
    const assignment = assignments?.find((a) => a.ad_account_id === accountId);
    return assignment?.user_id ?? null;
  };

  const getClientName = (userId: string | null) => {
    if (!userId) return null;
    const client = clients?.find((c) => c.user_id === userId);
    return client?.full_name || client?.email || userId;
  };

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
                      value={getAssignedUserId(a.id) || "unassigned"}
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
