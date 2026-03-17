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
  Plus, Minus, ArrowUpCircle, CreditCard, Shield, Receipt, ShoppingCart, RefreshCw
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Client Details</h1>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => { setTopUpDialogOpen(true); setSelectedAccountId(""); setTopUpAmount(""); }}
          >
            <ArrowUpCircle className="h-4 w-4 mr-2" />
            Top Up
          </Button>
        </div>

        {/* Client Info Card */}
        <Card className={!isActive ? "border-destructive/50 bg-destructive/5" : ""}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Client Information
              <span className="ml-auto">
                <StatusBadge status={isActive ? "active" : "inactive"} />
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {/* Full Name */}
              <div className="flex items-center gap-3 rounded-lg border p-4">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Full Name</p>
                  <p className="font-medium">{profile?.full_name || "—"}</p>
                </div>
              </div>

              {/* Business Name - editable */}
              <div className="flex items-center gap-3 rounded-lg border p-4">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Business Name</p>
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
                    <p className="font-medium cursor-pointer hover:underline" onClick={() => { setCompanyInput(profile?.company ?? ""); setEditingCompany(true); }}>
                      {profile?.company || "—"}
                    </p>
                  )}
                </div>
              </div>

              {/* Phone - editable */}
              <div className="flex items-center gap-3 rounded-lg border p-4">
                <Phone className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Phone Number</p>
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
                    <p className="font-medium cursor-pointer hover:underline" onClick={() => { setPhoneInput(profile?.phone ?? ""); setEditingPhone(true); }}>
                      {profile?.phone || "—"}
                    </p>
                  )}
                </div>
              </div>

              {/* Onboarding Date */}
              <div className="flex items-center gap-3 rounded-lg border p-4">
                <CalendarDays className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Onboarding Date</p>
                  <p className="font-medium">
                    {profile?.created_at ? format(new Date(profile.created_at), "MMM d, yyyy") : "—"}
                  </p>
                </div>
              </div>

              {/* USD Rate - editable */}
              <div className="flex items-center gap-3 rounded-lg border border-cyan-200 bg-cyan-50/50 dark:bg-cyan-950/20 dark:border-cyan-800 p-4">
                <DollarSign className="h-5 w-5 text-cyan-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">USD Rate</p>
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
                    <p className="font-medium text-cyan-700 dark:text-cyan-400 cursor-pointer hover:underline" onClick={() => { setRateInput(clientRate?.toString() ?? ""); setEditingRate(true); }}>
                      {clientRate ? `৳${clientRate}` : `Global (৳${globalRate})`}
                    </p>
                  )}
                </div>
              </div>

              {/* Due Limit - editable */}
              <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
                <Shield className="h-5 w-5 text-amber-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Due Limit</p>
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
                    <p className="font-medium text-amber-700 dark:text-amber-400 cursor-pointer hover:underline" onClick={() => { setDueLimitInput(dueLimit?.toString() ?? ""); setEditingDueLimit(true); }}>
                      {dueLimit ? `$${Number(dueLimit).toLocaleString()}` : "No due limit"}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {!isActive && (
              <div className="mt-4 rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive font-medium">
                ⚠️ This account is currently frozen/inactive.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs: Overview & Transaction History */}
        <Tabs defaultValue="overview" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
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

            <TabsList className="ml-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="transactions" className="flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5" />
                Transactions
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-6 mt-0">
            {/* Today's Performance */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">Today's Performance</h3>
              <Button
                variant="outline"
                size="sm"
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
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricCard
                title="Today's Spend"
                value={`$${(insights ? Object.values(insights).reduce((sum: number, i: any) => sum + Number(i.today_spend ?? 0), 0) : 0).toLocaleString()}`}
                subtitle={`Yesterday: $${(insights ? Object.values(insights).reduce((sum: number, i: any) => sum + Number(i.yesterday_spend ?? 0), 0) : 0).toLocaleString()}`}
                icon={DollarSign}
                iconBg="bg-emerald-100 dark:bg-emerald-900/50"
                iconColor="text-emerald-600"
                gradientClass="bg-gradient-to-br from-emerald-50 to-green-100/50 dark:from-emerald-950/40 dark:to-green-900/20 border-emerald-200 dark:border-emerald-800"
              />
              <MetricCard
                title="Today's Orders"
                value={(insights ? Object.values(insights).reduce((sum: number, i: any) => sum + Number(i.today_orders ?? 0), 0) : 0).toLocaleString()}
                subtitle={`Yesterday: ${(insights ? Object.values(insights).reduce((sum: number, i: any) => sum + Number(i.yesterday_orders ?? 0), 0) : 0).toLocaleString()}`}
                icon={ShoppingCart}
                iconBg="bg-blue-100 dark:bg-blue-900/50"
                iconColor="text-blue-600"
                gradientClass="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-900/20 border-blue-200 dark:border-blue-800"
              />
            </div>

            {/* Metric Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative">
                <MetricCard
                  title="Wallet Balance"
                  value={`$${walletBalance.toLocaleString()}`}
                  icon={Wallet}
                  iconBg="bg-green-100 dark:bg-green-900/50"
                  iconColor="text-green-600"
                  gradientClass="bg-gradient-to-br from-green-50 to-emerald-100/50 dark:from-green-950/40 dark:to-emerald-900/20 border-green-200 dark:border-green-800"
                />
                <div className="absolute top-2 right-2 flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:bg-green-100" onClick={() => { setWalletDialogType("credit"); setWalletAmount(""); setWalletNote(""); }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:bg-red-100" onClick={() => { setWalletDialogType("debit"); setWalletAmount(""); setWalletNote(""); }}>
                    <Minus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <MetricCard title="Total Ad Accounts" value={adAccounts?.length ?? 0} icon={MonitorSmartphone} iconBg="bg-blue-100 dark:bg-blue-900/50" iconColor="text-blue-600" gradientClass="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/40 dark:to-blue-900/20 border-blue-200 dark:border-blue-800" />
              <MetricCard title="Active Ad Accounts" value={activeAccounts.length} icon={CheckCircle} iconBg="bg-emerald-100 dark:bg-emerald-900/50" iconColor="text-emerald-600" gradientClass="bg-gradient-to-br from-emerald-50 to-green-100/50 dark:from-emerald-950/40 dark:to-green-900/20 border-emerald-200 dark:border-emerald-800" />
              <MetricCard title="Disabled Ad Accounts" value={disabledAccounts.length} icon={XCircle} iconBg="bg-red-100 dark:bg-red-900/50" iconColor="text-red-600" gradientClass="bg-gradient-to-br from-red-50 to-rose-100/50 dark:from-red-950/40 dark:to-rose-900/20 border-red-200 dark:border-red-800" />
              <MetricCard title="Total Top-Up" value={`$${Number(topUpTotal ?? 0).toLocaleString()}`} subtitle={dateFrom && dateTo ? `${format(dateFrom, "MMM d")} - ${format(dateTo, "MMM d, yyyy")}` : "All time"} icon={TrendingUp} iconBg="bg-orange-100 dark:bg-orange-900/50" iconColor="text-orange-600" gradientClass="bg-gradient-to-br from-orange-50 to-amber-100/50 dark:from-orange-950/40 dark:to-amber-900/20 border-orange-200 dark:border-orange-800" />
              <MetricCard title="Total Remaining Balance" value={`$${totalRemaining.toLocaleString()}`} subtitle="Across all ad accounts" icon={Wallet} iconBg="bg-indigo-100 dark:bg-indigo-900/50" iconColor="text-indigo-600" gradientClass="bg-gradient-to-br from-indigo-50 to-violet-100/50 dark:from-indigo-950/40 dark:to-violet-900/20 border-indigo-200 dark:border-indigo-800" />
              <MetricCard title="Total Spending" value={`$${(totalSpendingFiltered ?? totalSpending).toLocaleString()}`} subtitle={dateFrom && dateTo ? `${format(dateFrom, "MMM d")} - ${format(dateTo, "MMM d, yyyy")}` : "All time (cumulative)"} icon={TrendingDown} iconBg="bg-purple-100 dark:bg-purple-900/50" iconColor="text-purple-600" gradientClass="bg-gradient-to-br from-purple-50 to-violet-100/50 dark:from-purple-950/40 dark:to-violet-900/20 border-purple-200 dark:border-purple-800" />
            </div>

            {/* Ad Accounts */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Ad Accounts ({adAccounts?.length ?? 0})</CardTitle>
                <div className="flex items-center gap-2">
                  {unassignSelectedIds.size > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const ids = Array.from(unassignSelectedIds);
                        for (const adAccountId of ids) {
                          await (supabase as any).from("user_ad_accounts").delete().eq("user_id", userId!).eq("ad_account_id", adAccountId);
                        }
                        toast.success(`${ids.length} account(s) unassigned`);
                        setUnassignSelectedIds(new Set());
                        refetchAdAccounts();
                        queryClient.invalidateQueries({ queryKey: ["admin-user-ad-accounts"] });
                      }}
                    >
                      Unassign {unassignSelectedIds.size} Selected
                    </Button>
                  )}
                  <Button size="sm" onClick={() => { setShowAssignDialog(true); setAssignSelectedIds(new Set()); }}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Assign Accounts
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {adAccounts?.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No ad accounts assigned</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
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
                        <TableHead>Account</TableHead>
                        <TableHead>Budget</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Spent</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adAccounts?.map((acc: any) => (
                        <TableRow key={acc.id}>
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
                          <TableCell>
                            <p className="font-medium">{acc.account_name}</p>
                            <p className="text-xs text-muted-foreground">{acc.account_id}</p>
                          </TableCell>
                          <TableCell>${Number(acc.spend_cap).toLocaleString()}</TableCell>
                          <TableCell><StatusBadge status={acc.status} /></TableCell>
                          <TableCell>
                            <SpendProgressBar amountSpent={Number(acc.amount_spent)} spendCap={Number(acc.spend_cap)} />
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              className="bg-primary text-primary-foreground hover:bg-primary/90"
                              onClick={() => { setSelectedAccountId(acc.id); setTopUpDialogOpen(true); setTopUpAmount(""); }}
                            >
                              <ArrowUpCircle className="h-3.5 w-3.5 mr-1" />
                              Top Up
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Transaction History</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
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
                          <TableCell className="text-muted-foreground whitespace-nowrap">{format(new Date(tx.created_at), "MMM d, yyyy HH:mm")}</TableCell>
                          <TableCell className="capitalize font-medium">{tx.type.replace(/_/g, " ")}</TableCell>
                          <TableCell className="text-sm">
                            {hasNewline ? (
                              <div>
                                <span>{descName}</span>
                                <span className="block text-xs text-muted-foreground">{descId}</span>
                              </div>
                            ) : desc}
                          </TableCell>
                          <TableCell className="text-sm">
                            {linkedAccount ? (
                              <div>
                                <p className="font-medium">{linkedAccount.account_name}</p>
                                <p className="text-[11px] text-muted-foreground font-mono">{linkedAccount.account_id.replace(/^act_/, "")}</p>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className={cn("font-semibold", Number(tx.amount) >= 0 ? "text-green-600" : "text-red-600")}>
                            {Number(tx.amount) >= 0 ? "+" : ""}${Math.abs(Number(tx.amount)).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-medium">${Number(tx.balance_after ?? 0).toLocaleString()}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{processedByLabel}</TableCell>
                        </TableRow>
                      );
                    })}
                    {(!transactions || transactions.length === 0) && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No transactions yet</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
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
          <div className="py-2 space-y-2 max-h-[50vh] overflow-y-auto">
            {(() => {
              const assignedIds = new Set(adAccounts?.map((a: any) => a.id) ?? []);
              const unassigned = allAdAccounts?.filter((a: any) => !assignedIds.has(a.id)) ?? [];
              if (unassigned.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">No unassigned accounts available</p>;
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
              className="bg-blue-600 hover:bg-blue-700 text-white"
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
