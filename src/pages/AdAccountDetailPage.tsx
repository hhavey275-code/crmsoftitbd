import { useState, useMemo } from "react";
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
import { MetricCard } from "@/components/MetricCard";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Check, X, ExternalLink, User, RefreshCw, Megaphone, DollarSign, ShoppingCart, MessageSquare, ChevronsUpDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { AdAccountPartners } from "@/components/admin/AdAccountPartners";
import { AdAccountPaymentMethods } from "@/components/admin/AdAccountPaymentMethods";

export default function AdAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [updatingMeta, setUpdatingMeta] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [lastMetaUpdate, setLastMetaUpdate] = useState<number>(0);

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

  const { data: insights } = useQuery({
    queryKey: ["ad-account-insights-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-account-insights", {
        body: { ad_account_ids: [id], source: "cache" },
      });
      if (error) throw error;
      return data?.insights?.[id!] ?? null;
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

  const handleUpdateFromMeta = async () => {
    // Rate limit for non-admin users: 15 minutes cooldown
    if (!isAdmin) {
      const now = Date.now();
      const elapsed = now - lastMetaUpdate;
      const cooldown = 15 * 60 * 1000;
      if (elapsed < cooldown) {
        const remainingMin = Math.ceil((cooldown - elapsed) / 60000);
        toast.error(`Please wait ${remainingMin} minute(s) before updating again.`);
        return;
      }
    }

    setUpdatingMeta(true);
    try {
      const { error } = await supabase.functions.invoke("get-account-insights", {
        body: { ad_account_ids: [id], source: "meta" },
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["ad-account-insights-detail", id] });
      if (!isAdmin) setLastMetaUpdate(Date.now());
      toast.success("Data updated from Meta");
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("non-2xx")) {
        toast.error("Meta API request failed. Please try again.");
      } else {
        toast.error(msg || "Failed to update from Meta");
      }
    } finally {
      setUpdatingMeta(false);
    }
  };

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
          <Button variant="ghost" onClick={() => navigate(-1)}>
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
        {/* Back button & Update */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Back to Ad Accounts</span>
            <span className="sm:hidden">Back</span>
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            {insights?.updated_at && (
              <span className="text-xs text-muted-foreground">
                Updated: {new Date(insights.updated_at).toLocaleString()}
              </span>
            )}
            <Button onClick={handleUpdateFromMeta} disabled={updatingMeta} size="sm">
              <RefreshCw className={`h-4 w-4 mr-1 ${updatingMeta ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Update from Meta</span>
              <span className="sm:hidden">Update</span>
            </Button>
          </div>
        </div>

        {/* Performance Metric Cards */}
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Running Campaigns"
            value={insights?.active_campaigns ?? 0}
            icon={Megaphone}
            iconBg="bg-blue-500/10"
            iconColor="text-blue-500"
            size={isMobile ? "xs" : "default"}
          />
          <MetricCard
            title="Today's Spend"
            value={`$${(insights?.today_spend ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            subtitle={`Yesterday: $${(insights?.yesterday_spend ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={DollarSign}
            iconBg="bg-green-500/10"
            iconColor="text-green-500"
            size={isMobile ? "xs" : "default"}
          />
          <MetricCard
            title="Today's Orders"
            value={insights?.today_orders ?? 0}
            subtitle={`Yesterday: ${insights?.yesterday_orders ?? 0}`}
            icon={ShoppingCart}
            iconBg="bg-orange-500/10"
            iconColor="text-orange-500"
            size={isMobile ? "xs" : "default"}
          />
          <MetricCard
            title="Today's Messages"
            value={insights?.today_messages ?? 0}
            subtitle={`Yesterday: ${insights?.yesterday_messages ?? 0}`}
            icon={MessageSquare}
            iconBg="bg-purple-500/10"
            iconColor="text-purple-500"
            size={isMobile ? "xs" : "default"}
          />
        </div>

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
                        className="h-8 w-full max-w-[280px]"
                        placeholder="New account name"
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => renameMutation.mutate()} disabled={!newName.trim() || renameMutation.isPending}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsRenaming(false)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-xl">{account.account_name}</CardTitle>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setNewName(account.account_name); setIsRenaming(true); }}>
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
              <SpendProgressBar amountSpent={Number(account.amount_spent)} spendCap={Number(account.spend_cap)} balanceAfterTopup={Number((account as any).balance_after_topup ?? 0)} />
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
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      {assignedUserId
                        ? clients?.find((c: any) => c.user_id === assignedUserId)?.full_name ||
                          clients?.find((c: any) => c.user_id === assignedUserId)?.email ||
                          "Assigned"
                        : "Unassigned"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0">
                    <Command>
                      <CommandInput placeholder="Search client..." />
                      <CommandList>
                        <CommandEmpty>No client found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="unassigned"
                            onSelect={() => assignMutation.mutate(null)}
                          >
                            <Check className={`mr-2 h-4 w-4 ${!assignedUserId ? "opacity-100" : "opacity-0"}`} />
                            Unassigned
                          </CommandItem>
                          {clients?.map((c: any) => (
                            <CommandItem
                              key={c.user_id}
                              value={`${c.full_name || ""} ${c.email || ""}`}
                              onSelect={() => assignMutation.mutate(c.user_id)}
                            >
                              <Check className={`mr-2 h-4 w-4 ${assignedUserId === c.user_id ? "opacity-100" : "opacity-0"}`} />
                              {c.full_name || c.email || c.user_id}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </CardContent>
            </Card>
          )}

          {/* Payment Methods (Admin only) */}
          {isAdmin && id && (
            <AdAccountPaymentMethods
              adAccountId={id}
              currentCards={
                Array.isArray(insights?.cards)
                  ? (insights.cards as { id?: string; display_string: string }[])
                  : []
              }
            />
          )}

          {/* Partner BMs (Admin only) */}
          {isAdmin && id && <AdAccountPartners adAccountId={id} />}
        </div>
      </div>
    </DashboardLayout>
  );
}
