import { DashboardLayout } from "@/components/DashboardLayout";
import { AdminClients } from "@/components/admin/AdminClients";

export default function ClientsPage() {
  return (
    <DashboardLayout>
      <AdminClients />
    </DashboardLayout>
  );
}
