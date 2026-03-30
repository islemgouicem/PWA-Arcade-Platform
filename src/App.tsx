import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import AuthPage from "@/pages/AuthPage";
import CardBookPage from "@/pages/CardBookPage";
import GiftsPage from "@/pages/GiftsPage";
import SideQuestsPage from "@/pages/SideQuestsPage";
import RankingPage from "@/pages/RankingPage";
import TradingPage from "@/pages/TradingPage";
import ShopperPage from "@/pages/ShopperPage";
import AdminDashboard from "@/pages/AdminDashboard";
import NotificationsPage from "@/pages/NotificationsPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><span className="text-toxic font-display text-2xl animate-pulse">Loading...</span></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isAdmin) return <Navigate to="/card-book" replace />;
  return <>{children}</>;
}

function ShopperRoute({ children }: { children: React.ReactNode }) {
  const { isShopper, isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isShopper && !isAdmin) return <Navigate to="/card-book" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading, isAdmin, isShopper } = useAuth();
  const homePath = isAdmin ? "/admin?tab=teams" : isShopper ? "/shopper" : "/card-book";

  return (
    <Routes>
      <Route path="/auth" element={user && !loading ? <Navigate to={homePath} replace /> : <AuthPage />} />
      <Route path="/" element={<Navigate to={homePath} replace />} />
      <Route path="/card-book" element={<ProtectedRoute><CardBookPage /></ProtectedRoute>} />
      <Route path="/gifts" element={<ProtectedRoute><GiftsPage /></ProtectedRoute>} />
      <Route path="/quests" element={<ProtectedRoute><SideQuestsPage /></ProtectedRoute>} />
      <Route path="/ranking" element={<ProtectedRoute><RankingPage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
      <Route path="/trading" element={<ProtectedRoute><TradingPage /></ProtectedRoute>} />
      <Route path="/shopper" element={<ProtectedRoute><ShopperRoute><ShopperPage /></ShopperRoute></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><AdminRoute><AdminDashboard /></AdminRoute></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
