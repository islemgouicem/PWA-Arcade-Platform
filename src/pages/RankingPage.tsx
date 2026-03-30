/* eslint-disable @typescript-eslint/no-explicit-any */
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { usePlatformSettings } from "@/hooks/use-platform-settings";
import { motion } from "framer-motion";
import { Trophy, EyeOff, Shield, Star } from "lucide-react";

const PLACEHOLDER_ROWS = Array.from({ length: 6 }, (_, i) => ({ id: `placeholder-${i}` }));

export default function RankingPage() {
  const { team, isAdmin } = useAuth();
  const { getSetting, loading: settingsLoading } = usePlatformSettings();
  const isVisibleForNonAdmin = !settingsLoading && getSetting("ranking_visible", true) === true;
  const canViewRanking = isAdmin || isVisibleForNonAdmin;

  const { data: teams = [] } = useQuery({
    queryKey: ["ranking-teams"],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, team_name, points, is_winner")
        .order("points", { ascending: false });
      return data || [];
    },
    enabled: canViewRanking,
    refetchInterval: canViewRanking ? 10000 : false,
  });

  // Get mandatory card counts per team
  const { data: mandatoryCounts = {} } = useQuery({
    queryKey: ["mandatory-counts"],
    queryFn: async () => {
      const { data: mandatoryCards } = await supabase
        .from("cards")
        .select("id")
        .eq("is_mandatory", true);

      if (!mandatoryCards || mandatoryCards.length === 0) return {};

      const mandatoryIds = mandatoryCards.map(c => c.id);
      const { data: teamCards } = await supabase
        .from("team_cards")
        .select("team_id, card_id")
        .in("card_id", mandatoryIds);

      const counts: Record<string, number> = {};
      (teamCards || []).forEach((tc: any) => {
        counts[tc.team_id] = (counts[tc.team_id] || 0) + 1;
      });
      return counts;
    },
    enabled: canViewRanking,
    refetchInterval: canViewRanking ? 10000 : false,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-display text-toxic flex items-center gap-2">
        <Trophy className="w-8 h-8" /> Rankings
      </h1>

      <div className="relative rounded-lg">
        {!canViewRanking ? (
          <>
            <div className="pointer-events-none blur-md opacity-70">
              <div className="space-y-2">
                {PLACEHOLDER_ROWS.map((row) => (
                  <div key={row.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                    <div className="w-8 h-8 rounded-full bg-secondary" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-2/3 rounded bg-secondary" />
                      <div className="h-2.5 w-1/3 rounded bg-secondary" />
                    </div>
                    <div className="w-12 h-5 rounded bg-secondary" />
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute inset-0 z-10 bg-background/60 backdrop-blur-md rounded-lg flex flex-col items-center justify-center">
              <EyeOff className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-xl font-display text-muted-foreground">NOT AVAILABLE</p>
              <p className="text-sm text-muted-foreground font-flavor mt-1">Rankings are currently hidden</p>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            {teams.map((t: any, i: number) => {
              const isMyTeam = t.id === team?.id;
              const mandatoryCount = (mandatoryCounts as any)[t.id] || 0;

              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${isMyTeam
                    ? "border-toxic bg-toxic/10 glow-toxic"
                    : t.is_winner
                      ? "border-legendary-gold bg-legendary-gold/10 glow-legendary"
                      : "border-border bg-card"
                    }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${i === 0 ? "bg-legendary-gold text-primary-foreground" :
                    i === 1 ? "bg-muted-foreground text-primary-foreground" :
                      i === 2 ? "bg-rust text-primary-foreground" :
                        "bg-secondary text-foreground"
                    }`}>
                    {i + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`font-bold truncate ${isMyTeam ? "text-toxic" : ""}`}>
                      {t.team_name}
                      {t.is_winner && <Star className="w-4 h-4 inline ml-1 text-legendary-gold" />}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Shield className="w-3 h-3" /> {mandatoryCount} keys
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="font-mono-arcade text-lg font-bold">{t.points}</p>
                    <p className="text-[10px] text-muted-foreground">pts</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
