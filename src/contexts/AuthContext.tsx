/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { AuthContext } from "@/contexts/AuthContextValue";

interface Team {
  id: string;
  team_name: string;
  points: number;
  is_suspended: boolean;
  is_winner: boolean;
  health_status?: number;
  suspended_until?: string | null;
}

type AuthContextType = import("@/contexts/AuthContextValue").AuthContextType;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTeamAndRoles = async (userId: string) => {
    const [teamRes, rolesRes] = await Promise.all([
      supabase.from("teams").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setTeam((teamRes.data as Team) ?? null);
    setRoles((rolesRes.data || []).map((r: any) => r.role));
  };

  const refreshTeam = async () => {
    if (user) await fetchTeamAndRoles(user.id);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setLoading(true);
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(async () => {
          await fetchTeamAndRoles(session.user.id);
          setLoading(false);
        }, 0);
      } else {
        setTeam(null);
        setRoles([]);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setLoading(true);
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchTeamAndRoles(session.user.id);
      } else {
        setTeam(null);
        setRoles([]);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const refresh = () => {
      void fetchTeamAndRoles(user.id);
    };

    // Keep health/points/status synced for PWA sessions.
    const intervalId = window.setInterval(refresh, 3000);

    const teamChannel = supabase
      .channel(`team-live-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "teams",
        },
        (payload: any) => {
          const rowUserId = payload?.new?.user_id ?? payload?.old?.user_id;
          if (rowUserId === user.id) {
            refresh();
          }
        },
      )
      .subscribe();

    return () => {
      window.clearInterval(intervalId);
      supabase.removeChannel(teamChannel);
    };
  }, [user?.id]);

  const signUp = async (email: string, password: string, teamName: string) => {
    const { data: registrationSetting } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "registration_open")
      .maybeSingle();

    if (registrationSetting && registrationSetting.value !== true) {
      return { error: new Error("Registration is currently closed by the admin") };
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { team_name: teamName } },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setTeam(null);
    setRoles([]);
  };

  const isAdmin = roles.includes("admin");
  const isShopper = roles.includes("shopper");
  const isParticipant = roles.includes("participant");
  const isMiniGameHolder = roles.includes("mini_game_holder");
  const isMissionResponsible = roles.includes("mission_responsible");
  const isZoneHandler = roles.includes("zone_handler");

  return (
    <AuthContext.Provider value={{
      user, session, team, roles, loading,
      isAdmin, isShopper, isParticipant, isMiniGameHolder, isMissionResponsible, isZoneHandler,
      signUp, signIn, signOut, refreshTeam,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

