import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useNavigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
const SystemLogsPage = lazy(() => import("./pages/SystemLogsPage"));
const FailedTopUpsPage = lazy(() => import("./pages/FailedTopUpsPage"));
const RequestsPage = lazy(() => import("./pages/RequestsPage"));
const SellersPage = lazy(() => import("./pages/SellersPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));

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

const TikTokOAuthCallbackHandler = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const authCode = params.get("auth_code");
    const state = (params.get("state") ?? "").toLowerCase();

    if (!authCode || !state.startsWith("tiktok")) return;

    let cancelled = false;

    (async () => {
      toast.info("TikTok auth code detected, exchanging for token...");

      try {
        const { data, error } = await supabase.functions.invoke("tiktok-oauth", {
          body: { auth_code: authCode },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        if (data?.access_token) {
          await navigator.clipboard.writeText(data.access_token);
          toast.success("TikTok Access Token copied to clipboard! Use it to add your Business Center.", {
            duration: 10000,
          });
        } else {
          toast.error("TikTok token exchange failed: No access token returned");
        }
      } catch (err: any) {
        toast.error("TikTok token exchange failed: " + (err?.message || "Unknown error"));
      }

      if (!cancelled) {
        navigate("/dashboard", { replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location.search, navigate]);

  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <TikTokOAuthCallbackHandler />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/signup" element={<Auth />} />
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
              <Route path="/system-logs" element={<ProtectedRoute><SystemLogsPage /></ProtectedRoute>} />
              <Route path="/failed-topups" element={<ProtectedRoute><FailedTopUpsPage /></ProtectedRoute>} />
              <Route path="/requests" element={<ProtectedRoute><RequestsPage /></ProtectedRoute>} />
              <Route path="/invoice/:requestId" element={<ProtectedRoute><InvoicePage /></ProtectedRoute>} />
              <Route path="/sellers" element={<ProtectedRoute><SellersPage /></ProtectedRoute>} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
