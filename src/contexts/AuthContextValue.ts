import { createContext } from "react";

export interface AuthContextType {
    user: import("@supabase/supabase-js").User | null;
    session: import("@supabase/supabase-js").Session | null;
    team: {
        id: string;
        team_name: string;
        points: number;
        is_suspended: boolean;
        is_winner: boolean;
        health_status?: number;
        suspended_until?: string | null;
    } | null;
    roles: string[];
    loading: boolean;
    isAdmin: boolean;
    isShopper: boolean;
    isParticipant: boolean;
    isMiniGameHolder: boolean;
    isMissionResponsible: boolean;
    isZoneHandler: boolean;
    signUp: (email: string, password: string, teamName: string) => Promise<{ error: any }>;
    signIn: (email: string, password: string) => Promise<{ error: any }>;
    signOut: () => Promise<void>;
    refreshTeam: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);