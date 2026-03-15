import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AdminTransactions } from "@/components/admin/AdminTransactions";
import { ClientTransactions } from "@/components/client/ClientTransactions";

export default function TransactionsPage() {
  const { isAdmin } = useAuth();
  return (
    <DashboardLayout>
      {isAdmin ? <AdminTransactions /> : <ClientTransactions />}
    </DashboardLayout>
  );
}
