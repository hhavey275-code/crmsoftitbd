import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/StatusBadge";
import { SpendProgressBar } from "@/components/SpendProgressBar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Check, X, ExternalLink, User } from "lucide-react";

export default function AdAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = role === "admin";

  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: account, isLoading } = useQuery({
    queryKey: ["ad-account-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_accounts")
        .select("*, business_managers(name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  const { data: assignments } = useQuery({
    queryKey: ["ad-account-assignments", id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("user_ad_accounts")
        .select("*")
        .eq("ad_account_id", id!);
      return (data as any[]) ?? [];
    },
    enabled: !!id && isAdmin,
  });

  const { data: clients } = useQuery({
    queryKey: ["admin-clients-list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, email");
      return (data as any[]) ?? [];
    },
    enabled: isAdmin,
  });

  const assignedUserId = assignments?.[0]?.user_id ?? null;

  const assignMutation = useMutation({
    mutationFn: async (userId: string | null) => {
      await (supabase as any).from("user_ad_accounts").delete().eq("ad_account_id", id!);
      if (userId) {
        const { error } = await (supabase as any).from("user_ad_accounts").insert({
          user_id: userId,
          ad_account_id: id!,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Assignment updated");
      queryClient.invalidateQueries({ queryKey: ["ad-account-assignments", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-ad-accounts"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const renameMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("rename-ad-account", {
        body: { ad_account_id: id, new_name: newName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Renamed: ${data.old_name} → ${data.new_name}`);
      setIsRenaming(false);
      queryClient.invalidateQueries({ queryKey: ["ad-account-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["client-ad-accounts"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>
      </DashboardLayout>
    );
  }

  if (!account) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Button variant="ghost" onClick={() => navigate("/ad-accounts")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <p className="text-center text-muted-foreground py-10">Ad account not found</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Back button */}
        <Button variant="ghost" onClick={() => navigate("/ad-accounts")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Ad Accounts
        </Button>

        {/* Account Header */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
                  </svg>
                </div>
                <div>
                  {isRenaming ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="h-8 w-[280px]"
                        placeholder="New account name"
                        autoFocus
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => renameMutation.mutate()}
                        disabled={!newName.trim() || renameMutation.isPending}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => setIsRenaming(false)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-xl">{account.account_name}</CardTitle>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => { setNewName(account.account_name); setIsRenaming(true); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground font-mono mt-1">ID: {account.account_id.replace(/^act_/, '')}</p>
                </div>
              </div>
              <StatusBadge status={account.status} />
            </div>
          </CardHeader>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Spend Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Spend Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <SpendProgressBar amountSpent={Number(account.amount_spent)} spendCap={Number(account.spend_cap)} />
              <div className="mt-4">
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`https://business.facebook.com/billing_hub/accounts/details?asset_id=${account.account_id.replace(/^act_/, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    View Billing on Meta
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Business Manager</span>
                <span className="font-medium">{account.business_managers?.name || "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Business Name</span>
                <span className="font-medium">{account.business_name || "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">{new Date(account.created_at).toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>

          {/* Assignment (Admin only) */}
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Client Assignment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Label className="text-sm text-muted-foreground mb-2 block">Assigned To</Label>
                <Select
                  value={assignedUserId || "unassigned"}
                  onValueChange={(val) => assignMutation.mutate(val === "unassigned" ? null : val)}
                >
                  <SelectTrigger>
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
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
