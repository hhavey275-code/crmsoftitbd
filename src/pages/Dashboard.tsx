import { useAuth } from "@/contexts/AuthContext";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { ClientDashboard } from "@/components/client/ClientDashboard";
import { DashboardLayout } from "@/components/DashboardLayout";

export default function Dashboard() {
  const { role } = useAuth();
  return (
    <DashboardLayout>
      {role === "admin" ? <AdminDashboard /> : <ClientDashboard />}
    </DashboardLayout>
  );
}
