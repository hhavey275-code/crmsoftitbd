import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/MetricCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { SpendProgressBar } from "@/components/SpendProgressBar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  User, Building2, Phone, CalendarDays, Wallet, MonitorSmartphone,
  CheckCircle, XCircle, TrendingUp, TrendingDown, DollarSign, CalendarIcon, Save,
  Plus, Minus, ArrowUpCircle, CreditCard, Shield, Receipt, ShoppingCart, RefreshCw, ListChecks, Search, LayoutDashboard, FileText
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";

export default function ClientDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [dateFrom, setDateFrom] = useState<Date | undefined>(startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState<Date | undefined>(endOfMonth(new Date()));
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState("");
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyInput, setCompanyInput] = useState("");
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [editingDueLimit, setEditingDueLimit] = useState(false);
  const [dueLimitInput, setDueLimitInput] = useState("");

  // Wallet adjust dialog
  const [walletDialogType, setWalletDialogType] = useState<"credit" | "debit" | null>(null);
  const [walletAmount, setWalletAmount] = useState("");
  const [walletNote, setWalletNote] = useState("");

  // Top-up dialog
  const [topUpDialogOpen, setTopUpDialogOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("");

  // Bulk assign/unassign
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignSelectedIds, setAssignSelectedIds] = useState<Set<string>>(new Set());
  const [unassignSelectedIds, setUnassignSelectedIds] = useState<Set<string>>(new Set());
  const [showUnassignCheckboxes, setShowUnassignCheckboxes] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["client-detail-profile", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("user_id", userId!).single();
      return data as any;
    },
    enabled: !!userId,
  });

  const { data: globalRate } = useQuery({
    queryKey: ["usd-rate"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "usd_rate").single();
      return data?.value ?? "120";
    },
  });

  const { data: wallet } = useQuery({
    queryKey: ["client-detail-wallet", userId],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("*").eq("user_id", userId!).single();
      return data as any;
    },
    enabled: !!userId,
  });

  const { data: adAccounts, refetch: refetchAdAccounts } = useQuery({
    queryKey: ["client-detail-ad-accounts", userId],
    queryFn: async () => {
      const { data: assignments } = await (supabase as any)
        .from("user_ad_accounts")
        .select("ad_account_id")
        .eq("user_id", userId!);
      if (!assignments || assignments.length === 0) return [];
      const ids = assignments.map((a: any) => a.ad_account_id);
      const { data } = await supabase.from("ad_accounts").select("*").in("id", ids);
      return (data as any[]) ?? [];
    },
    enabled: !!userId,
  });

  // All ad accounts for assign dialog
  const { data: allAdAccounts } = useQuery({
    queryKey: ["all-ad-accounts-for-assign"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("id, account_name, account_id");
      return (data as any[]) ?? [];
    },
    enabled: showAssignDialog,
  });

  const [insightsLoading, setInsightsLoading] = useState(false);

  const { data: insights, refetch: refetchInsights } = useQuery({
    queryKey: ["client-detail-insights", userId, adAccounts?.map((a: any) => a.id)],
    queryFn: async () => {
      if (!adAccounts || adAccounts.length === 0) return {};
      const ids = adAccounts.map((a: any) => a.id);
      const { data } = await supabase.functions.invoke("get-account-insights", {
        body: { ad_account_ids: ids, source: "cache" },
      });
      return data?.insights ?? {};
    },
    enabled: !!adAccounts && adAccounts.length > 0,
  });

  const { data: topUpTotal } = useQuery({
    queryKey: ["client-detail-topup-total", userId, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("top_up_requests")
        .select("amount")
        .eq("user_id", userId!)
        .eq("status", "approved");
      if (dateFrom) query = query.gte("created_at", dateFrom.toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query = query.lte("created_at", end.toISOString());
      }
      const { data } = await query;
      return (data as any[])?.reduce((sum: number, r: any) => sum + Number(r.amount), 0) ?? 0;
    },
    enabled: !!userId,
  });

  const { data: totalSpendingFiltered } = useQuery({
    queryKey: ["client-detail-spending", userId, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select("amount")
        .eq("user_id", userId!)
        .eq("type", "ad_topup");
      if (dateFrom) query = query.gte("created_at", dateFrom.toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query = query.lte("created_at", end.toISOString());
      }
      const { data } = await query;
      return (data as any[])?.reduce((sum: number, r: any) => sum + Math.abs(Number(r.amount)), 0) ?? 0;
    },
    enabled: !!userId,
  });

  const { data: transactions } = useQuery({
    queryKey: ["client-detail-transactions", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      return (data as any[]) ?? [];
    },
    enabled: !!userId,
  });

  // Fetch admin profiles for processed_by display
  const adminProfileIds = [
    ...new Set(
      (transactions ?? [])
        .map((tx: any) => {
          const pb = tx.processed_by || "";
          if (pb.startsWith("admin:")) return pb.split(":")[1];
          return null;
        })
        .filter(Boolean)
    ),
  ];

  const { data: allProfiles } = useQuery({
    queryKey: ["admin-profiles-for-tx", adminProfileIds.join(",")],
    queryFn: async () => {
      if (adminProfileIds.length === 0) return [];
      const { data } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", adminProfileIds);
      return (data as any[]) ?? [];
    },
    enabled: adminProfileIds.length > 0,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["client-detail-profile", userId] });
    queryClient.invalidateQueries({ queryKey: ["client-detail-wallet", userId] });
    queryClient.invalidateQueries({ queryKey: ["client-detail-transactions", userId] });
    queryClient.invalidateQueries({ queryKey: ["client-detail-ad-accounts", userId] });
  };

  // Save profile field mutation
  const saveProfileMutation = useMutation({
    mutationFn: async (fields: Record<string, any>) => {
      const { error } = await supabase.from("profiles").update(fields as any).eq("user_id", userId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated!");
      queryClient.invalidateQueries({ queryKey: ["client-detail-profile", userId] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Wallet adjust mutation
  const walletAdjustMutation = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(walletAmount);
      if (!amt || amt <= 0) throw new Error("Invalid amount");
      const currentBalance = Number(wallet?.balance ?? 0);
      const isCredit = walletDialogType === "credit";
      const newBalance = isCredit ? currentBalance + amt : currentBalance - amt;
      const txAmount = isCredit ? amt : -amt;

      const { error: walletErr } = await supabase
        .from("wallets")
        .update({ balance: newBalance } as any)
        .eq("user_id", userId!);
      if (walletErr) throw walletErr;

      const { error: txErr } = await supabase.from("transactions").insert({
        user_id: userId!,
        amount: txAmount,
        balance_after: newBalance,
        type: isCredit ? "admin_credit" : "admin_debit",
        description: walletNote.trim() || (isCredit ? "Admin added balance" : "Admin deducted balance"),
        processed_by: `admin:${currentUser!.id}`,
      } as any);
      if (txErr) throw txErr;
    },
    onSuccess: () => {
      toast.success(walletDialogType === "credit" ? "Balance added!" : "Balance deducted!");
      setWalletDialogType(null);
      setWalletAmount("");
      setWalletNote("");
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Top-up mutation (admin)
  const topUpMutation = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(topUpAmount);
      if (!amt || amt <= 0) throw new Error("Invalid amount");
      const { data, error } = await supabase.functions.invoke("spend-cap-update", {
        body: {
          ad_account_id: selectedAccountId,
          amount: amt,
          deduct_wallet: true,
          target_user_id: userId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Spend cap updated: $${Number(data.old_spend_cap).toLocaleString()} → $${Number(data.new_spend_cap).toLocaleString()}`);
      setTopUpDialogOpen(false);
      setSelectedAccountId("");
      setTopUpAmount("");
      invalidateAll();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const activeAccounts = adAccounts?.filter((a: any) => a.status === "active") ?? [];
  const disabledAccounts = adAccounts?.filter((a: any) => a.status !== "active") ?? [];
  const totalRemaining = adAccounts?.reduce((sum: number, a: any) => sum + (Number(a.spend_cap) - Number(a.amount_spent)), 0) ?? 0;
  const totalSpending = adAccounts?.reduce((sum: number, a: any) => sum + Number(a.amount_spent), 0) ?? 0;
  const isActive = (profile?.status ?? "active") === "active";
  const clientRate = profile?.usd_rate;
  const dueLimit = (profile as any)?.due_limit;
  const walletBalance = Number(wallet?.balance ?? 0);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{profile?.full_name || "Client Details"}</h1>
              <p className="text-xs text-muted-foreground">{profile?.email || ""}</p>
            </div>
            <StatusBadge status={isActive ? "active" : "inactive"} />
          </div>
          <Button
            className="bg-gradient-to-r from-primary to-blue-500 hover:from-primary/90 hover:to-blue-500/90 text-primary-foreground shadow-md shadow-primary/25 rounded-full px-5 font-semibold"
            onClick={() => { setTopUpDialogOpen(true); setSelectedAccountId(""); setTopUpAmount(""); }}
          >
            <ArrowUpCircle className="h-4 w-4 mr-2" />
            Top Up
          </Button>
        </div>

        {!isActive && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive font-medium">
            ⚠️ This account is currently frozen/inactive.
          </div>
        )}

        {/* Date Range Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Period:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-3 w-3" />
                {dateFrom ? format(dateFrom, "MMM d, yyyy") : "From"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <span className="text-muted-foreground">—</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-3 w-3" />
                {dateTo ? format(dateTo, "MMM d, yyyy") : "To"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>

        {/* Main Tabs: Client Info, Overview, Transactions */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-muted/60 p-1 rounded-lg">
            <TabsTrigger value="info" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <User className="h-3.5 w-3.5" />
              Client Info
            </TabsTrigger>
            <TabsTrigger value="overview" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="transactions" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Receipt className="h-3.5 w-3.5" />
              Transactions
            </TabsTrigger>
          </TabsList>

          {/* Client Info Tab */}
          <TabsContent value="info" className="mt-0">
            <Card className={cn("border-border/40 shadow-[0_2px_12px_rgba(0,0,0,0.04)]", !isActive && "border-destructive/50 bg-destructive/5")}>
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  Client Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {/* Full Name */}
                  <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 p-4 transition-colors hover:bg-muted/50">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Full Name</p>
                      <p className="font-semibold text-sm">{profile?.full_name || "—"}</p>
                    </div>
                  </div>

                  {/* Business Name - editable */}
                  <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 p-4 transition-colors hover:bg-muted/50">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                      <Building2 className="h-4 w-4 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Business Name</p>
                      {editingCompany ? (
                        <div className="flex items-center gap-1 mt-1">
                          <Input className="w-24 h-7 text-sm" value={companyInput} onChange={(e) => setCompanyInput(e.target.value)} />
                          <Button size="icon" className="h-7 w-7" onClick={() => { saveProfileMutation.mutate({ company: companyInput }); setEditingCompany(false); }}>
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingCompany(false)}>
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <p className="font-semibold text-sm cursor-pointer hover:text-primary transition-colors" onClick={() => { setCompanyInput(profile?.company ?? ""); setEditingCompany(true); }}>
                          {profile?.company || "—"}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Phone - editable */}
                  <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 p-4 transition-colors hover:bg-muted/50">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                      <Phone className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Phone Number</p>
                      {editingPhone ? (
                        <div className="flex items-center gap-1 mt-1">
                          <Input className="w-28 h-7 text-sm" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} />
                          <Button size="icon" className="h-7 w-7" onClick={() => { saveProfileMutation.mutate({ phone: phoneInput }); setEditingPhone(false); }}>
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingPhone(false)}>
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <p className="font-semibold text-sm cursor-pointer hover:text-primary transition-colors" onClick={() => { setPhoneInput(profile?.phone ?? ""); setEditingPhone(true); }}>
                          {profile?.phone || "—"}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Onboarding Date */}
                  <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 p-4 transition-colors hover:bg-muted/50">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                      <CalendarDays className="h-4 w-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Onboarding Date</p>
                      <p className="font-semibold text-sm">
                        {profile?.created_at ? format(new Date(profile.created_at), "MMM d, yyyy") : "—"}
                      </p>
                    </div>
                  </div>

                  {/* USD Rate - editable */}
                  <div className="flex items-center gap-3 rounded-xl border border-cyan-200/60 bg-cyan-50/40 dark:bg-cyan-950/20 dark:border-cyan-800/40 p-4 transition-colors hover:bg-cyan-50/60">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10">
                      <DollarSign className="h-4 w-4 text-cyan-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">USD Rate</p>
                      {editingRate ? (
                        <div className="flex items-center gap-1 mt-1">
                          <Input type="number" step="0.01" className="w-20 h-7 text-sm" value={rateInput} onChange={(e) => setRateInput(e.target.value)} placeholder="e.g. 125" />
                          <Button size="icon" className="h-7 w-7" onClick={() => { saveProfileMutation.mutate({ usd_rate: rateInput.trim() === "" ? null : parseFloat(rateInput) }); setEditingRate(false); }}>
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingRate(false)}>
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <p className="font-semibold text-sm text-cyan-700 dark:text-cyan-400 cursor-pointer hover:text-cyan-500 transition-colors" onClick={() => { setRateInput(clientRate?.toString() ?? ""); setEditingRate(true); }}>
                          {clientRate ? `৳${clientRate}` : `Global (৳${globalRate})`}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Due Limit - editable */}
                  <div className="flex items-center gap-3 rounded-xl border border-amber-200/60 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-800/40 p-4 transition-colors hover:bg-amber-50/60">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                      <Shield className="h-4 w-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Due Limit</p>
                      {editingDueLimit ? (
                        <div className="flex items-center gap-1 mt-1">
                          <Input type="number" step="1" className="w-20 h-7 text-sm" value={dueLimitInput} onChange={(e) => setDueLimitInput(e.target.value)} placeholder="e.g. 500" />
                          <Button size="icon" className="h-7 w-7" onClick={() => { saveProfileMutation.mutate({ due_limit: dueLimitInput.trim() === "" ? null : parseFloat(dueLimitInput) } as any); setEditingDueLimit(false); }}>
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingDueLimit(false)}>
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <p className="font-semibold text-sm text-amber-700 dark:text-amber-400 cursor-pointer hover:text-amber-500 transition-colors" onClick={() => { setDueLimitInput(dueLimit?.toString() ?? ""); setEditingDueLimit(true); }}>
                          {dueLimit ? `$${Number(dueLimit).toLocaleString()}` : "No due limit"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-5 mt-0">
            {/* Today's Performance */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Today's Performance</h3>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={insightsLoading || !adAccounts || adAccounts.length === 0}
                onClick={async () => {
                  if (!adAccounts || adAccounts.length === 0) return;
                  setInsightsLoading(true);
                  try {
                    const ids = adAccounts.map((a: any) => a.id);
                    await supabase.functions.invoke("get-account-insights", {
                      body: { ad_account_ids: ids, source: "meta" },
                    });
                    await refetchInsights();
                    toast.success("Insights updated from Meta!");
                  } catch {
                    toast.error("Failed to update from Meta");
                  } finally {
                    setInsightsLoading(false);
                  }
                }}
              >
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", insightsLoading && "animate-spin")} />
                {insightsLoading ? "Updating..." : "Update from Meta"}
              </Button>
            </div>
            <Card className="bg-card/50 border-border/40 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
              <CardContent className="p-4">
                {/* Row 1: 5 cards */}
                <div className="grid gap-2 grid-cols-2 lg:grid-cols-5">
                  <div className="relative">
                     <MetricCard
                      title="Wallet Balance"
                      value={`$${walletBalance.toLocaleString()}`}
                      icon={Wallet}
                      iconBg="bg-green-100 dark:bg-green-900/50"
                      iconColor="text-green-600"
                      size="sm"
                    />
                    <div className="absolute top-1.5 right-1.5 flex gap-0.5">
                      <Button size="icon" variant="ghost" className="h-5 w-5 text-green-600 hover:bg-green-100" onClick={() => { setWalletDialogType("credit"); setWalletAmount(""); setWalletNote(""); }}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-5 w-5 text-red-600 hover:bg-red-100" onClick={() => { setWalletDialogType("debit"); setWalletAmount(""); setWalletNote(""); }}>
                        <Minus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <MetricCard title="Total Ad Accounts" value={adAccounts?.length ?? 0} icon={MonitorSmartphone} iconBg="bg-blue-100 dark:bg-blue-900/50" iconColor="text-blue-600" size="sm" />
                  <MetricCard title="Active Accounts" value={activeAccounts.length} icon={CheckCircle} iconBg="bg-emerald-100 dark:bg-emerald-900/50" iconColor="text-emerald-600" size="sm" />
                  <MetricCard title="Disabled Accounts" value={disabledAccounts.length} icon={XCircle} iconBg="bg-red-100 dark:bg-red-900/50" iconColor="text-red-600" size="sm" />
                  <MetricCard title="Remaining Balance" value={`$${totalRemaining.toLocaleString()}`} subtitle="All ad accounts" icon={Wallet} iconBg="bg-indigo-100 dark:bg-indigo-900/50" iconColor="text-indigo-600" size="sm" />
                </div>
                {/* Row 2: 4 cards */}
                <div className="grid gap-2 grid-cols-2 lg:grid-cols-4 mt-2">
                  <MetricCard
                    title="Today's Spend"
                    value={`$${(insights ? Object.values(insights).reduce((sum: number, i: any) => sum + Number(i.today_spend ?? 0), 0) : 0).toLocaleString()}`}
                    subtitle={`Yesterday: $${(insights ? Object.values(insights).reduce((sum: number, i: any) => sum + Number(i.yesterday_spend ?? 0), 0) : 0).toLocaleString()}`}
                    icon={DollarSign}
                    iconBg="bg-emerald-100 dark:bg-emerald-900/50"
                    iconColor="text-emerald-600"
                    size="sm"
                  />
                  <MetricCard
                    title="Today's Orders"
                    value={(insights ? Object.values(insights).reduce((sum: number, i: any) => sum + Number(i.today_orders ?? 0), 0) : 0).toLocaleString()}
                    subtitle={`Yesterday: ${(insights ? Object.values(insights).reduce((sum: number, i: any) => sum + Number(i.yesterday_orders ?? 0), 0) : 0).toLocaleString()}`}
                    icon={ShoppingCart}
                    iconBg="bg-blue-100 dark:bg-blue-900/50"
                    iconColor="text-blue-600"
                    size="sm"
                  />
                  <MetricCard title="Total Top-Up" value={`$${Number(topUpTotal ?? 0).toLocaleString()}`} subtitle={dateFrom && dateTo ? `${format(dateFrom, "MMM d")} - ${format(dateTo, "MMM d, yyyy")}` : "All time"} icon={TrendingUp} iconBg="bg-orange-100 dark:bg-orange-900/50" iconColor="text-orange-600" size="sm" />
                  <MetricCard title="Total Spending" value={`$${(totalSpendingFiltered ?? totalSpending).toLocaleString()}`} subtitle={dateFrom && dateTo ? `${format(dateFrom, "MMM d")} - ${format(dateTo, "MMM d, yyyy")}` : "All time"} icon={TrendingDown} iconBg="bg-purple-100 dark:bg-purple-900/50" iconColor="text-purple-600" size="sm" />
                </div>
              </CardContent>
            </Card>

            {/* Ad Accounts Table */}
            <Card className="border-border/40 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base font-semibold">Ad Accounts ({adAccounts?.length ?? 0})</CardTitle>
                <div className="flex items-center gap-2">
                  {showUnassignCheckboxes && unassignSelectedIds.size > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={async () => {
                        const ids = Array.from(unassignSelectedIds);
                        for (const adAccountId of ids) {
                          await (supabase as any).from("user_ad_accounts").delete().eq("user_id", userId!).eq("ad_account_id", adAccountId);
                        }
                        toast.success(`${ids.length} account(s) unassigned`);
                        setUnassignSelectedIds(new Set());
                        setShowUnassignCheckboxes(false);
                        refetchAdAccounts();
                        queryClient.invalidateQueries({ queryKey: ["admin-user-ad-accounts"] });
                      }}
                    >
                      Unassign {unassignSelectedIds.size} Selected
                    </Button>
                  )}
                  <Button
                    variant={showUnassignCheckboxes ? "secondary" : "ghost"}
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => {
                      setShowUnassignCheckboxes(v => !v);
                      if (showUnassignCheckboxes) setUnassignSelectedIds(new Set());
                    }}
                    title="Toggle selection"
                  >
                    <ListChecks className="h-4 w-4" />
                  </Button>
                  <Button size="sm" className="rounded-full" onClick={() => { setShowAssignDialog(true); setAssignSelectedIds(new Set()); setAssignSearch(""); }}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Assign
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {adAccounts?.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No ad accounts assigned</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          {showUnassignCheckboxes && (
                            <TableHead className="w-[40px]">
                              <Checkbox
                                checked={adAccounts?.length > 0 && adAccounts?.every((a: any) => unassignSelectedIds.has(a.id))}
                                onCheckedChange={() => {
                                  if (adAccounts?.every((a: any) => unassignSelectedIds.has(a.id))) {
                                    setUnassignSelectedIds(new Set());
                                  } else {
                                    setUnassignSelectedIds(new Set(adAccounts?.map((a: any) => a.id)));
                                  }
                                }}
                              />
                            </TableHead>
                          )}
                          <TableHead className="w-[35%]">Account</TableHead>
                          <TableHead className="w-[20%]">Status</TableHead>
                          <TableHead className="w-[30%]">Spend Progress</TableHead>
                          <TableHead className="w-[15%] text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {adAccounts?.map((acc: any) => (
                          <TableRow key={acc.id}>
                            {showUnassignCheckboxes && (
                              <TableCell>
                                <Checkbox
                                  checked={unassignSelectedIds.has(acc.id)}
                                  onCheckedChange={() => {
                                    setUnassignSelectedIds(prev => {
                                      const next = new Set(prev);
                                      if (next.has(acc.id)) next.delete(acc.id);
                                      else next.add(acc.id);
                                      return next;
                                    });
                                  }}
                                />
                              </TableCell>
                            )}
                            <TableCell>
                              <p className="font-medium text-sm">{acc.account_name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{acc.account_id}</p>
                            </TableCell>
                            <TableCell><StatusBadge status={acc.status} /></TableCell>
                            <TableCell>
                              <SpendProgressBar amountSpent={Number(acc.amount_spent)} spendCap={Number(acc.spend_cap)} />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                className="rounded-full bg-gradient-to-r from-primary to-blue-500 hover:from-primary/90 hover:to-blue-500/90 text-primary-foreground shadow-sm px-3 text-xs font-semibold"
                                onClick={() => { setSelectedAccountId(acc.id); setTopUpDialogOpen(true); setTopUpAmount(""); }}
                              >
                                <ArrowUpCircle className="h-3 w-3 mr-1" />
                                Top Up
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value="transactions" className="mt-0">
            <Card className="border-border/40 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Transaction History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Ad Account</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Balance After</TableHead>
                        <TableHead>Processed By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions?.map((tx: any) => {
                        const linkedAccount = tx.reference_id && tx.type === "ad_topup"
                          ? adAccounts?.find((a: any) => a.id === tx.reference_id)
                          : null;
                        const desc = tx.description || "—";
                        const hasNewline = desc.includes("\n");
                        const [descName, descId] = hasNewline ? desc.split("\n") : [desc, null];
                        const pb = tx.processed_by || "";
                        let processedByLabel = "—";
                        if (pb === "system") processedByLabel = "Auto Approved by System";
                        else if (pb.startsWith("admin:")) {
                          const adminId = pb.split(":")[1];
                          const adminProf = allProfiles?.find((p: any) => p.user_id === adminId);
                          processedByLabel = adminProf?.full_name || adminProf?.email || adminId.slice(0, 8);
                        } else if (pb.startsWith("client:")) {
                          processedByLabel = profile?.full_name || profile?.email || "Client";
                        }
                        return (
                          <TableRow key={tx.id}>
                            <TableCell className="text-muted-foreground whitespace-nowrap text-xs">{format(new Date(tx.created_at), "MMM d, yyyy HH:mm")}</TableCell>
                            <TableCell className="capitalize font-medium text-xs">{tx.type.replace(/_/g, " ")}</TableCell>
                            <TableCell className="text-xs">
                              {hasNewline ? (
                                <div>
                                  <span>{descName}</span>
                                  <span className="block text-[11px] text-muted-foreground">{descId}</span>
                                </div>
                              ) : desc}
                            </TableCell>
                            <TableCell className="text-xs">
                              {linkedAccount ? (
                                <div>
                                  <p className="font-medium">{linkedAccount.account_name}</p>
                                  <p className="text-[11px] text-muted-foreground font-mono">{linkedAccount.account_id.replace(/^act_/, "")}</p>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className={cn("font-semibold text-xs", Number(tx.amount) >= 0 ? "text-green-600" : "text-red-600")}>
                              {Number(tx.amount) >= 0 ? "+" : ""}${Math.abs(Number(tx.amount)).toLocaleString()}
                            </TableCell>
                            <TableCell className="font-medium text-xs">${Number(tx.balance_after ?? 0).toLocaleString()}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{processedByLabel}</TableCell>
                          </TableRow>
                        );
                      })}
                      {(!transactions || transactions.length === 0) && (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No transactions yet</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Assign Accounts Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign Ad Accounts</DialogTitle>
            <DialogDescription>Select accounts to assign to this client.</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or ID..."
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className="max-h-[50vh] overflow-y-auto space-y-1">
              {(() => {
                const assignedIds = new Set(adAccounts?.map((a: any) => a.id) ?? []);
                const q = assignSearch.toLowerCase();
                const unassigned = (allAdAccounts?.filter((a: any) => {
                  if (assignedIds.has(a.id)) return false;
                  if (q && !a.account_name?.toLowerCase().includes(q) && !a.account_id?.toLowerCase().includes(q)) return false;
                  return true;
                }) ?? []);
                if (unassigned.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">No unassigned accounts found</p>;
                return unassigned.map((acc: any) => (
                  <label key={acc.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer">
                    <Checkbox
                      checked={assignSelectedIds.has(acc.id)}
                      onCheckedChange={() => {
                        setAssignSelectedIds(prev => {
                          const next = new Set(prev);
                          if (next.has(acc.id)) next.delete(acc.id);
                          else next.add(acc.id);
                          return next;
                        });
                      }}
                    />
                    <div>
                      <p className="text-sm font-medium">{acc.account_name}</p>
                      <p className="text-xs text-muted-foreground">{acc.account_id}</p>
                    </div>
                  </label>
                ));
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>Cancel</Button>
            <Button
              disabled={assignSelectedIds.size === 0}
              onClick={async () => {
                const ids = Array.from(assignSelectedIds);
                const { error } = await (supabase as any).from("user_ad_accounts").insert(
                  ids.map(adAccountId => ({ user_id: userId, ad_account_id: adAccountId }))
                );
                if (error) { toast.error(error.message); return; }
                toast.success(`${ids.length} account(s) assigned`);
                setShowAssignDialog(false);
                setAssignSelectedIds(new Set());
                refetchAdAccounts();
                queryClient.invalidateQueries({ queryKey: ["admin-user-ad-accounts"] });
              }}
            >
              Assign {assignSelectedIds.size > 0 ? `${assignSelectedIds.size} ` : ""}Selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wallet Adjust Dialog */}
      <Dialog open={!!walletDialogType} onOpenChange={(open) => !open && setWalletDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{walletDialogType === "credit" ? "Add Balance" : "Deduct Balance"}</DialogTitle>
            <DialogDescription>
              Current balance: <span className="font-semibold">${walletBalance.toLocaleString()}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Amount (USD)</Label>
              <Input type="number" min="0.01" step="0.01" value={walletAmount} onChange={(e) => setWalletAmount(e.target.value)} placeholder="100.00" />
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Textarea value={walletNote} onChange={(e) => setWalletNote(e.target.value)} placeholder="Reason for adjustment..." rows={2} />
            </div>
            {walletDialogType === "credit" && parseFloat(walletAmount) > 0 && (
              <p className="text-sm text-muted-foreground">New balance: <span className="font-semibold text-green-600">${(walletBalance + parseFloat(walletAmount)).toLocaleString()}</span></p>
            )}
            {walletDialogType === "debit" && parseFloat(walletAmount) > 0 && (
              <p className="text-sm text-muted-foreground">New balance: <span className={cn("font-semibold", (walletBalance - parseFloat(walletAmount)) < 0 ? "text-red-600" : "text-green-600")}>${(walletBalance - parseFloat(walletAmount)).toLocaleString()}</span></p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWalletDialogType(null)}>Cancel</Button>
            <Button onClick={() => walletAdjustMutation.mutate()} disabled={!walletAmount || parseFloat(walletAmount) <= 0 || walletAdjustMutation.isPending}>
              {walletAdjustMutation.isPending ? "Processing..." : walletDialogType === "credit" ? "Add Balance" : "Deduct Balance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Top Up Dialog */}
      <Dialog open={topUpDialogOpen} onOpenChange={(open) => !open && setTopUpDialogOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Top Up Ad Account</DialogTitle>
            <DialogDescription>Select an ad account and enter amount. Wallet balance will be deducted.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex justify-between items-center text-sm p-3 rounded-lg bg-muted">
              <span className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Client Wallet</span>
              <span className={cn("font-semibold", walletBalance < 0 ? "text-red-600" : "")}>${walletBalance.toLocaleString()}</span>
            </div>
            <div className="space-y-2">
              <Label>Ad Account</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger><SelectValue placeholder="Select ad account" /></SelectTrigger>
                <SelectContent>
                  {adAccounts?.map((acc: any) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.account_name} ({acc.account_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (USD)</Label>
              <Input type="number" min="1" step="0.01" value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} placeholder="500.00" />
            </div>
            {selectedAccountId && parseFloat(topUpAmount) > 0 && (
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Spend Cap</span>
                  <span className="font-medium">${Number(adAccounts?.find((a: any) => a.id === selectedAccountId)?.spend_cap ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">New Spend Cap</span>
                  <span className="font-medium text-primary">${(Number(adAccounts?.find((a: any) => a.id === selectedAccountId)?.spend_cap ?? 0) + parseFloat(topUpAmount)).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Wallet After</span>
                  <span className={cn("font-medium", (walletBalance - parseFloat(topUpAmount)) < 0 ? "text-red-600" : "")}>
                    ${(walletBalance - parseFloat(topUpAmount)).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopUpDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-gradient-to-r from-primary to-blue-500 hover:from-primary/90 hover:to-blue-500/90 text-primary-foreground"
              onClick={() => topUpMutation.mutate()}
              disabled={!selectedAccountId || !topUpAmount || parseFloat(topUpAmount) <= 0 || topUpMutation.isPending}
            >
              {topUpMutation.isPending ? "Processing..." : "Top Up Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
