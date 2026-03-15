import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { ArrowUp, ArrowDown, AppWindow } from "lucide-react";

interface InsightsData {
  balance: number;
  cards: { id: string; display_string: string; type: number }[];
}

function CardBrandIcon({ displayString }: { displayString: string }) {
  const lower = displayString?.toLowerCase() ?? "";
  if (lower.includes("visa")) {
    return (
      <span className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white" style={{ background: "linear-gradient(135deg, #1a1f71, #2566af)" }}>
        VISA
      </span>
    );
  }
  if (lower.includes("master")) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5">
        <span className="h-4 w-4 rounded-full bg-[#eb001b] inline-block -mr-1.5 opacity-90" />
        <span className="h-4 w-4 rounded-full bg-[#f79e1b] inline-block opacity-90" />
      </span>
    );
  }
  if (lower.includes("amex") || lower.includes("american")) {
    return (
      <span className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold text-white bg-[#2e77bc]">
        AMEX
      </span>
    );
  }
  // Generic / available funds
  return (
    <span className="inline-flex items-center justify-center rounded px-1.5 py-0.5 bg-emerald-500 text-white">
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
    </span>
  );
}

export default function BillingsPage() {
  const { user, role } = useAuth();
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Fetch ad accounts based on role
  const { data: accounts } = useQuery({
    queryKey: ["billings-accounts", user?.id, role],
    queryFn: async () => {
      if (role === "admin") {
        const { data } = await supabase.from("ad_accounts").select("*");
        return (data as any[]) ?? [];
      }
      // Client: get assigned accounts
      const { data: assignments } = await (supabase as any)
        .from("user_ad_accounts")
        .select("ad_account_id")
        .eq("user_id", user!.id);
      if (!assignments || assignments.length === 0) return [];
      const ids = assignments.map((a: any) => a.ad_account_id);
      const { data } = await supabase.from("ad_accounts").select("*").in("id", ids);
      return (data as any[]) ?? [];
    },
    enabled: !!user,
  });

  const { data: insights = {} } = useQuery({
    queryKey: ["billings-insights", user?.id],
    queryFn: async () => {
      if (!accounts || accounts.length === 0) return {};
      const ids = accounts.map((a: any) => a.id);
      const { data } = await supabase.functions.invoke("get-account-insights", {
        body: { ad_account_ids: ids, source: "cache" },
      });
      return (data?.insights as Record<string, InsightsData>) ?? {};
    },
    enabled: !!user && !!accounts && accounts.length > 0,
  });

  const sorted = useMemo(() => {
    if (!accounts) return [];
    return [...accounts].sort((a, b) => {
      const balA = Number((insights as any)[a.id]?.balance ?? 0);
      const balB = Number((insights as any)[b.id]?.balance ?? 0);
      return sortDir === "asc" ? balA - balB : balB - balA;
    });
  }, [accounts, insights, sortDir]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Billings</h1>
        <Card>
          <CardContent className="pt-6">
            {sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No ad accounts found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[250px]">Account</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead className="w-[200px]">How you'll pay</TableHead>
                    <TableHead className="w-[150px] text-right">
                      <button
                        className="flex items-center text-xs font-medium ml-auto"
                        onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                      >
                        Current balance
                        {sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />}
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((acc: any) => {
                    const ins = (insights as any)[acc.id] as InsightsData | undefined;
                    const balance = Number(ins?.balance ?? 0);
                    return (
                      <TableRow key={acc.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                              <AppWindow className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                              <div className="text-sm text-primary">{acc.account_name}</div>
                              <div className="text-xs text-muted-foreground font-mono">ID: {acc.account_id.replace(/^act_/, '')}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={acc.status} />
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {ins?.cards && ins.cards.length > 0 ? (
                              ins.cards.map((card: any, i: number) => (
                                <div key={i} className="flex items-center gap-2">
                                  <CardBrandIcon displayString={card.display_string} />
                                  <span>{card.display_string}</span>
                                </div>
                              ))
                            ) : (
                              <span className="text-muted-foreground">No payment method</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
    </DashboardLayout>
  );
}
