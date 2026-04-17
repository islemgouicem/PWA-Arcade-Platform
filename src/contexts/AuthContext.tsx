import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface Team {
  id: string;
  team_name: string;
  points: number;
  is_suspended: boolean;
  is_winner: boolean;
  health_status?: number;
  suspended_until?: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  team: Team | null;
  roles: string[];
  loading: boolean;
  isAdmin: boolean;
  isShopper: boolean;
  isParticipant: boolean;
  isMiniGameHolder: boolean;
  isMissionResponsible: boolean;
  signUp: (email: string, password: string, teamName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshTeam: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
    if (teamRes.data) setTeam(teamRes.data as Team);
    if (rolesRes.data) setRoles(rolesRes.data.map((r: any) => r.role));
  };

  const refreshTeam = async () => {
    if (user) await fetchTeamAndRoles(user.id);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => fetchTeamAndRoles(session.user.id), 0);
      } else {
        setTeam(null);
        setRoles([]);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchTeamAndRoles(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

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

  return (
    <AuthContext.Provider value={{
      user, session, team, roles, loading,
      isAdmin, isShopper, isParticipant, isMiniGameHolder, isMissionResponsible,
      signUp, signIn, signOut, refreshTeam,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
