import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { Users, Search, Clock, CheckCircle, Shield, LogIn } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";

const ALL_MENU_KEYS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "clients", label: "Clients" },
  { key: "ad-accounts", label: "Ad Accounts" },
  { key: "billings", label: "Billings" },
  { key: "business-managers", label: "Business Managers" },
  { key: "top-up", label: "Top-Up Request" },
  { key: "transactions", label: "Transactions" },
  { key: "banks", label: "Banks" },
  { key: "settings", label: "Settings" },
];

export function AdminClients() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isSuperAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [permDialogUser, setPermDialogUser] = useState<any>(null);
  const [selectedMenuKeys, setSelectedMenuKeys] = useState<string[]>([]);

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

  const { data: allRoles } = useQuery({
    queryKey: ["all-user-roles"],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("*");
      return (data as any[]) ?? [];
    },
    enabled: isSuperAdmin,
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ userId, newStatus }: { userId: string; newStatus: string }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ status: newStatus })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: (_, { newStatus }) => {
      toast.success(`Client ${newStatus === "active" ? "activated" : "deactivated"} successfully`);
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const promoteToAdminMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("user_roles").update({ role: "admin" } as any).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User promoted to Admin!");
      queryClient.invalidateQueries({ queryKey: ["all-user-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const demoteToClientMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("user_roles").update({ role: "client" } as any).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User demoted to Client!");
      queryClient.invalidateQueries({ queryKey: ["all-user-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const impersonateMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      
      const res = await supabase.functions.invoke("impersonate-client", {
        body: { target_user_id: targetUserId },
      });
      
      if (res.error) throw new Error(res.error.message || "Failed to impersonate");
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      if (data?.url) {
        window.open(data.url, "_blank");
        toast.success("Opening client dashboard in new tab...");
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Menu permissions
  const { data: userMenuPerms } = useQuery({
    queryKey: ["menu-perms", permDialogUser?.user_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("menu_permissions")
        .select("menu_key")
        .eq("user_id", permDialogUser!.user_id);
      return (data as any[])?.map((p: any) => p.menu_key) ?? [];
    },
    enabled: !!permDialogUser,
  });

  const savePermsMutation = useMutation({
    mutationFn: async () => {
      const userId = permDialogUser.user_id;
      // Delete existing
      await (supabase as any).from("menu_permissions").delete().eq("user_id", userId);
      // Insert new
      if (selectedMenuKeys.length > 0) {
        const rows = selectedMenuKeys.map(key => ({ user_id: userId, menu_key: key }));
        const { error } = await (supabase as any).from("menu_permissions").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Menu permissions saved!");
      setPermDialogUser(null);
      queryClient.invalidateQueries({ queryKey: ["menu-perms"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const getUserRole = (userId: string) => {
    return allRoles?.find((r: any) => r.user_id === userId)?.role ?? "client";
  };

  const filtered = clients?.filter((c: any) => {
    const term = search.toLowerCase();
    return (
      !term ||
      c.full_name?.toLowerCase().includes(term) ||
      c.email?.toLowerCase().includes(term) ||
      c.company?.toLowerCase().includes(term)
    );
  });

  const pendingClients = filtered?.filter((c: any) => c.status === "pending") ?? [];
  const activeClients = filtered?.filter((c: any) => c.status !== "pending") ?? [];

  const renderTable = (items: any[], showApprove = false) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Company</TableHead>
          <TableHead>Joined</TableHead>
          <TableHead>Status</TableHead>
          {isSuperAdmin && <TableHead>Role</TableHead>}
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((client: any) => {
          const isActive = (client.status ?? "active") === "active";
          const isPending = client.status === "pending";
          const userRole = isSuperAdmin ? getUserRole(client.user_id) : null;
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
                <StatusBadge status={isPending ? "pending" : isActive ? "active" : "inactive"} />
              </TableCell>
              {isSuperAdmin && (
                <TableCell>
                  <span className="capitalize text-xs font-medium px-2 py-1 rounded-full bg-muted">{userRole}</span>
                </TableCell>
              )}
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  {isPending ? (
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => toggleStatusMutation.mutate({ userId: client.user_id, newStatus: "active" })}
                      disabled={toggleStatusMutation.isPending}
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1" />
                      Approve
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant={isActive ? "destructive" : "default"}
                      onClick={() => toggleStatusMutation.mutate({
                        userId: client.user_id,
                        newStatus: isActive ? "inactive" : "active",
                      })}
                      disabled={toggleStatusMutation.isPending}
                    >
                      {isActive ? "Deactivate" : "Activate"}
                    </Button>
                  )}
                  {isSuperAdmin && userRole === "client" && !isPending && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => promoteToAdminMutation.mutate(client.user_id)}
                      disabled={promoteToAdminMutation.isPending}
                    >
                      Make Admin
                    </Button>
                  )}
                  {isSuperAdmin && userRole === "admin" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => demoteToClientMutation.mutate(client.user_id)}
                        disabled={demoteToClientMutation.isPending}
                      >
                        Demote
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPermDialogUser(client);
                          setSelectedMenuKeys([]); // will be loaded from query
                        }}
                      >
                        <Shield className="h-3.5 w-3.5 mr-1" />
                        Menus
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
        {items.length === 0 && (
          <TableRow>
            <TableCell colSpan={isSuperAdmin ? 7 : 6} className="text-center text-muted-foreground py-8">No clients found</TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  // Sync menu perms when dialog opens
  if (permDialogUser && userMenuPerms && selectedMenuKeys.length === 0 && userMenuPerms.length > 0) {
    setSelectedMenuKeys(userMenuPerms);
  }

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

      <Tabs defaultValue={pendingClients.length > 0 ? "pending" : "all"}>
        <TabsList>
          <TabsTrigger value="all">
            All Clients ({activeClients.length})
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Pending Approval ({pendingClients.length})
            {pendingClients.length > 0 && (
              <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                {pendingClients.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">All Clients</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
              ) : renderTable(activeClients)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                Pending Approval
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
              ) : renderTable(pendingClients, true)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Menu Permissions Dialog */}
      <Dialog open={!!permDialogUser} onOpenChange={(open) => !open && setPermDialogUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Menu Permissions</DialogTitle>
            <DialogDescription>
              Control which menus <strong>{permDialogUser?.full_name || permDialogUser?.email}</strong> can access.
              {selectedMenuKeys.length === 0 && " (No restrictions = full access)"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {ALL_MENU_KEYS.map(item => (
              <div key={item.key} className="flex items-center gap-3">
                <Checkbox
                  id={`perm-${item.key}`}
                  checked={selectedMenuKeys.includes(item.key)}
                  onCheckedChange={(checked) => {
                    setSelectedMenuKeys(prev =>
                      checked ? [...prev, item.key] : prev.filter(k => k !== item.key)
                    );
                  }}
                />
                <Label htmlFor={`perm-${item.key}`} className="cursor-pointer">{item.label}</Label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermDialogUser(null)}>Cancel</Button>
            <Button onClick={() => savePermsMutation.mutate()} disabled={savePermsMutation.isPending}>
              {savePermsMutation.isPending ? "Saving..." : "Save Permissions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
