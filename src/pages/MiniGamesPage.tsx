/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Gamepad2 } from "lucide-react";

export default function MiniGamesPage() {
    const { team } = useAuth();
    const queryClient = useQueryClient();

    const { data: games = [], error: gamesError } = useQuery({
        queryKey: ["mini-games-all"],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from("mini_games")
                .select("id, name, is_open")
                .order("name");
            if (error) throw error;
            return data || [];
        },
    });

    const { data: myJoins = [] } = useQuery({
        queryKey: ["mini-games-my-joins", team?.id],
        enabled: !!team?.id,
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from("mini_game_joins")
                .select("mini_game_id, is_active")
                .eq("team_id", team!.id)
                .order("joined_at", { ascending: false });
            if (error) throw error;
            return data || [];
        },
    });

    const { data: myRankings = [] } = useQuery({
        queryKey: ["mini-games-my-rankings", team?.id],
        enabled: !!team?.id,
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from("mini_game_rankings")
                .select("mini_game_id, ranking")
                .eq("team_id", team!.id)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data || [];
        },
    });

    const statusByGameId = useMemo(() => {
        const completed = new Set(myRankings.map((r: any) => r.mini_game_id));
        const joined = new Set(myJoins.filter((j: any) => j.is_active).map((j: any) => j.mini_game_id));
        return { completed, joined };
    }, [myJoins, myRankings]);

    const handleJoin = async (gameId: string) => {
        const { error } = await (supabase as any).rpc("join_mini_game", {
            p_mini_game_id: gameId,
        });

        if (error) {
            toast.error(error.message || "Could not join mini-game");
            return;
        }

        toast.success("Joined mini-game. Show this confirmation screen to the holder.");
        queryClient.invalidateQueries({ queryKey: ["mini-games-my-joins"] });
        queryClient.invalidateQueries({ queryKey: ["mini-games-my-rankings"] });
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

            <div className="space-y-3">
                {gamesError ? (
                    <p className="text-sm text-blood">Failed to load mini-games. Please refresh.</p>
                ) : games.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No open mini-games currently available.</p>
                ) : (
                    games.map((game: any) => {
                        const isCompleted = statusByGameId.completed.has(game.id);
                        const isJoined = statusByGameId.joined.has(game.id);
                        const canJoin = game.is_open && !isCompleted && !isJoined;

                        return (
                            <Card key={game.id}>
                                <CardContent className="p-4 flex items-center justify-between gap-3">
                                    <p className="font-semibold">{game.name}</p>
                                    {isCompleted ? (
                                        <span className="text-sm text-muted-foreground">Completed</span>
                                    ) : isJoined ? (
                                        <span className="text-sm text-muted-foreground">Joined</span>
                                    ) : (
                                        <Button onClick={() => handleJoin(game.id)} disabled={!canJoin}>Join</Button>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>
        </div>
    );
}
