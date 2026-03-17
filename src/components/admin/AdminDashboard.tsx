import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MetricCard } from "@/components/MetricCard";
import { Users, Wallet, Clock, Activity, Ban, TrendingUp, Trophy, Crown, Medal, RefreshCw, CalendarIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { toast } from "sonner";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import { useIsMobile } from "@/hooks/use-mobile";

const DATE_PRESETS = [
  { label: "Today", getValue: () => ({ from: new Date(), to: new Date() }) },
  { label: "Yesterday", getValue: () => ({ from: subDays(new Date(), 1), to: subDays(new Date(), 1) }) },
  { label: "Last 7 days", getValue: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { label: "Last 14 days", getValue: () => ({ from: subDays(new Date(), 13), to: new Date() }) },
  { label: "Last 28 days", getValue: () => ({ from: subDays(new Date(), 27), to: new Date() }) },
  { label: "Last 30 days", getValue: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
  { label: "This week", getValue: () => ({ from: startOfWeek(new Date(), { weekStartsOn: 1 }), to: new Date() }) },
  { label: "Last week", getValue: () => ({ from: startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }), to: endOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }) }) },
  { label: "This month", getValue: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  { label: "Last month", getValue: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
];

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];

const SPEND_SESSION_KEY = "admin-dashboard-spend";
const DATE_SPEND_SESSION_KEY = "admin-dashboard-date-spend";

export function AdminDashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [metaLoading, setMetaLoading] = useState(false);
  const [dailySpendLoading, setDailySpendLoading] = useState(false);

  // Restore spend data from sessionStorage
  const [spendData, setSpendData] = useState<{ today: number; yesterday: number } | null>(() => {
    try {
      const stored = sessionStorage.getItem(SPEND_SESSION_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dateSpend, setDateSpend] = useState<number | null>(() => {
    try {
      const stored = sessionStorage.getItem(DATE_SPEND_SESSION_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      return parsed.spend ?? null;
    } catch { return null; }
  });
  const [dateSpendLoading, setDateSpendLoading] = useState(false);

  // Restore date range from sessionStorage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(DATE_SPEND_SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.dateFrom && parsed.dateTo) {
          setDateRange({ from: new Date(parsed.dateFrom), to: new Date(parsed.dateTo) });
        }
      }
    } catch { /* ignore */ }
  }, []);

  const { data: profiles } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*");
      return (data as any[]) ?? [];
    },
  });

  const { data: wallets } = useQuery({
    queryKey: ["admin-wallets"],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("*");
      return (data as any[]) ?? [];
    },
  });

  const { data: pendingRequests } = useQuery({
    queryKey: ["admin-pending-topups"],
    queryFn: async () => {
      const { data, error } = await supabase.from("top_up_requests").select("id").eq("status", "pending");
      if (error) console.error("Pending top-ups error:", error);
      return (data as any[]) ?? [];
    },
  });

  const { data: adAccounts } = useQuery({
    queryKey: ["admin-ad-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*");
      return (data as any[]) ?? [];
    },
  });

  const { data: userAdAccounts } = useQuery({
    queryKey: ["admin-user-ad-accounts"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("user_ad_accounts").select("user_id, ad_account_id");
      return (data as any[]) ?? [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ad_accounts" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin-ad-accounts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "top_up_requests" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin-pending-topups"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const totalBalance = wallets?.reduce((sum: number, w: any) => sum + Number(w.balance), 0) ?? 0;
  const activeAccounts = adAccounts?.filter((a: any) => a.status === "active") ?? [];
  const disabledAccounts = adAccounts?.filter((a: any) => a.status !== "active") ?? [];
  const remainingLimit = adAccounts?.reduce((sum: number, a: any) => sum + Math.max(0, Number(a.spend_cap) - Number(a.amount_spent)), 0) ?? 0;

  const { spenderChart, topThree } = useMemo(() => {
    if (!adAccounts?.length || !profiles?.length || !userAdAccounts?.length) return { spenderChart: [], topThree: [] };
    
    const accountSpendMap: Record<string, number> = {};
    adAccounts.forEach((a: any) => {
      accountSpendMap[a.id] = Number(a.amount_spent) || 0;
    });

    const spendByUser: Record<string, number> = {};
    userAdAccounts.forEach((ua: any) => {
      const spent = accountSpendMap[ua.ad_account_id] || 0;
      spendByUser[ua.user_id] = (spendByUser[ua.user_id] || 0) + spent;
    });

    const profileMap: Record<string, any> = {};
    profiles.forEach((p: any) => { profileMap[p.user_id] = p; });

    const sorted = Object.entries(spendByUser)
      .map(([userId, spent]) => ({
        userId,
        name: profileMap[userId]?.full_name || profileMap[userId]?.email || "Unknown",
        value: spent,
      }))
      .sort((a, b) => b.value - a.value);

    return { spenderChart: sorted.slice(0, 8), topThree: sorted.slice(0, 3) };
  }, [adAccounts, profiles, userAdAccounts]);

  const handleUpdateFromMeta = async () => {
    if (!adAccounts?.length) return;
    setMetaLoading(true);
    try {
      const ids = adAccounts.map((a: any) => a.id);
      const { data, error } = await supabase.functions.invoke("get-account-insights", {
        body: { ad_account_ids: ids, source: "meta" },
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["admin-ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["billings-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["billings-insights"] });
      toast.success("Meta data updated successfully");
    } catch (err: any) {
      toast.error("Failed to update from Meta: " + (err.message || "Unknown error"));
    } finally {
      setMetaLoading(false);
    }
  };

  const handleFetchDailySpend = async () => {
    if (!adAccounts?.length) return;
    setDailySpendLoading(true);
    try {
      const ids = adAccounts.map((a: any) => a.id);
      const { data, error } = await supabase.functions.invoke("get-account-insights", {
        body: { ad_account_ids: ids, source: "meta" },
      });
      if (error) throw error;
      const insights = data?.insights ?? {};
      const today = Object.values(insights).reduce((sum: number, ins: any) => sum + (Number(ins?.today_spend) || 0), 0) as number;
      const yesterday = Object.values(insights).reduce((sum: number, ins: any) => sum + (Number(ins?.yesterday_spend) || 0), 0) as number;
      const newSpend = { today, yesterday };
      setSpendData(newSpend);
      sessionStorage.setItem(SPEND_SESSION_KEY, JSON.stringify(newSpend));
      await queryClient.invalidateQueries({ queryKey: ["admin-ad-accounts"] });
    } catch (err: any) {
      toast.error("Failed to fetch daily spend: " + (err.message || "Unknown error"));
    } finally {
      setDailySpendLoading(false);
    }
  };

  const handleFetchDateRangeSpend = async () => {
    if (!adAccounts?.length || !dateRange?.from || !dateRange?.to) return;
    setDateSpendLoading(true);
    try {
      const ids = adAccounts.map((a: any) => a.id);
      const fromStr = format(dateRange.from, "yyyy-MM-dd");
      const toStr = format(dateRange.to, "yyyy-MM-dd");
      const { data, error } = await supabase.functions.invoke("get-account-insights", {
        body: { ad_account_ids: ids, source: "meta", date_from: fromStr, date_to: toStr },
      });
      if (error) throw error;
      const insights = data?.insights ?? {};
      const total = Object.values(insights).reduce((sum: number, ins: any) => sum + (Number(ins?.date_spend) || 0), 0) as number;
      setDateSpend(total);
      sessionStorage.setItem(DATE_SPEND_SESSION_KEY, JSON.stringify({
        spend: total,
        dateFrom: dateRange.from.toISOString(),
        dateTo: dateRange.to.toISOString(),
      }));
      setPickerOpen(false);
    } catch (err: any) {
      toast.error("Failed to fetch spend: " + (err.message || "Unknown error"));
    } finally {
      setDateSpendLoading(false);
    }
  };

  const handlePresetChange = (presetLabel: string) => {
    setSelectedPreset(presetLabel);
    const preset = DATE_PRESETS.find(p => p.label === presetLabel);
    if (preset) {
      const range = preset.getValue();
      setDateRange({ from: range.from, to: range.to });
    }
  };

  const rankIcons = [Crown, Trophy, Medal];
  const rankColors = ["text-yellow-500", "text-blue-500", "text-orange-500"];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <MetricCard title="Total Clients" value={profiles?.length ?? 0} icon={Users} iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor="text-blue-600" />
        <MetricCard title="Platform Balance" value={`$${totalBalance.toLocaleString()}`} icon={Wallet} iconBg="bg-emerald-50 dark:bg-emerald-900/30" iconColor="text-emerald-600" />
        <MetricCard title="Pending Top-Ups" value={pendingRequests?.length ?? 0} icon={Clock} iconBg="bg-amber-50 dark:bg-amber-900/30" iconColor="text-amber-600" />
        <MetricCard title="Active Ad Accounts" value={activeAccounts.length} icon={Activity} iconBg="bg-teal-50 dark:bg-teal-900/30" iconColor="text-teal-600" />
        <MetricCard title="Disabled Ad Accounts" value={disabledAccounts.length} icon={Ban} iconBg="bg-red-50 dark:bg-red-900/30" iconColor="text-red-500" />
        <MetricCard title="Remaining Limit" value={`$${remainingLimit.toLocaleString()}`} icon={TrendingUp} iconBg="bg-violet-50 dark:bg-violet-900/30" iconColor="text-violet-600" />
      </div>

      {/* Spend Overview - Single Card */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal gap-2", !dateRange?.from && "text-muted-foreground")}>
                  <CalendarIcon className="h-4 w-4" />
                  {dateRange?.from && dateRange?.to
                    ? `${format(dateRange.from, "MMM d, yyyy")} – ${format(dateRange.to, "MMM d, yyyy")}`
                    : "Select date range"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start" side="bottom">
                <div className="flex pointer-events-auto">
                  {/* Preset sidebar */}
                  <div className="border-r p-3 space-y-1 min-w-[150px]">
                    <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Presets</p>
                    <RadioGroup value={selectedPreset} onValueChange={handlePresetChange}>
                      {DATE_PRESETS.map((preset) => (
                        <div key={preset.label} className="flex items-center space-x-2">
                          <RadioGroupItem value={preset.label} id={`preset-${preset.label}`} className="h-3.5 w-3.5" />
                          <Label htmlFor={`preset-${preset.label}`} className="text-sm cursor-pointer font-normal">
                            {preset.label}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                  {/* Calendar */}
                  <div className="p-3">
                    <Calendar
                      mode="range"
                      selected={dateRange}
                      onSelect={(range) => {
                        setDateRange(range);
                        setSelectedPreset("");
                      }}
                      numberOfMonths={2}
                      disabled={(d) => d > new Date()}
                      className="pointer-events-auto"
                    />
                  </div>
                </div>
                {/* Bottom bar */}
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <div className="text-sm text-muted-foreground">
                    {dateRange?.from && dateRange?.to
                      ? `${format(dateRange.from, "MMM d, yyyy")} — ${format(dateRange.to, "MMM d, yyyy")}`
                      : "Select a range"}
                  </div>
                  <Button
                    size="sm"
                    onClick={handleFetchDateRangeSpend}
                    disabled={dateSpendLoading || !dateRange?.from || !dateRange?.to}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1 ${dateSpendLoading ? "animate-spin" : ""}`} />
                    {dateSpendLoading ? "Loading..." : "Update"}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {/* Spend result */}
            <div className="flex items-center gap-2">
              <div className="h-8 w-px bg-border" />
              <div>
                <p className="text-xs text-muted-foreground">
                  {dateRange?.from && dateRange?.to ? `${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d, yyyy")}` : "Date Range"} Spend
                </p>
                <p className="text-lg font-bold">
                  {dateSpendLoading
                    ? "Loading..."
                    : dateSpend !== null
                      ? `$${dateSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : "—"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Client Spend Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {spenderChart.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No spending data yet</p>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={spenderChart} cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={3} dataKey="value" nameKey="name">
                      {spenderChart.map((_, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, "Spent"]} contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--background))" }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Top High Spenders
              <span className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleUpdateFromMeta} disabled={metaLoading} className="text-xs">
                  <RefreshCw className={`h-3 w-3 mr-1 ${metaLoading ? "animate-spin" : ""}`} />
                  {metaLoading ? "Updating..." : "Update from Meta"}
                </Button>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topThree.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No spending data yet</p>
            ) : (
              <div className="space-y-4">
                {topThree.map((spender, i) => {
                  const RankIcon = rankIcons[i];
                  return (
                    <div key={spender.userId} className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/clients/${spender.userId}`)}>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <RankIcon className={`h-5 w-5 ${rankColors[i]}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate hover:underline">{spender.name}</p>
                        <p className="text-xs text-muted-foreground">Rank #{i + 1}</p>
                      </div>
                      <p className="font-bold text-lg">${spender.value.toLocaleString()}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
