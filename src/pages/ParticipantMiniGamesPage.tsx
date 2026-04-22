/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Gamepad2, Trophy, LogIn, Zap } from "lucide-react";

export function ParticipantMiniGamesPage() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
    const [holderPassword, setHolderPassword] = useState("");

    const { data: openGames = [] } = useQuery({
        queryKey: ["participant-open-games"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("mini_games")
                .select("*")
                .eq("is_open", true)
                .order("name");
            if (error) throw error;
            return data || [];
        },
    });

    const { data: userParticipations = [] } = useQuery({
        queryKey: ["user-mini-game-participations", user?.id],
        enabled: !!user?.id,
        queryFn: async () => {
            if (!user?.id) return [];
            const { data, error } = await supabase
                .from("mini_game_participants")
                .select("*, mini_games(name, is_open), profile:user_id(name, rank)")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data || [];
        },
    });

    const joinGame = async (gameId: string) => {
        if (!holderPassword.trim()) {
            toast.error("Please enter holder password");
            return;
        }

        try {
            // Verify password using check_mini_game_password
            const { data: isValid, error: checkError } = await (supabase as any).rpc("check_mini_game_password", {
                p_game_id: gameId,
                p_password: holderPassword,
            });

            if (checkError || !isValid) {
                toast.error("Invalid holder password");
                return;
            }

            // Check if already a participant
            const { data: existing } = await supabase
                .from("mini_game_participants")
                .select("id")
                .eq("mini_game_id", gameId)
                .eq("user_id", user?.id)
                .single();

            if (existing) {
                toast.error("You're already participating in this game");
                return;
            }

            // Add as participant
            const { error } = await supabase.from("mini_game_participants").insert({
                mini_game_id: gameId,
                user_id: user?.id,
                current_rank: 12,
                points_earned: 0,
            });

            if (error) throw error;
            toast.success("Joined mini-game!");
            setHolderPassword("");
            setSelectedGameId(null);
            queryClient.invalidateQueries({ queryKey: ["user-mini-game-participations"] });
        } catch (err: any) {
            toast.error(err.message || "Failed to join game");
        }
    };

    return (
        <div className="space-y-6 mt-4">
            {/* Available Games */}
            <div className="space-y-3">
                <h2 className="font-display text-xl">Available Mini-Games</h2>
                {openGames.length === 0 ? (
                    <Card className="border-dashed">
                        <CardContent className="pt-6 text-center text-muted-foreground">
                            No mini-games are currently open
                        </CardContent>
                    </Card>
                ) : (
                    openGames.map((game: any) => (
                        <motion.div
                            key={game.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            <Card>
                                <CardHeader className="pb-2">
                                    <div className="flex items-center gap-2">
                                        <Gamepad2 className="w-4 h-4 text-toxic" />
                                        <CardTitle className="text-lg">{game.name}</CardTitle>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <p className="text-sm text-muted-foreground">
                                        Participate in {game.name} to earn points and improve your ranking!
                                    </p>
                                    {selectedGameId === game.id ? (
                                        <div className="space-y-2 bg-secondary/40 rounded p-3">
                                            <Label className="font-flavor text-sm">Holder Password</Label>
                                            <Input
                                                type="password"
                                                value={holderPassword}
                                                onChange={(e) => setHolderPassword(e.target.value)}
                                                placeholder="Enter password to join"
                                            />
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    onClick={() => joinGame(game.id)}
                                                    className="flex-1"
                                                >
                                                    <LogIn className="w-3 h-3 mr-1" /> Join Game
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setSelectedGameId(null);
                                                        setHolderPassword("");
                                                    }}
                                                    className="flex-1"
                                                >
                                                    Cancel
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setSelectedGameId(game.id)}
                                            className="w-full"
                                        >
                                            <LogIn className="w-3 h-3 mr-1" /> Join Game
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))
                )}
            </div>

            {/* User's Participations */}
            <div className="space-y-3">
                <h2 className="font-display text-xl">My Games & Progress</h2>
                {userParticipations.length === 0 ? (
                    <Card className="border-dashed">
                        <CardContent className="pt-6 text-center text-muted-foreground">
                            You haven't joined any mini-games yet
                        </CardContent>
                    </Card>
                ) : (
                    userParticipations.map((participation: any) => (
                        <motion.div
                            key={participation.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            <Card className={participation.mini_games?.is_open ? "border-toxic/30" : ""}>
                                <CardHeader className="pb-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Gamepad2 className="w-4 h-4 text-toxic" />
                                            <CardTitle className="text-lg">{participation.mini_games?.name}</CardTitle>
                                        </div>
                                        <span className={`text-xs px-2 py-1 rounded font-flavor ${participation.mini_games?.is_open
                                            ? "bg-toxic/20 text-toxic"
                                            : "bg-muted text-muted-foreground"
                                            }`}>
                                            {participation.mini_games?.is_open ? "Active" : "Inactive"}
                                        </span>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-secondary/40 rounded p-2">
                                            <p className="text-xs text-muted-foreground font-flavor">Current Rank</p>
                                            <p className="text-lg font-display">#{participation.current_rank}</p>
                                        </div>
                                        <div className="bg-secondary/40 rounded p-2">
                                            <p className="text-xs text-muted-foreground font-flavor">Points Earned</p>
                                            <p className="text-lg font-display flex items-center gap-1">
                                                <Zap className="w-4 h-4 text-yellow-500" />
                                                {participation.points_earned}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Last updated: {new Date(participation.updated_at).toLocaleDateString()}
                                    </p>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    );
}
