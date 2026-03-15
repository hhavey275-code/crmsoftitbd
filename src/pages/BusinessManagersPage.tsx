import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AdminBusinessManagers } from "@/components/admin/AdminBusinessManagers";
import { Navigate } from "react-router-dom";

export default function BusinessManagersPage() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return (
    <DashboardLayout>
      <AdminBusinessManagers />
    </DashboardLayout>
  );
}
