/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Gamepad2, Users, Trophy, Save, RotateCcw } from "lucide-react";

export function HolderMiniGamesPage() {
    const queryClient = useQueryClient();
    const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
    const [holderPassword, setHolderPassword] = useState("");
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [participantUpdates, setParticipantUpdates] = useState<
        Record<string, { rank: number; points: number }>
    >({});

    const { data: allGames = [] } = useQuery({
        queryKey: ["holder-all-games"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("mini_games")
                .select("*")
                .order("name");
            if (error) throw error;
            return data || [];
        },
    });

    const { data: gameParticipants = [] } = useQuery({
        queryKey: ["game-participants", selectedGameId, isAuthenticated],
        enabled: !!selectedGameId && isAuthenticated,
        queryFn: async () => {
            if (!selectedGameId) return [];
            const { data, error } = await supabase
                .from("mini_game_participants")
                .select("*, profile:user_id(id, name)")
                .eq("mini_game_id", selectedGameId)
                .order("current_rank");
            if (error) throw error;
            return data || [];
        },
    });

    const authenticateAsHolder = async () => {
        if (!selectedGameId || !holderPassword.trim()) {
            toast.error("Please select a game and enter password");
            return;
        }

        try {
            const { data: isValid, error } = await (supabase as any).rpc("check_mini_game_password", {
                p_game_id: selectedGameId,
                p_password: holderPassword,
            });

            if (error || !isValid) {
                toast.error("Invalid holder password");
                return;
            }

            setIsAuthenticated(true);
            toast.success("Authenticated as holder");
            setHolderPassword("");
        } catch (err: any) {
            toast.error(err.message || "Authentication failed");
        }
    };

    const updateParticipant = (participantId: string, rank: number, points: number) => {
        setParticipantUpdates({
            ...participantUpdates,
            [participantId]: { rank: Math.max(1, Math.min(12, rank)), points: Math.max(0, points) },
        });
    };

    const saveParticipantUpdates = async () => {
        const updates = Object.entries(participantUpdates);
        if (updates.length === 0) {
            toast.error("No changes to save");
            return;
        }

        try {
            for (const [participantId, { rank, points }] of updates) {
                const { error } = await supabase
                    .from("mini_game_participants")
                    .update({ current_rank: rank, points_earned: points })
                    .eq("id", participantId);

                if (error) throw error;
            }

            toast.success("Participants updated!");
            setParticipantUpdates({});
            queryClient.invalidateQueries({ queryKey: ["game-participants"] });
        } catch (err: any) {
            toast.error(err.message || "Failed to update participants");
        }
    };

    const resetForm = () => {
        setSelectedGameId(null);
        setHolderPassword("");
        setIsAuthenticated(false);
        setParticipantUpdates({});
    };

    return (
        <div className="space-y-6 mt-4">
            {!isAuthenticated ? (
                /* Selection and Authentication */
                <Card>
                    <CardHeader>
                        <CardTitle>Holder Access</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label className="font-flavor">Select Mini-Game</Label>
                            <select
                                value={selectedGameId || ""}
                                onChange={(e) => setSelectedGameId(e.target.value || null)}
                                className="w-full mt-2 px-3 py-2 border border-input rounded-md bg-background"
                            >
                                <option value="">-- Choose a game --</option>
                                {allGames.map((game: any) => (
                                    <option key={game.id} value={game.id}>
                                        {game.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <Label htmlFor="holderPwd" className="font-flavor">
                                Holder Password
                            </Label>
                            <Input
                                id="holderPwd"
                                type="password"
                                value={holderPassword}
                                onChange={(e) => setHolderPassword(e.target.value)}
                                placeholder="Enter holder password"
                                className="mt-2"
                            />
                        </div>
                        <Button onClick={authenticateAsHolder} className="w-full">
                            Authenticate
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                /* Authenticated View */
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-display text-xl flex items-center gap-2">
                            <Gamepad2 className="w-5 h-5 text-toxic" />
                            {allGames.find((g: any) => g.id === selectedGameId)?.name}
                        </h2>
                        <Button size="sm" variant="outline" onClick={resetForm}>
                            <RotateCcw className="w-3 h-3 mr-1" /> Exit
                        </Button>
                    </div>

                    {gameParticipants.length === 0 ? (
                        <Card className="border-dashed">
                            <CardContent className="pt-6 text-center text-muted-foreground">
                                No participants yet
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Users className="w-4 h-4" />
                                    {gameParticipants.length} participant{gameParticipants.length !== 1 ? "s" : ""}
                                </div>

                                {gameParticipants.map((participant: any) => {
                                    const current = participantUpdates[participant.id] || {
                                        rank: participant.current_rank,
                                        points: participant.points_earned,
                                    };

                                    return (
                                        <motion.div
                                            key={participant.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                        >
                                            <Card>
                                                <CardContent className="pt-4 space-y-2">
                                                    <p className="font-flavor text-sm">
                                                        {participant.profile?.name || "Unknown Player"}
                                                    </p>

                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <Label htmlFor={`rank-${participant.id}`} className="text-xs">
                                                                Rank
                                                            </Label>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() =>
                                                                        updateParticipant(participant.id, current.rank - 1, current.points)
                                                                    }
                                                                    className="h-8 w-8 p-0"
                                                                >
                                                                    −
                                                                </Button>
                                                                <Input
                                                                    id={`rank-${participant.id}`}
                                                                    type="number"
                                                                    value={current.rank}
                                                                    onChange={(e) =>
                                                                        updateParticipant(participant.id, parseInt(e.target.value) || 1, current.points)
                                                                    }
                                                                    min="1"
                                                                    max="12"
                                                                    className="h-8 text-center"
                                                                />
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() =>
                                                                        updateParticipant(participant.id, current.rank + 1, current.points)
                                                                    }
                                                                    className="h-8 w-8 p-0"
                                                                >
                                                                    +
                                                                </Button>
                                                            </div>
                                                        </div>

                                                        <div>
                                                            <Label htmlFor={`points-${participant.id}`} className="text-xs">
                                                                Points
                                                            </Label>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() =>
                                                                        updateParticipant(participant.id, current.rank, current.points - 1)
                                                                    }
                                                                    className="h-8 w-8 p-0"
                                                                >
                                                                    −
                                                                </Button>
                                                                <Input
                                                                    id={`points-${participant.id}`}
                                                                    type="number"
                                                                    value={current.points}
                                                                    onChange={(e) =>
                                                                        updateParticipant(participant.id, current.rank, parseInt(e.target.value) || 0)
                                                                    }
                                                                    min="0"
                                                                    className="h-8 text-center"
                                                                />
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() =>
                                                                        updateParticipant(participant.id, current.rank, current.points + 1)
                                                                    }
                                                                    className="h-8 w-8 p-0"
                                                                >
                                                                    +
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {participantUpdates[participant.id] && (
                                                        <div className="text-xs text-toxic font-flavor">
                                                            ✓ Pending update
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        </motion.div>
                                    );
                                })}
                            </div>

                            {Object.keys(participantUpdates).length > 0 && (
                                <Button onClick={saveParticipantUpdates} className="w-full">
                                    <Save className="w-4 h-4 mr-2" />
                                    Save {Object.keys(participantUpdates).length} Update
                                    {Object.keys(participantUpdates).length !== 1 ? "s" : ""}
                                </Button>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
