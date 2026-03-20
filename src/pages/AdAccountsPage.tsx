import { useAuth } from "@/contexts/AuthContext";
import { useNavigationType } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AdminAdAccounts } from "@/components/admin/AdminAdAccounts";
import { ClientAdAccounts } from "@/components/client/ClientAdAccounts";
import { AdminTikTokAccounts } from "@/components/admin/AdminTikTokAccounts";
import { ClientTikTokAccounts } from "@/components/client/ClientTikTokAccounts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdAccountsPage() {
  const { isAdmin } = useAuth();
  const navType = useNavigationType();
  const isPageReload = performance?.navigation?.type === 1 || (window.performance.getEntriesByType("navigation")[0] as any)?.type === "reload";
  const isBackNav = navType === "POP" && !isPageReload;
  const savedTab = isBackNav ? (sessionStorage.getItem("adAccountsTab") || "meta") : "meta";
  return (
    <DashboardLayout>
      <Tabs defaultValue={savedTab} className="w-full" onValueChange={(v) => sessionStorage.setItem("adAccountsTab", v)}>
        <TabsList className="mb-4">
          <TabsTrigger value="meta">Meta Ad Accounts</TabsTrigger>
          <TabsTrigger value="tiktok">TikTok Ad Accounts</TabsTrigger>
        </TabsList>
        <TabsContent value="meta">
          {isAdmin ? <AdminAdAccounts /> : <ClientAdAccounts />}
        </TabsContent>
        <TabsContent value="tiktok">
          {isAdmin ? <AdminTikTokAccounts /> : <ClientTikTokAccounts />}
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
