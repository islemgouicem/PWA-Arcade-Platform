/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Activity, ShieldAlert } from "lucide-react";

export default function MissionsPage() {
    const { team, refreshTeam } = useAuth();
    const queryClient = useQueryClient();
    const [passwords, setPasswords] = useState<Record<string, string>>({});

    const refreshAll = () => {
        queryClient.invalidateQueries({ queryKey: ["missions-open"] });
        queryClient.invalidateQueries({ queryKey: ["missions-my-participations"] });
        refreshTeam();
    };

    const { data: missions = [] } = useQuery({
        queryKey: ["missions-open"],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from("missions")
                .select("id, name, infection_rate_per_minute, is_open")
                .eq("is_open", true)
                .order("name");
            if (error) throw error;
            return data || [];
        },
    });

    const { data: participations = [] } = useQuery({
        queryKey: ["missions-my-participations", team?.id],
        enabled: !!team?.id,
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from("mission_participations")
                .select("id, mission_id, status, joined_at, completed_at, missions(name)")
                .eq("team_id", team!.id)
                .order("joined_at", { ascending: false });
            if (error) throw error;
            return data || [];
        },
    });

    useEffect(() => {
        const id = window.setInterval(async () => {
            await (supabase as any).rpc("tick_all_mission_health");
            refreshTeam();
            queryClient.invalidateQueries({ queryKey: ["missions-my-participations"] });
        }, 10000);
        return () => window.clearInterval(id);
    }, [queryClient, refreshTeam]);

    const getPart = (missionId: string) => participations.find((p: any) => p.mission_id === missionId);

    const doRpc = async (name: string, args: Record<string, any>, okMsg: string) => {
        const { error } = await (supabase as any).rpc(name, args);
        if (error) {
            toast.error(error.message || "Operation failed");
            return;
        }
        toast.success(okMsg);
        refreshAll();
    };

    if (team?.is_suspended) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-blood" /> Mission Access Blocked</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm">Your team is suspended and cannot join missions.</p>
                    {team?.suspended_until && <p className="text-xs text-muted-foreground mt-1">Suspended until: {new Date(team.suspended_until as any).toLocaleString()}</p>}
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <h1 className="text-3xl font-display text-toxic flex items-center gap-2">
                <Activity className="w-8 h-8" /> Missions
            </h1>

            <Card>
                <CardContent className="p-4">
                    <p className="text-sm"><strong>Health Status:</strong> {Number(team?.health_status ?? 100).toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground mt-1">Health decreases while inside mission zones based on configured rates.</p>
                </CardContent>
            </Card>

            {missions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No missions are currently open.</p>
            ) : (
                missions.map((mission: any) => {
                    const part = getPart(mission.id);
                    const status = part?.status || "not_joined";
                    return (
                        <Card key={mission.id}>
                            <CardHeader>
                                <CardTitle className="text-lg">{mission.name}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <p className="text-xs text-muted-foreground">Infection rate: {mission.infection_rate_per_minute}%/min</p>
                                <p className="text-sm">Status: <strong>{status.replace("_", " ")}</strong></p>

                                <div className="flex flex-wrap gap-2">
                                    {!part && (
                                        <Button onClick={() => doRpc("join_mission", { p_mission_id: mission.id }, "Mission joined")}>Join Mission</Button>
                                    )}

                                    {part && (status === "outside" || status === "pending_entry") && (
                                        <Button onClick={() => doRpc("request_mission_entry", { p_mission_id: mission.id }, "Entry requested")}>Enter Zone</Button>
                                    )}

                                    {part && status === "inside" && (
                                        <Button variant="outline" onClick={() => doRpc("request_mission_exit", { p_mission_id: mission.id }, "Exit requested")}>Exit Zone</Button>
                                    )}
                                </div>

                                {part && status !== "completed" && (
                                    <div className="space-y-2 pt-2 border-t border-border">
                                        <Label htmlFor={`mission-pw-${mission.id}`}>Mission Completion Password</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                id={`mission-pw-${mission.id}`}
                                                type="password"
                                                value={passwords[mission.id] || ""}
                                                onChange={(e) => setPasswords((prev) => ({ ...prev, [mission.id]: e.target.value }))}
                                                placeholder="Enter mission password"
                                            />
                                            <Button
                                                onClick={() => doRpc("complete_mission_with_password", { p_mission_id: mission.id, p_password: passwords[mission.id] || "" }, "Mission completed. Coffre awarded")}
                                                disabled={!(passwords[mission.id] || "").trim()}
                                            >
                                                Submit
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })
            )}
        </div>
    );
}
