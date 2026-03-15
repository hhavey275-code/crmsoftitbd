import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { CardBrandIcon } from "@/components/CardBrandIcon";
import { ArrowUp, ArrowDown, AppWindow, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface InsightsData {
  balance: number;
  cards: { id: string; display_string: string; type: number }[];
  updated_at?: string;
}

export default function BillingsPage() {
  const { user } = useAuth();
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const queryClient = useQueryClient();

  const { data: accounts } = useQuery({
    queryKey: ["billings-accounts", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*");
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

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!accounts || accounts.length === 0) return;
      const ids = accounts.map((a: any) => a.id);
      const { data, error } = await supabase.functions.invoke("get-account-insights", {
        body: { ad_account_ids: ids, source: "meta" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billings-insights"] });
      toast.success("Data updated from Meta");
    },
    onError: () => {
      toast.error("Failed to update from Meta");
    },
  });

  const lastUpdated = useMemo(() => {
    const times = Object.values(insights as Record<string, InsightsData>)
      .map((i) => i.updated_at)
      .filter(Boolean);
    if (times.length === 0) return null;
    return new Date(times.sort().reverse()[0]!).toLocaleString();
  }, [insights]);

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
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Billings</h1>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground mt-0.5">Last synced: {lastUpdated}</p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || !accounts?.length}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            Update from Meta
          </Button>
        </div>
        <Card>
          <CardContent className="pt-4 px-3">
            {sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No ad accounts found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right w-[110px]">
                      <button
                        className="flex items-center text-xs font-medium ml-auto"
                        onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                      >
                        Balance
                        {sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />}
                      </button>
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((acc: any) => {
                    const ins = (insights as any)[acc.id] as InsightsData | undefined;
                    const balance = Number(ins?.balance ?? 0);
                    return (
                      <TableRow key={acc.id}>
                        <TableCell className="py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                              <AppWindow className="h-3 w-3 text-muted-foreground" />
                            </div>
                            <div>
                              <div className="text-sm leading-tight">{acc.account_name}</div>
                              <div className="text-[11px] text-muted-foreground font-mono">ID: {acc.account_id.replace(/^act_/, '')}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 text-right font-semibold text-sm">
                          ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <StatusBadge status={acc.status} />
                        </TableCell>
                        <TableCell className="py-2.5">
                          {ins?.cards && ins.cards.length > 0 ? (
                            ins.cards.map((card: any, i: number) => (
                              <div key={i} className="flex items-center gap-1">
                                <CardBrandIcon displayString={card.display_string} size="xs" />
                                <span className="text-xs">{card.display_string}</span>
                              </div>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={`https://business.facebook.com/billing_hub/accounts/details?asset_id=${acc.account_id.replace(/^act_/, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button variant="default" size="sm" className="h-7 px-3 text-xs">
                              Billing
                            </Button>
                          </a>
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
