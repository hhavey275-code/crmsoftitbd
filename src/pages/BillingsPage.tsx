import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { CardBrandIcon } from "@/components/CardBrandIcon";
import { ArrowUp, ArrowDown, AppWindow, ExternalLink } from "lucide-react";

interface InsightsData {
  balance: number;
  cards: { id: string; display_string: string; type: number }[];
}

export default function BillingsPage() {
  const { user } = useAuth();
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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
                    <TableHead>Account</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[160px]">How you'll pay</TableHead>
                    <TableHead className="w-[120px] text-right">
                      <button
                        className="flex items-center text-xs font-medium ml-auto"
                        onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                      >
                        Current balance
                        {sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />}
                      </button>
                    </TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((acc: any) => {
                    const ins = (insights as any)[acc.id] as InsightsData | undefined;
                    const balance = Number(ins?.balance ?? 0);
                    return (
                      <TableRow key={acc.id}>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                              <AppWindow className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                            <div>
                              <div className="text-sm text-primary leading-tight">{acc.account_name}</div>
                              <div className="text-xs text-muted-foreground font-mono">ID: {acc.account_id.replace(/^act_/, '')}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <StatusBadge status={acc.status} />
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="text-sm">
                            {ins?.cards && ins.cards.length > 0 ? (
                              ins.cards.map((card: any, i: number) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <CardBrandIcon displayString={card.display_string} size="xs" />
                                  <span className="text-xs">{card.display_string}</span>
                                </div>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground">No payment method</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-right font-semibold text-sm">
                          ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="py-3" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={`https://business.facebook.com/billing_hub/accounts/details?asset_id=${acc.account_id.replace(/^act_/, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80"
                            title="Go to Billing"
                          >
                            <ExternalLink className="h-4 w-4" />
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
