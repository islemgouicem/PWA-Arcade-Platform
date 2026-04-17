/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";

export default function MissionResponsiblePage() {
    const queryClient = useQueryClient();

    const { data: rows = [] } = useQuery({
        queryKey: ["mission-responsible-participations"],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from("mission_participations")
                .select("id, status, joined_at, entry_requested_at, exit_requested_at, teams(team_name, is_suspended), missions(name)")
                .in("status", ["outside", "pending_entry", "inside", "pending_exit"])
                .order("joined_at", { ascending: false });
            if (error) throw error;
            return data || [];
        },
        refetchInterval: 5000,
    });

    useEffect(() => {
        const id = window.setInterval(async () => {
            await (supabase as any).rpc("tick_all_mission_health");
            queryClient.invalidateQueries({ queryKey: ["mission-responsible-participations"] });
        }, 10000);
        return () => window.clearInterval(id);
    }, [queryClient]);

    const approve = async (id: string, action: "approve_entry" | "approve_exit") => {
        const { error } = await (supabase as any).rpc("validate_mission_transition", {
            p_participation_id: id,
            p_action: action,
        });

        if (error) {
            toast.error(error.message || "Validation failed");
            return;
        }

        toast.success(action === "approve_entry" ? "Entry validated" : "Exit validated");
        queryClient.invalidateQueries({ queryKey: ["mission-responsible-participations"] });
    };

    return (
        <div className="space-y-4">
            <h1 className="text-3xl font-display text-toxic flex items-center gap-2">
                <ClipboardCheck className="w-8 h-8" /> Mission Responsible
            </h1>

            {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active mission participations.</p>
            ) : (
                rows.map((row: any) => (
                    <Card key={row.id}>
                        <CardHeader>
                            <CardTitle className="text-lg">{row.missions?.name || "Mission"}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <p className="text-sm"><strong>Team:</strong> {row.teams?.team_name}</p>
                            <p className="text-sm"><strong>Status:</strong> {row.status.replace("_", " ")}</p>
                            {row.teams?.is_suspended && <p className="text-xs text-blood">Team is suspended</p>}

                            <div className="flex gap-2">
                                {row.status === "pending_entry" && (
                                    <Button onClick={() => approve(row.id, "approve_entry")}>Validate Entry</Button>
                                )}
                                {row.status === "pending_exit" && (
                                    <Button variant="outline" onClick={() => approve(row.id, "approve_exit")}>Validate Exit</Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))
            )}
        </div>
    );
}
