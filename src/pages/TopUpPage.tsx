import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AdminTopUp } from "@/components/admin/AdminTopUp";
import { ClientTopUp } from "@/components/client/ClientTopUp";

export default function TopUpPage() {
  const { isAdmin } = useAuth();
  return (
    <DashboardLayout>
      {isAdmin ? <AdminTopUp /> : <ClientTopUp />}
    </DashboardLayout>
  );
}
