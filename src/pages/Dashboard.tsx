import { useAuth } from "@/contexts/AuthContext";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { ClientDashboard } from "@/components/client/ClientDashboard";
import { SellerDashboard } from "@/components/seller/SellerDashboard";
import { DashboardLayout } from "@/components/DashboardLayout";

export default function Dashboard() {
  const { isAdmin, isSeller } = useAuth();

  return (
    <DashboardLayout>
      {isAdmin ? <AdminDashboard /> : isSeller ? <SellerDashboard /> : <ClientDashboard />}
    </DashboardLayout>
  );
}
