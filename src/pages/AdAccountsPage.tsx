import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AdminAdAccounts } from "@/components/admin/AdminAdAccounts";
import { ClientAdAccounts } from "@/components/client/ClientAdAccounts";

export default function AdAccountsPage() {
  const { isAdmin } = useAuth();
  return (
    <DashboardLayout>
      {isAdmin ? <AdminAdAccounts /> : <ClientAdAccounts />}
    </DashboardLayout>
  );
}
