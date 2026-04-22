import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/useAuth";
import { AuthProvider } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";

const AuthPage = lazy(() => import("@/pages/AuthPage"));
const CardBookPage = lazy(() => import("@/pages/CardBookPage"));
const GiftsPage = lazy(() => import("@/pages/GiftsPage"));
const RankingPage = lazy(() => import("@/pages/RankingPage"));
const ShopPage = lazy(() => import("@/pages/ShopPage"));
const ShopperPage = lazy(() => import("@/pages/ShopperPage"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const NotificationsPage = lazy(() => import("@/pages/NotificationsPage"));
const MiniGamesPage = lazy(() => import("@/pages/MiniGamesPage"));
const MissionsPage = lazy(() => import("@/pages/MissionsPage"));
const MiniGameHolderPage = lazy(() => import("@/pages/MiniGameHolderPage"));
const MissionResponsiblePage = lazy(() => import("@/pages/MissionResponsiblePage"));
const AdminOperationsPage = lazy(() => import("@/pages/AdminOperationsPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Index = lazy(() => import("@/pages/Index"));

const queryClient = new QueryClient();

function resolveHomePath(flags: {
  isAdmin: boolean;
  isShopper: boolean;
  isMiniGameHolder: boolean;
  isMissionResponsible: boolean;
  isZoneHandler?: boolean;
}) {
  return flags.isAdmin
    ? "/admin?tab=teams"
    : flags.isShopper
      ? "/shopper"
      : flags.isMiniGameHolder
        ? "/mini-game-holder"
        : flags.isMissionResponsible || flags.isZoneHandler
          ? "/mission-responsible"
          : "/card-book";
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <RouteLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function RouteLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <span className="text-toxic font-display text-2xl animate-pulse">Loading...</span>
    </div>
  );
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, isShopper, isMiniGameHolder, isMissionResponsible, loading } = useAuth();
  if (loading) return null;
  if (!isAdmin) {
    return <Navigate to={resolveHomePath({ isAdmin, isShopper, isMiniGameHolder, isMissionResponsible })} replace />;
  }
  return <>{children}</>;
}

function ParticipantRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, isShopper, isMiniGameHolder, isMissionResponsible, loading } = useAuth();
  if (loading) return null;
  const hasElevatedRole = isAdmin || isShopper || isMiniGameHolder || isMissionResponsible;
  if (hasElevatedRole) {
    return <Navigate to={resolveHomePath({ isAdmin, isShopper, isMiniGameHolder, isMissionResponsible })} replace />;
  }
  return <>{children}</>;
}

function ShopperRoute({ children }: { children: React.ReactNode }) {
  const { isShopper, isAdmin, isMiniGameHolder, isMissionResponsible, loading } = useAuth();
  if (loading) return null;
  if (!isShopper && !isAdmin) {
    return <Navigate to={resolveHomePath({ isAdmin, isShopper, isMiniGameHolder, isMissionResponsible })} replace />;
  }
  return <>{children}</>;
}

function MiniGameHolderRoute({ children }: { children: React.ReactNode }) {
  const { isMiniGameHolder, isAdmin, isShopper, isMissionResponsible, loading } = useAuth();
  if (loading) return null;
  if (!isMiniGameHolder && !isAdmin) {
    return <Navigate to={resolveHomePath({ isAdmin, isShopper, isMiniGameHolder, isMissionResponsible })} replace />;
  }
  return <>{children}</>;
}

function MissionResponsibleRoute({ children }: { children: React.ReactNode }) {
  const { isMissionResponsible, isZoneHandler, isAdmin, isShopper, isMiniGameHolder, loading } = useAuth();
  if (loading) return null;
  if (!isMissionResponsible && !isZoneHandler && !isAdmin) {
    return <Navigate to={resolveHomePath({ isAdmin, isShopper, isMiniGameHolder, isMissionResponsible, isZoneHandler })} replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading, isAdmin, isShopper, isMiniGameHolder, isMissionResponsible, isZoneHandler } = useAuth();
  const homePath = resolveHomePath({ isAdmin, isShopper, isMiniGameHolder, isMissionResponsible, isZoneHandler });

  return (
    <Suspense fallback={<RouteLoader />}>
      <Routes>
        <Route path="/auth" element={user && !loading ? <Navigate to={homePath} replace /> : <AuthPage />} />
        <Route path="/" element={user && !loading ? <Navigate to={homePath} replace /> : <Index />} />
        <Route path="/card-book" element={<ProtectedRoute><ParticipantRoute><CardBookPage /></ParticipantRoute></ProtectedRoute>} />
        <Route path="/gifts" element={<ProtectedRoute><ParticipantRoute><GiftsPage /></ParticipantRoute></ProtectedRoute>} />
        <Route path="/missions" element={<ProtectedRoute><ParticipantRoute><MissionsPage /></ParticipantRoute></ProtectedRoute>} />
        <Route path="/mini-games" element={<ProtectedRoute><ParticipantRoute><MiniGamesPage /></ParticipantRoute></ProtectedRoute>} />
        <Route path="/shop" element={<ProtectedRoute><ParticipantRoute><ShopPage /></ParticipantRoute></ProtectedRoute>} />
        <Route path="/ranking" element={<ProtectedRoute><RankingPage /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
        <Route path="/shopper" element={<ProtectedRoute><ShopperRoute><ShopperPage /></ShopperRoute></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><AdminRoute><AdminDashboard /></AdminRoute></ProtectedRoute>} />
        <Route path="/admin-ops" element={<ProtectedRoute><AdminRoute><AdminOperationsPage /></AdminRoute></ProtectedRoute>} />
        <Route path="/mini-game-holder" element={<ProtectedRoute><MiniGameHolderRoute><MiniGameHolderPage /></MiniGameHolderRoute></ProtectedRoute>} />
        <Route path="/mission-responsible" element={<ProtectedRoute><MissionResponsibleRoute><MissionResponsiblePage /></MissionResponsibleRoute></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
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
