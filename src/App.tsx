import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import AuthPage from "@/pages/AuthPage";
import CardBookPage from "@/pages/CardBookPage";
import GiftsPage from "@/pages/GiftsPage";
import RankingPage from "@/pages/RankingPage";
import ShopperPage from "@/pages/ShopperPage";
import AdminDashboard from "@/pages/AdminDashboard";
import NotificationsPage from "@/pages/NotificationsPage";
import MiniGamesPage from "@/pages/MiniGamesPage";
import MissionsPage from "@/pages/MissionsPage";
import MiniGameHolderPage from "@/pages/MiniGameHolderPage";
import MissionResponsiblePage from "@/pages/MissionResponsiblePage";
import AdminOperationsPage from "@/pages/AdminOperationsPage";
import NotFound from "@/pages/NotFound";
import Index from "@/pages/Index";

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

function MiniGameHolderRoute({ children }: { children: React.ReactNode }) {
  const { isMiniGameHolder, isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isMiniGameHolder && !isAdmin) return <Navigate to="/card-book" replace />;
  return <>{children}</>;
}

function MissionResponsibleRoute({ children }: { children: React.ReactNode }) {
  const { isMissionResponsible, isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isMissionResponsible && !isAdmin) return <Navigate to="/card-book" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading, isAdmin, isShopper, isMiniGameHolder, isMissionResponsible } = useAuth();
  const homePath = isAdmin
    ? "/admin?tab=teams"
    : isShopper
      ? "/shopper"
      : isMiniGameHolder
        ? "/mini-game-holder"
        : isMissionResponsible
          ? "/mission-responsible"
          : "/card-book";

  return (
    <Routes>
      <Route path="/auth" element={user && !loading ? <Navigate to={homePath} replace /> : <AuthPage />} />
      <Route path="/" element={user && !loading ? <Navigate to={homePath} replace /> : <Index />} />
      <Route path="/card-book" element={<ProtectedRoute><CardBookPage /></ProtectedRoute>} />
      <Route path="/gifts" element={<ProtectedRoute><GiftsPage /></ProtectedRoute>} />
      <Route path="/missions" element={<ProtectedRoute><MissionsPage /></ProtectedRoute>} />
      <Route path="/mini-games" element={<ProtectedRoute><MiniGamesPage /></ProtectedRoute>} />
      <Route path="/ranking" element={<ProtectedRoute><RankingPage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
      <Route path="/shopper" element={<ProtectedRoute><ShopperRoute><ShopperPage /></ShopperRoute></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><AdminRoute><AdminDashboard /></AdminRoute></ProtectedRoute>} />
      <Route path="/admin-ops" element={<ProtectedRoute><AdminRoute><AdminOperationsPage /></AdminRoute></ProtectedRoute>} />
      <Route path="/mini-game-holder" element={<ProtectedRoute><MiniGameHolderRoute><MiniGameHolderPage /></MiniGameHolderRoute></ProtectedRoute>} />
      <Route path="/mission-responsible" element={<ProtectedRoute><MissionResponsibleRoute><MissionResponsiblePage /></MissionResponsibleRoute></ProtectedRoute>} />
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
