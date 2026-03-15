import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AdminTransactions } from "@/components/admin/AdminTransactions";
import { ClientTransactions } from "@/components/client/ClientTransactions";

export default function TransactionsPage() {
  const { role } = useAuth();
  return (
    <DashboardLayout>
      {role === "admin" ? <AdminTransactions /> : <ClientTransactions />}
    </DashboardLayout>
  );
}
