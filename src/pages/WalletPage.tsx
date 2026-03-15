import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AdminWallet } from "@/components/admin/AdminWallet";
import { ClientWallet } from "@/components/client/ClientWallet";

export default function WalletPage() {
  const { role } = useAuth();
  return (
    <DashboardLayout>
      {role === "admin" ? <AdminWallet /> : <ClientWallet />}
    </DashboardLayout>
  );
}
