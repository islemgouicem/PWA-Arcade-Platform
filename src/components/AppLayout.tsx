import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/hooks/use-notifications";
import { useAnnouncements } from "@/hooks/use-announcements";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Book, Gift, Compass, Trophy, ShoppingBag, Shield, Store,
  Menu, X, LogOut, Megaphone, Users, Package, ScrollText,
  Zap, AlertTriangle, Settings, Bell
} from "lucide-react";
import { Button } from "@/components/ui/button";

const participantLinks = [
  { to: "/card-book", label: "Card Book", icon: Book },
  { to: "/gifts", label: "Get My Gifts", icon: Gift },
  { to: "/quests", label: "Side Quests", icon: Compass },
  { to: "/ranking", label: "Rankings", icon: Trophy },
  { to: "/trading", label: "Trading Post", icon: ShoppingBag },
  { to: "/notifications", label: "Notifications", icon: Bell },
];

const adminLinks = [
  { to: "/admin?tab=teams", label: "Teams", icon: Users },
  { to: "/admin?tab=coffres", label: "Coffres", icon: Package },
  { to: "/admin?tab=quests", label: "Quests", icon: Compass },
  { to: "/admin?tab=cards", label: "Cards", icon: ScrollText },
  { to: "/admin?tab=points", label: "Points", icon: Zap },
  { to: "/admin?tab=activations", label: "Activation Log", icon: AlertTriangle },
  { to: "/admin?tab=analytics", label: "Analytics", icon: Trophy },
  { to: "/admin?tab=shoppers", label: "Shopper Accounts", icon: Store },
  { to: "/admin?tab=settings", label: "Settings", icon: Settings },
  { to: "/admin?tab=announce", label: "Announcements", icon: Megaphone },
  { to: "/ranking", label: "Rankings", icon: Trophy },
  { to: "/notifications", label: "Notifications", icon: Bell },
];

const shopperLinks = [
  { to: "/shopper", label: "Shopper", icon: Store },
  { to: "/ranking", label: "Rankings", icon: Trophy },
  { to: "/notifications", label: "Notifications", icon: Bell },
];

function isLinkActive(currentPath: string, currentSearch: string, to: string) {
  const [targetPath, targetQuery = ""] = to.split("?");
  if (currentPath !== targetPath) return false;
  if (!targetQuery) return true;
  return currentSearch.replace(/^\?/, "") === targetQuery;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { team, isAdmin, isShopper, isParticipant, signOut } = useAuth();
  const { unreadCount, notifications, markAsRead } = useNotifications();
  const { announcements, dismiss } = useAnnouncements();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const { data: pendingCoffres = [] } = useQuery({
    queryKey: ["coffres", team?.id],
    queryFn: async () => {
      if (!team) return [];
      const { data } = await supabase
        .from("coffres")
        .select("id")
        .eq("team_id", team.id)
        .eq("is_opened", false)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: isParticipant && !!team?.id,
  });

  const { data: rankingVisible = true } = useQuery({
    queryKey: ["ranking-visible-setting"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings").select("value").eq("key", "ranking_visible").maybeSingle();
      return data?.value === true;
    },
  });

  const giftNotifications = isParticipant ? pendingCoffres.length : unreadCount;
  const navLinks = isAdmin ? adminLinks : isShopper ? shopperLinks : participantLinks;
  const systemBanner = notifications.find(
    (n) => !n.is_read && (n.type === "shop_window" || n.type === "ranking_visibility"),
  );

  return (
    <div className="min-h-screen flex bg-background bg-scanline">
      {/* Mobile header */}
      <header className="fixed top-0 left-0 right-0 z-40 panel-ember border-b border-border px-4 py-3 flex items-center justify-between md:hidden">
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
          <Menu className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <img src="/arcade.png" alt="ARCADE event" className="h-7 w-auto" />
          <div className="h-5 w-px bg-border" />
          <img src="/logo.png" alt="Skill and Tell" className="h-6 w-6 rounded-full border border-border" />
        </div>
        <div className="flex items-center gap-1">
          {giftNotifications > 0 && (
            <span className="bg-accent text-accent-foreground text-[10px] px-1.5 py-0.5 rounded-full">{giftNotifications}</span>
          )}
        </div>
      </header>

      {/* Sidebar overlay (mobile) */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`fixed md:sticky top-0 left-0 z-50 h-screen w-64 panel-ember border-r border-border flex flex-col transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/arcade.png" alt="ARCADE event" className="h-8 w-auto" />
            <div className="h-6 w-px bg-border" />
            <img src="/logo.png" alt="Skill and Tell" className="h-7 w-7 rounded-full border border-border" />
          </div>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {team && (
          <div className="px-4 py-3 border-b border-border">
            <p className="font-bold text-sm truncate">{team.team_name}</p>
            <p className="text-xs text-biohazard font-mono-arcade">{team.points} pts</p>
          </div>
        )}

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navLinks.map(({ to, label, icon: Icon }) => {
            const active = isLinkActive(location.pathname, location.search, to);
            return (
              <NavLink
                key={to}
                to={to}
                onClick={() => setSidebarOpen(false)}
                className={() =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
                {isParticipant && to === "/gifts" && giftNotifications > 0 && (
                  <span className="ml-auto bg-accent text-accent-foreground text-[10px] px-1.5 py-0.5 rounded-full">
                    {giftNotifications}
                  </span>
                )}
                {to === "/notifications" && unreadCount > 0 && (
                  <span className="ml-auto bg-toxic/20 text-toxic text-[10px] px-1.5 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
                {!isAdmin && to === "/ranking" && !rankingVisible && (
                  <span className="ml-auto bg-blood/20 text-blood text-[10px] px-1.5 py-0.5 rounded-full">OFF</span>
                )}
              </NavLink>
            );
          })}

          {isAdmin && !navLinks.some((l) => l.to === "/admin?tab=teams") && (
            <NavLink
              to="/admin?tab=teams"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${isActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"
                }`
              }
            >
              <Shield className="w-4 h-4" />
              <span>Admin</span>
            </NavLink>
          )}
        </nav>

        <div className="p-3 border-t border-border">
          <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-h-screen pt-14 md:pt-0">
        {systemBanner && (
          <div className="bg-toxic/15 border-b border-toxic px-4 py-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">{systemBanner.title}</p>
              <p className="text-xs text-foreground/80">{systemBanner.message}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => markAsRead(systemBanner.id)} className="h-6 w-6">
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}

        {/* Announcements */}
        {announcements.map((a: { id: string; title: string; content: string }) => (
          <div key={a.id} className="bg-blood/20 border-b border-blood px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-blood" />
              <span className="text-sm font-bold">{a.title}</span>
              <span className="text-xs text-foreground/80">{a.content}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => dismiss(a.id)} className="h-6 w-6">
              <X className="w-3 h-3" />
            </Button>
          </div>
        ))}

        <div className="p-4 md:p-6 max-w-4xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
