import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";

// Lazy load all dashboard pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AdAccountsPage = lazy(() => import("./pages/AdAccountsPage"));
const AdAccountDetailPage = lazy(() => import("./pages/AdAccountDetailPage"));
const TopUpPage = lazy(() => import("./pages/TopUpPage"));
const InvoicePage = lazy(() => import("./pages/InvoicePage"));
const TransactionsPage = lazy(() => import("./pages/TransactionsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const BusinessManagersPage = lazy(() => import("./pages/BusinessManagersPage"));
const BanksPage = lazy(() => import("./pages/BanksPage"));
const ClientsPage = lazy(() => import("./pages/ClientsPage"));
const ClientDetailPage = lazy(() => import("./pages/ClientDetailPage"));
const BillingsPage = lazy(() => import("./pages/BillingsPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s before refetch
      refetchOnWindowFocus: false,
    },
  },
});

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/ad-accounts" element={<ProtectedRoute><AdAccountsPage /></ProtectedRoute>} />
              <Route path="/ad-accounts/:id" element={<ProtectedRoute><AdAccountDetailPage /></ProtectedRoute>} />
              <Route path="/top-up" element={<ProtectedRoute><TopUpPage /></ProtectedRoute>} />
              <Route path="/transactions" element={<ProtectedRoute><TransactionsPage /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
              <Route path="/business-managers" element={<ProtectedRoute><BusinessManagersPage /></ProtectedRoute>} />
              <Route path="/banks" element={<ProtectedRoute><BanksPage /></ProtectedRoute>} />
              <Route path="/clients" element={<ProtectedRoute><ClientsPage /></ProtectedRoute>} />
              <Route path="/clients/:userId" element={<ProtectedRoute><ClientDetailPage /></ProtectedRoute>} />
              <Route path="/billings" element={<ProtectedRoute><BillingsPage /></ProtectedRoute>} />
              <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
