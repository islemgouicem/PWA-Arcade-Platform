import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb } from "lucide-react";

type RevealRow = {
  id: string;
  mission_id: string;
  hint_tier: string;
  hint_body: string;
  created_at: string;
  missions: { name: string; sequence_number: number | null } | null;
};

const tierLabel: Record<string, string> = {
  low: "Hint Low",
  mid: "Hint Mid",
  high: "Hint High",
};

export default function MyHintsPage() {
  const { team } = useAuth();

  const { data: reveals = [], isLoading } = useQuery({
    queryKey: ["my-hint-reveals", team?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_mission_hint_reveals")
        .select("id, mission_id, hint_tier, hint_body, created_at, missions(name, sequence_number)")
        .eq("team_id", team!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as RevealRow[];
    },
    enabled: !!team?.id,
  });

  const grouped = (() => {
    const m = new Map<string, RevealRow[]>();
    for (const r of reveals) {
      const key = r.mission_id;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return Array.from(m.entries()).map(([missionId, rows]) => ({
      missionId,
      missionTitle: rows[0]?.missions?.name ?? "Mission",
      seq: rows[0]?.missions?.sequence_number ?? null,
      rows: rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    }));
  })();

  if (!team) {
    return (
      <div className="p-6 text-muted-foreground font-flavor">
        Join or select a team to view hints.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Lightbulb className="w-8 h-8 text-toxic" />
        <div>
          <h1 className="text-3xl font-display text-toxic">My Hints</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every hint you unlock is kept here, grouped by mission, so nothing is lost when you close a card.
          </p>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground font-flavor">Loading…</p>}

      {!isLoading && grouped.length === 0 && (
        <Card className="border-border rounded-none">
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No hints unlocked yet. Use a hint card from your Card Book when missions are active.
          </CardContent>
        </Card>
      )}

      {grouped.map((g) => (
        <Card key={g.missionId} className="border-border rounded-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-display flex items-center gap-2 flex-wrap">
              {g.seq != null ? <span className="text-muted-foreground font-mono text-sm">M{g.seq}</span> : null}
              {g.missionTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {g.rows.map((r) => (
              <div
                key={r.id}
                className="rounded-md border border-border bg-background/50 p-3 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono-arcade text-[10px]">
                    {tierLabel[r.hint_tier] ?? r.hint_tier}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{r.hint_body}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
