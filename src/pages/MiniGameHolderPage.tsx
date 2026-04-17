/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Trophy } from "lucide-react";

export default function MiniGameHolderPage() {
    const queryClient = useQueryClient();
    const [password, setPassword] = useState("");
    const [activeGame, setActiveGame] = useState<{ mini_game_id: string; game_name: string } | null>(null);
    const [rankings, setRankings] = useState<Record<string, string>>({});

    const { data: teams = [] } = useQuery({
        queryKey: ["holder-teams", activeGame?.mini_game_id],
        enabled: !!activeGame,
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from("teams")
                .select("id, team_name, is_suspended")
                .order("team_name");
            if (error) throw error;
            return data || [];
        },
    });

    useEffect(() => {
        const loadExisting = async () => {
            if (!activeGame) return;
            const { data } = await (supabase as any)
                .from("mini_game_rankings")
                .select("team_id, ranking")
                .eq("mini_game_id", activeGame.mini_game_id);

            const next: Record<string, string> = {};
            (data || []).forEach((r: any) => {
                next[r.team_id] = String(r.ranking);
            });
            setRankings(next);
        };

        loadExisting();
    }, [activeGame]);

    const unlock = async () => {
        const { data, error } = await (supabase as any).rpc("validate_minigame_holder_password", {
            p_password: password,
        });

        if (error || !data?.length) {
            toast.error(error?.message || "Wrong password");
            return;
        }

        setActiveGame(data[0]);
        toast.success("Authenticated");
    };

    const submitRankings = async () => {
        if (!activeGame) return;

        const payload = Object.entries(rankings)
            .filter(([, value]) => Number(value) > 0)
            .map(([teamId, value]) => ({ team_id: teamId, ranking: Number(value) }));

        const { error } = await (supabase as any).rpc("submit_mini_game_rankings", {
            p_mini_game_id: activeGame.mini_game_id,
            p_password: password,
            p_rankings: payload,
        });

        if (error) {
            toast.error(error.message || "Failed to submit rankings");
            return;
        }

        toast.success("Rankings submitted and points applied");
        queryClient.invalidateQueries({ queryKey: ["holder-teams"] });
    };

    if (!activeGame) {
        return (
            <div className="max-w-md mx-auto mt-10">
                <Card>
                    <CardHeader>
                        <CardTitle>Mini-Game Holder Authentication</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Label htmlFor="holderPassword">Password</Label>
                        <Input
                            id="holderPassword"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter holder password"
                        />
                        <Button className="w-full" onClick={unlock} disabled={!password.trim()}>
                            Unlock
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h1 className="text-3xl font-display text-toxic flex items-center gap-2">
                <Trophy className="w-8 h-8" /> {activeGame.game_name}
            </h1>

            <Card>
                <CardHeader>
                    <CardTitle>Team Rankings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {teams.map((team: any) => (
                        <div key={team.id} className="grid grid-cols-[1fr_140px] items-center gap-3">
                            <p className="text-sm font-medium">
                                {team.team_name}
                                {team.is_suspended && <span className="text-blood text-xs ml-2">(suspended)</span>}
                            </p>
                            <Input
                                type="number"
                                min={1}
                                value={rankings[team.id] || ""}
                                onChange={(e) => setRankings((prev) => ({ ...prev, [team.id]: e.target.value }))}
                                placeholder="Ranking"
                            />
                        </div>
                    ))}
                    <Button className="w-full mt-4" onClick={submitRankings}>Submit Rankings</Button>
                </CardContent>
            </Card>
        </div>
    );
}
