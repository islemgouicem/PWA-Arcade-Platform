/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Timer, Gamepad2 } from "lucide-react";

function useLiveElapsed(fromIso?: string | null) {
    const [, tick] = useState(0);
    useEffect(() => {
        if (!fromIso) return;
        const id = window.setInterval(() => tick((v) => v + 1), 1000);
        return () => window.clearInterval(id);
    }, [fromIso]);

    if (!fromIso) return "00:00:00";
    const sec = Math.max(0, Math.floor((Date.now() - new Date(fromIso).getTime()) / 1000));
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
}

export default function MiniGamesPage() {
    const { team } = useAuth();
    const queryClient = useQueryClient();

    const { data: openGames = [] } = useQuery({
        queryKey: ["mini-games-open"],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from("mini_games")
                .select("id, name, is_open")
                .eq("is_open", true)
                .order("name");
            if (error) throw error;
            return data || [];
        },
    });

    const { data: activeJoin } = useQuery({
        queryKey: ["mini-games-my-active", team?.id],
        enabled: !!team?.id,
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from("mini_game_joins")
                .select("id, joined_at, mini_game_id, mini_games(name)")
                .eq("team_id", team!.id)
                .eq("is_active", true)
                .order("joined_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
    });

    const elapsed = useLiveElapsed(activeJoin?.joined_at);

    const handleJoin = async (gameId: string) => {
        const { error } = await (supabase as any).rpc("join_mini_game", {
            p_mini_game_id: gameId,
        });

        if (error) {
            toast.error(error.message || "Could not join mini-game");
            return;
        }

        toast.success("Joined mini-game. Show this confirmation screen to the holder.");
        queryClient.invalidateQueries({ queryKey: ["mini-games-my-active"] });
    };

    if (team?.is_suspended) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Mini Games</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-blood">Your team is suspended and cannot join mini-games right now.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <h1 className="text-3xl font-display text-toxic flex items-center gap-2">
                <Gamepad2 className="w-8 h-8" /> Mini Games
            </h1>

            {activeJoin ? (
                <Card className="border-toxic/40">
                    <CardHeader>
                        <CardTitle>Participation Confirmation</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <p><strong>Team:</strong> {team?.team_name}</p>
                        <p><strong>Game:</strong> {(activeJoin.mini_games as any)?.name || "Mini Game"}</p>
                        <p className="flex items-center gap-2 text-biohazard">
                            <Timer className="w-4 h-4" /> <strong>{elapsed}</strong>
                        </p>
                        <p className="text-xs text-muted-foreground">Show this screen to the mini-game holder.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {openGames.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No mini-games are currently open.</p>
                    ) : (
                        openGames.map((game: any) => (
                            <Card key={game.id}>
                                <CardContent className="p-4 flex items-center justify-between">
                                    <p className="font-semibold">{game.name}</p>
                                    <Button onClick={() => handleJoin(game.id)}>Join</Button>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
