import { useAuth } from "@/contexts/AuthContext";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { ClientDashboard } from "@/components/client/ClientDashboard";
import { DashboardLayout } from "@/components/DashboardLayout";

export default function Dashboard() {
  const { isAdmin } = useAuth();
  return (
    <DashboardLayout>
      {isAdmin ? <AdminDashboard /> : <ClientDashboard />}
    </DashboardLayout>
  );
}
