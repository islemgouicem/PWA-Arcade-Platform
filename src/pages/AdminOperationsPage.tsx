/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";

export default function AdminOperationsPage() {
    const queryClient = useQueryClient();
    const [missionPasswords, setMissionPasswords] = useState<Record<string, string>>({});
    const [miniPasswords, setMiniPasswords] = useState<Record<string, string>>({});
    const [selectedMiniGame, setSelectedMiniGame] = useState<string>("");
    const [rankValues, setRankValues] = useState<Record<number, string>>({
        1: "100", 2: "90", 3: "80", 4: "70", 5: "60", 6: "50", 7: "40", 8: "30", 9: "20", 10: "10", 11: "5", 12: "1"
    });

    const { data: settings = [] } = useQuery({
        queryKey: ["admin-ops-settings"],
        queryFn: async () => {
            const { data, error } = await (supabase as any).from("platform_settings").select("key, value");
            if (error) throw error;
            return data || [];
        },
    });

    const { data: missions = [] } = useQuery({
        queryKey: ["admin-ops-missions"],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from("missions")
                .select("id, name, is_open, infection_rate_per_minute")
                .order("name");
            if (error) throw error;
            return data || [];
        },
    });

    const { data: miniGames = [] } = useQuery({
        queryKey: ["admin-ops-mini-games"],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from("mini_games")
                .select("id, name, is_open")
                .order("name");
            if (error) throw error;
            return data || [];
        },
    });

    const { data: rankMap = [] } = useQuery({
        queryKey: ["admin-ops-rank-map", selectedMiniGame],
        enabled: !!selectedMiniGame,
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from("mini_game_rank_points")
                .select("id, rank_position, points_awarded")
                .eq("mini_game_id", selectedMiniGame)
                .order("rank_position");
            if (error) throw error;
            return data || [];
        },
    });

    const getSetting = (key: string, fallback: number) => {
        const val = settings.find((s: any) => s.key === key)?.value;
        const n = Number(typeof val === "string" ? val.replace(/\"/g, "") : val);
        return Number.isFinite(n) ? n : fallback;
    };

    const numericSettings = useMemo(
        () => [
            { key: "health_base_decrease_rate_per_minute", label: "Base Health Decrease (%/min)", value: getSetting("health_base_decrease_rate_per_minute", 1) },
            { key: "suspension_duration_minutes", label: "Suspension Duration (minutes)", value: getSetting("suspension_duration_minutes", 10) },
            { key: "health_zero_penalty_points", label: "Penalty Points (HS=0)", value: getSetting("health_zero_penalty_points", 50) },
        ],
        [settings],
    );

    const updateSetting = async (key: string, value: number) => {
        const { error } = await (supabase as any)
            .from("platform_settings")
            .upsert({ key, value }, { onConflict: "key" });
        if (error) {
            toast.error(error.message || "Failed to update setting");
            return;
        }
        queryClient.invalidateQueries({ queryKey: ["admin-ops-settings"] });
        toast.success("Setting updated");
    };

    const toggleMissionOpen = async (missionId: string, current: boolean) => {
        const { error } = await (supabase as any).from("missions").update({ is_open: !current }).eq("id", missionId);
        if (error) return toast.error(error.message || "Failed");
        queryClient.invalidateQueries({ queryKey: ["admin-ops-missions"] });
    };

    const updateMissionRate = async (missionId: string, value: string) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return toast.error("Invalid infection rate");
        const { error } = await (supabase as any).from("missions").update({ infection_rate_per_minute: n }).eq("id", missionId);
        if (error) return toast.error(error.message || "Failed");
        queryClient.invalidateQueries({ queryKey: ["admin-ops-missions"] });
        toast.success("Mission infection rate updated");
    };

    const setMissionPassword = async (missionId: string) => {
        const pw = missionPasswords[missionId] || "";
        if (!pw.trim()) return;
        const { error } = await (supabase as any).rpc("admin_set_mission_password", {
            p_mission_id: missionId,
            p_password: pw,
        });
        if (error) return toast.error(error.message || "Failed");
        setMissionPasswords((p) => ({ ...p, [missionId]: "" }));
        toast.success("Mission password updated securely");
    };

    const toggleMiniGameOpen = async (id: string, current: boolean) => {
        const { error } = await (supabase as any).from("mini_games").update({ is_open: !current }).eq("id", id);
        if (error) return toast.error(error.message || "Failed");
        queryClient.invalidateQueries({ queryKey: ["admin-ops-mini-games"] });
    };

    const setMiniGamePassword = async (miniId: string) => {
        const pw = miniPasswords[miniId] || "";
        if (!pw.trim()) return;
        const { error } = await (supabase as any).rpc("admin_set_minigame_password", {
            p_mini_game_id: miniId,
            p_password: pw,
        });
        if (error) return toast.error(error.message || "Failed");
        setMiniPasswords((p) => ({ ...p, [miniId]: "" }));
        toast.success("Mini-game password updated securely");
    };

    const saveRankMappings = async () => {
        if (!selectedMiniGame) return;

        const mappings = [];
        for (let rank = 1; rank <= 12; rank++) {
            const points = Number(rankValues[rank] || 0);
            if (!Number.isFinite(points)) {
                toast.error(`Invalid points for rank ${rank}`);
                return;
            }
            mappings.push({ mini_game_id: selectedMiniGame, rank_position: rank, points_awarded: points });
        }

        const { error } = await (supabase as any)
            .from("mini_game_rank_points")
            .upsert(mappings, { onConflict: "mini_game_id,rank_position" });

        if (error) return toast.error(error.message || "Failed");
        queryClient.invalidateQueries({ queryKey: ["admin-ops-rank-map", selectedMiniGame] });
        toast.success("All 12 ranking mappings saved");
    };

    return (
        <div className="space-y-4">
            <h1 className="text-3xl font-display text-toxic flex items-center gap-2">
                <Settings2 className="w-8 h-8" /> Admin Operations Config
            </h1>

            <Card>
                <CardHeader><CardTitle>Core Config</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    {numericSettings.map((s) => (
                        <div key={s.key} className="grid grid-cols-[1fr_180px_auto] gap-2 items-end">
                            <Label>{s.label}</Label>
                            <Input defaultValue={String(s.value)} type="number" id={`cfg-${s.key}`} />
                            <Button onClick={() => {
                                const input = document.getElementById(`cfg-${s.key}`) as HTMLInputElement | null;
                                updateSetting(s.key, Number(input?.value || s.value));
                            }}>Save</Button>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Missions</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    {missions.map((m: any) => (
                        <div key={m.id} className="border border-border rounded-md p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="font-semibold">{m.name}</p>
                                <Switch checked={!!m.is_open} onCheckedChange={() => toggleMissionOpen(m.id, !!m.is_open)} />
                            </div>
                            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                                <div>
                                    <Label>Infection Rate (%/min)</Label>
                                    <Input id={`mission-rate-${m.id}`} type="number" defaultValue={String(m.infection_rate_per_minute)} />
                                </div>
                                <Button onClick={() => {
                                    const input = document.getElementById(`mission-rate-${m.id}`) as HTMLInputElement | null;
                                    updateMissionRate(m.id, input?.value || "0");
                                }}>Save Rate</Button>
                            </div>
                            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                                <div>
                                    <Label>Mission Password</Label>
                                    <Input type="password" value={missionPasswords[m.id] || ""} onChange={(e) => setMissionPasswords((p) => ({ ...p, [m.id]: e.target.value }))} />
                                </div>
                                <Button onClick={() => setMissionPassword(m.id)}>Update Password</Button>
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Mini-Games</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    {miniGames.map((g: any) => (
                        <div key={g.id} className="border border-border rounded-md p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="font-semibold">{g.name}</p>
                                <Switch checked={!!g.is_open} onCheckedChange={() => toggleMiniGameOpen(g.id, !!g.is_open)} />
                            </div>
                            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                                <div>
                                    <Label>Mini-Game Password</Label>
                                    <Input type="password" value={miniPasswords[g.id] || ""} onChange={(e) => setMiniPasswords((p) => ({ ...p, [g.id]: e.target.value }))} />
                                </div>
                                <Button onClick={() => setMiniGamePassword(g.id)}>Update Password</Button>
                            </div>
                        </div>
                    ))}

                    <div className="pt-2 border-t border-border space-y-2">
                        <Label>Ranking -&gt; Points Mapping (12 Teams)</Label>
                        <Select value={selectedMiniGame} onValueChange={setSelectedMiniGame}>
                            <SelectTrigger><SelectValue placeholder="Select mini-game" /></SelectTrigger>
                            <SelectContent>
                                {miniGames.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        {selectedMiniGame && (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {Array.from({ length: 12 }, (_, i) => i + 1).map((rank) => (
                                        <div key={rank} className="flex items-center gap-2">
                                            <Label className="text-sm w-12">#{rank}</Label>
                                            <Input
                                                type="number"
                                                placeholder="Points"
                                                value={rankValues[rank] || ""}
                                                onChange={(e) => setRankValues((prev) => ({ ...prev, [rank]: e.target.value }))}
                                                className="flex-1"
                                            />
                                        </div>
                                    ))}
                                </div>
                                <Button onClick={saveRankMappings} className="w-full">Save All Rank Mappings</Button>
                                <div className="text-xs text-muted-foreground space-y-1">
                                    {rankMap.map((r: any) => (
                                        <p key={r.id}>#{r.rank_position} → {r.points_awarded} pts</p>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
