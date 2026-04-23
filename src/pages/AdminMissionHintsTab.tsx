/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Plus, BookMarked } from "lucide-react";

type MissionRow = { id: string; name: string; sequence_number: number | null };
type HintEntry = {
  id: string;
  mission_id: string;
  tier: string;
  body: string;
  is_active: boolean;
  created_at: string;
};

export function AdminMissionHintsTab() {
  const queryClient = useQueryClient();
  const [missionId, setMissionId] = useState<string>("");
  const [tier, setTier] = useState<"low" | "mid" | "high">("low");
  const [body, setBody] = useState("");

  const { data: missions = [] } = useQuery({
    queryKey: ["admin-mission-hints-missions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("missions")
        .select("id, name, sequence_number")
        .order("sequence_number", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as MissionRow[];
    },
  });

  const selectedMission = useMemo(
    () => missions.find((m) => m.id === missionId) ?? null,
    [missions, missionId],
  );

  const { data: hints = [], isLoading } = useQuery({
    queryKey: ["admin-mission-hints", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_hint_entries")
        .select("id, mission_id, tier, body, is_active, created_at")
        .eq("mission_id", missionId)
        .order("tier", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as HintEntry[];
    },
    enabled: !!missionId,
  });

  const addHint = async () => {
    if (!missionId) {
      toast.error("Select a mission first");
      return;
    }
    const trimmed = body.trim();
    if (!trimmed) {
      toast.error("Enter hint text");
      return;
    }
    const { error } = await supabase.from("mission_hint_entries").insert({
      mission_id: missionId,
      tier,
      body: trimmed,
      is_active: true,
    });
    if (error) {
      toast.error(error.message || "Failed to add hint");
      return;
    }
    toast.success("Hint added");
    setBody("");
    queryClient.invalidateQueries({ queryKey: ["admin-mission-hints", missionId] });
  };

  const removeHint = async (id: string) => {
    const { error } = await supabase.from("mission_hint_entries").delete().eq("id", id);
    if (error) {
      toast.error(error.message || "Failed to delete");
      return;
    }
    toast.success("Hint removed");
    queryClient.invalidateQueries({ queryKey: ["admin-mission-hints", missionId] });
  };

  return (
    <div className="space-y-4 mt-4">
      <h2 className="text-2xl font-display text-toxic flex items-center gap-2">
        <BookMarked className="w-6 h-6" /> Mission hints (content)
      </h2>
      <p className="text-sm text-muted-foreground max-w-3xl">
        Hints are stored per mission with a level (Low / Mid / High). Teams draw a random unused line from this pool when
        they activate the matching hint card. Price and shop visibility for hint cards are configured under the Shop tab.
      </p>

      <Card className="border-border rounded-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Select mission</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select
            value={missionId || "__none__"}
            onValueChange={(v) => setMissionId(v === "__none__" ? "" : v)}
          >
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Choose mission…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {missions.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.sequence_number != null ? `M${m.sequence_number}: ` : ""}
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {missionId && (
            <>
              <div className="grid gap-3 md:grid-cols-2 border-t border-border pt-4">
                <div className="space-y-2">
                  <Label>Level</Label>
                  <Select value={tier} onValueChange={(v) => setTier(v as "low" | "mid" | "high")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low (Hint Low card)</SelectItem>
                      <SelectItem value="mid">Mid (Hint Mid card)</SelectItem>
                      <SelectItem value="high">High (Hint High card)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Hint text</Label>
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={4}
                    placeholder="Full hint content shown to the team…"
                    className="font-flavor text-sm"
                  />
                  <Button type="button" size="sm" onClick={addHint} className="gap-1">
                    <Plus className="w-4 h-4" /> Add hint
                  </Button>
                </div>
              </div>

              <div className="border-t border-border pt-4 space-y-2">
                <p className="text-sm font-semibold">
                  Entries for {selectedMission?.name ?? "mission"}
                  {isLoading ? " (loading…)" : ` (${hints.length})`}
                </p>
                <div className="space-y-2 max-h-[480px] overflow-y-auto">
                  {hints.map((h) => (
                    <div
                      key={h.id}
                      className="flex gap-2 rounded-md border border-border p-3 bg-background/40 text-sm"
                    >
                      <div className="flex-1 space-y-1 min-w-0">
                        <span className="text-[10px] uppercase tracking-wide text-toxic font-bold">{h.tier}</span>
                        <p className="whitespace-pre-wrap break-words">{h.body}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-blood"
                        onClick={() => removeHint(h.id)}
                        aria-label="Delete hint"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {!isLoading && hints.length === 0 && (
                    <p className="text-xs text-muted-foreground">No rows yet for this mission and level.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
