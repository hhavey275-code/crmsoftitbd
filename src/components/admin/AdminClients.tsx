import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { Users, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export function AdminClients() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: clients, isLoading } = useQuery({
    queryKey: ["admin-clients"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      return (data as any[]) ?? [];
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ userId, newStatus }: { userId: string; newStatus: string }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ status: newStatus } as any)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: (_, { newStatus }) => {
      toast.success(`Client ${newStatus === "active" ? "activated" : "deactivated"} successfully`);
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const filtered = clients?.filter((c: any) => {
    const term = search.toLowerCase();
    return (
      !term ||
      c.full_name?.toLowerCase().includes(term) ||
      c.email?.toLowerCase().includes(term) ||
      c.company?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          Clients
        </h1>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Clients ({filtered?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
          ) : filtered?.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No clients found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered?.map((client: any) => {
                  const isActive = (client.status ?? "active") === "active";
                  return (
                    <TableRow
                      key={client.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/clients/${client.user_id}`)}
                    >
                      <TableCell className="font-medium">{client.full_name || "—"}</TableCell>
                      <TableCell>{client.email || "—"}</TableCell>
                      <TableCell>{client.company || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(client.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={isActive ? "active" : "inactive"} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={isActive ? "destructive" : "default"}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStatusMutation.mutate({
                              userId: client.user_id,
                              newStatus: isActive ? "inactive" : "active",
                            });
                          }}
                          disabled={toggleStatusMutation.isPending}
                        >
                          {isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
