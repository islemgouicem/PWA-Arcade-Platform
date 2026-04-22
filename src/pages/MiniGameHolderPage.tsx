/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Trophy } from "lucide-react";

type PendingItem = {
    team_id: string;
    team_name: string;
    ranking: number;
    points_awarded: number;
};

export default function MiniGameHolderPage() {
    const queryClient = useQueryClient();
    const [password, setPassword] = useState("");
    const [activeGame, setActiveGame] = useState<{ mini_game_id: string; game_name: string } | null>(null);
    const [rankings, setRankings] = useState<Record<string, string>>({});
    const [isReviewing, setIsReviewing] = useState(false);
    const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submissionLog, setSubmissionLog] = useState<{ submitted_at: string; submission_items: PendingItem[] } | null>(null);

    const { data: teams = [] } = useQuery({
        queryKey: ["holder-teams", activeGame?.mini_game_id],
        enabled: !!activeGame,
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from("mini_game_joins")
                .select("team_id, is_active, teams:team_id(id, team_name, is_suspended)")
                .eq("mini_game_id", activeGame!.mini_game_id)
                .order("joined_at", { ascending: true });
            if (error) throw error;
            return (data || []).map((row: any) => ({
                id: row.teams?.id,
                team_name: row.teams?.team_name,
                is_suspended: row.teams?.is_suspended,
                is_active: row.is_active,
            })).filter((row: any) => !!row.id);
        },
    });

    const { data: gameMeta } = useQuery({
        queryKey: ["holder-game-meta", activeGame?.mini_game_id],
        enabled: !!activeGame,
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from("mini_games")
                .select("id, is_completed, completed_at")
                .eq("id", activeGame!.mini_game_id)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
    });

    const { data: rankMap = [] } = useQuery({
        queryKey: ["holder-rank-map", activeGame?.mini_game_id],
        enabled: !!activeGame,
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from("mini_game_rank_points")
                .select("rank_position, points_awarded")
                .eq("mini_game_id", activeGame!.mini_game_id)
                .order("rank_position", { ascending: true });
            if (error) throw error;
            return data || [];
        },
    });

    const { data: existingLog } = useQuery({
        queryKey: ["holder-submission-log", activeGame?.mini_game_id],
        enabled: !!activeGame,
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from("mini_game_submission_logs")
                .select("submitted_at, submission_items")
                .eq("mini_game_id", activeGame!.mini_game_id)
                .maybeSingle();
            if (error) throw error;
            return data || null;
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

    useEffect(() => {
        if (existingLog) {
            setSubmissionLog({
                submitted_at: existingLog.submitted_at,
                submission_items: (existingLog.submission_items || []) as PendingItem[],
            });
        }
    }, [existingLog]);

    const unlock = async () => {
        const { data, error } = await (supabase as any).rpc("validate_minigame_holder_password", {
            p_password: password,
        });

        if (error || !data?.length) {
            toast.error(error?.message || "Wrong password");
            return;
        }

        setActiveGame(data[0]);
        setIsReviewing(false);
        setPendingItems([]);
        setSubmissionLog(null);
        toast.success("Authenticated");
    };

    const submitRankings = async () => {
        if (!activeGame) return;
        if (gameMeta?.is_completed) {
            toast.error("This mini-game is already completed");
            return;
        }

        const pointsByRank = new Map<number, number>(
            rankMap.map((r: any) => [Number(r.rank_position), Number(r.points_awarded)])
        );

        const joinedTeams = teams.filter((t: any) => t.is_active);
        const reviewItems = joinedTeams.map((team: any) => {
            const ranking = Number(rankings[team.id] || 0);
            return {
                team_id: team.id,
                team_name: team.team_name,
                ranking,
                points_awarded: pointsByRank.get(ranking) ?? 0,
            };
        });

        if (reviewItems.some((item) => item.ranking <= 0)) {
            toast.error("All joined teams must have a ranking before review");
            return;
        }

        const uniqueRanks = new Set(reviewItems.map((item) => item.ranking));
        if (uniqueRanks.size !== reviewItems.length) {
            toast.error("Duplicate ranks are not allowed");
            return;
        }

        setPendingItems(reviewItems.sort((a, b) => a.ranking - b.ranking));
        setIsReviewing(true);
    };

    const getPointsForRank = (rank: number) => {
        const found = rankMap.find((r: any) => Number(r.rank_position) === rank);
        return found ? Number(found.points_awarded) : 0;
    };

    const confirmSubmission = async () => {
        if (!activeGame) return;
        if (pendingItems.length === 0) {
            toast.error("Nothing to submit");
            return;
        }

        setIsSubmitting(true);

        const payload = pendingItems.map((item) => ({ team_id: item.team_id, ranking: item.ranking }));

        const { error } = await (supabase as any).rpc("submit_mini_game_rankings", {
            p_mini_game_id: activeGame.mini_game_id,
            p_password: password,
            p_rankings: payload,
        });

        if (error) {
            toast.error(error.message || "Failed to submit rankings");
            setIsSubmitting(false);
            return;
        }

        const { data: logData, error: logError } = await (supabase as any)
            .from("mini_game_submission_logs")
            .select("submitted_at, submission_items")
            .eq("mini_game_id", activeGame.mini_game_id)
            .maybeSingle();

        if (!logError && logData) {
            setSubmissionLog({
                submitted_at: logData.submitted_at,
                submission_items: (logData.submission_items || []) as PendingItem[],
            });
        } else {
            setSubmissionLog({
                submitted_at: new Date().toISOString(),
                submission_items: pendingItems,
            });
        }

        setIsReviewing(false);
        setPendingItems([]);
        setIsSubmitting(false);

        toast.success("Submission confirmed. Rankings and points finalized.");
        queryClient.invalidateQueries({ queryKey: ["holder-teams"] });
        queryClient.invalidateQueries({ queryKey: ["holder-game-meta"] });
        queryClient.invalidateQueries({ queryKey: ["holder-submission-log"] });
        queryClient.invalidateQueries({ queryKey: ["ranking-teams"] });
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
                    {gameMeta?.is_completed && (
                        <p className="text-sm text-muted-foreground">
                            Completed at {new Date(gameMeta.completed_at).toLocaleString()}
                        </p>
                    )}
                    {teams.map((team: any) => {
                        const assignedRank = Number(rankings[team.id] || 0);
                        const assignedPoints = assignedRank > 0 ? getPointsForRank(assignedRank) : 0;

                        return (
                            <div key={team.id} className="grid grid-cols-[1fr_140px_110px] items-center gap-3">
                                <p className="text-sm font-medium">
                                    {team.team_name}
                                    {team.is_suspended && <span className="text-blood text-xs ml-2">(suspended)</span>}
                                    {!team.is_active && <span className="text-xs ml-2 text-muted-foreground">(completed)</span>}
                                </p>
                                <Input
                                    type="number"
                                    min={1}
                                    value={rankings[team.id] || ""}
                                    onChange={(e) => setRankings((prev) => ({ ...prev, [team.id]: e.target.value }))}
                                    placeholder="Ranking"
                                    disabled={!!gameMeta?.is_completed || isReviewing || !!submissionLog}
                                />
                                <p className="text-xs text-muted-foreground text-right">
                                    {assignedRank > 0 ? `+${assignedPoints} pts` : "-"}
                                </p>
                            </div>
                        )
                    })}
                    {!isReviewing && !submissionLog && (
                        <Button className="w-full mt-4" onClick={submitRankings} disabled={!!gameMeta?.is_completed}>Submit Rankings</Button>
                    )}
                </CardContent>
            </Card>

            <AlertDialog open={isReviewing} onOpenChange={setIsReviewing}>
                <AlertDialogContent className="bg-card border-border max-w-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Ranking Submission</AlertDialogTitle>
                        <AlertDialogDescription>
                            Review this submission before final confirmation. No data is written until you confirm.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm"><strong>Game:</strong> {activeGame.game_name}</p>
                        <div className="space-y-2 max-h-[45vh] overflow-y-auto">
                            {pendingItems.map((item) => (
                                <div key={item.team_id} className="grid grid-cols-[1fr_auto_auto] gap-3 text-sm border border-border p-2">
                                    <p>{item.team_name}</p>
                                    <p>Rank #{item.ranking}</p>
                                    <p>+{item.points_awarded} pts</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isSubmitting}>Back to Edit</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmSubmission} disabled={isSubmitting}>
                            {isSubmitting ? "Confirming..." : "Confirm Submission"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {submissionLog && (
                <Card>
                    <CardHeader>
                        <CardTitle>Submission Result Log</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Submitted at {new Date(submissionLog.submitted_at).toLocaleString()}
                        </p>
                        <div className="space-y-2">
                            {(submissionLog.submission_items || []).map((item) => (
                                <div key={item.team_id} className="grid grid-cols-[1fr_auto_auto] gap-3 text-sm border border-border p-2">
                                    <p>{item.team_name}</p>
                                    <p>Rank #{item.ranking}</p>
                                    <p>+{item.points_awarded} pts</p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
