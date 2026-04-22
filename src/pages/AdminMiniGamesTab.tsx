/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Plus, Edit2, Gamepad2, Eye, EyeOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export function AdminMiniGames() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newGameName, setNewGameName] = useState("");
    const [newGamePassword, setNewGamePassword] = useState("");
    const [editingGameId, setEditingGameId] = useState<string | null>(null);
    const [editingGameName, setEditingGameName] = useState("");
    const [editingRanks, setEditingRanks] = useState<Record<number, string>>({});
    const [editingGameDetailsId, setEditingGameDetailsId] = useState<string | null>(null);
    const [editingDetailsName, setEditingDetailsName] = useState("");
    const [editingDetailsPassword, setEditingDetailsPassword] = useState("");
    const [showCreatePassword, setShowCreatePassword] = useState(false);
    const [showEditPassword, setShowEditPassword] = useState(false);

    const { data: miniGames = [] } = useQuery({
        queryKey: ["admin-mini-games"],
        queryFn: async () => {
            const { data, error } = await supabase.from("mini_games").select("*").order("name");
            if (error) throw error;
            return data || [];
        },
    });

    const { data: rankMappings = [] } = useQuery({
        queryKey: ["admin-mini-game-ranks", editingGameId],
        enabled: !!editingGameId,
        queryFn: async () => {
            if (!editingGameId) return [];
            const { data, error } = await supabase
                .from("mini_game_rank_points")
                .select("*")
                .eq("mini_game_id", editingGameId)
                .order("rank_position");
            if (error) throw error;
            return data || [];
        },
    });

    const extractHashFromRpc = (hashData: any) => {
        if (!hashData) return null;
        if (Array.isArray(hashData)) return hashData[0]?.hashed_password ?? null;
        return hashData.hashed_password ?? null;
    };

    const createGame = async () => {
        if (!newGameName.trim() || !newGamePassword.trim()) {
            toast.error("Game name and password are required");
            return;
        }

        const { error: hashError, data: hashData } = await (supabase as any).rpc("crypt_generate", {
            p_password: newGamePassword,
        });

        try {
            const parsedHash = extractHashFromRpc(hashData);
            if (hashError || !parsedHash) {
                throw new Error("Failed to hash mini-game password");
            }

            const { error } = await supabase.from("mini_games").insert({
                name: newGameName.trim(),
                holder_password_hash: parsedHash,
                is_open: false,
            });

            if (error) throw error;
            toast.success("Mini-game created!");
            setNewGameName("");
            setNewGamePassword("");
            setShowCreateForm(false);
            queryClient.invalidateQueries({ queryKey: ["admin-mini-games"] });
        } catch (err: any) {
            toast.error(err.message || "Failed to create mini-game");
        }
    };

    const toggleGameActive = async (gameId: string, currentStatus: boolean) => {
        const { error } = await supabase.from("mini_games").update({ is_open: !currentStatus }).eq("id", gameId);
        if (error) {
            toast.error(error.message || "Failed to update game status");
            return;
        }
        toast.success(currentStatus ? "Game closed" : "Game opened");
        queryClient.invalidateQueries({ queryKey: ["admin-mini-games"] });
    };

    const loadGameForEditing = async (gameId: string, gameName: string) => {
        setEditingGameId(gameId);
        setEditingGameName(gameName);
        setEditingRanks({});
    };

    const saveRankMapping = async (gameId: string, rankPosition: number, points: string) => {
        const pointsNum = parseInt(points) || 0;
        if (pointsNum < 0) {
            toast.error("Points must be 0 or greater");
            return;
        }

        const existing = rankMappings.find((r: any) => r.rank_position === rankPosition);

        if (existing) {
            const { error } = await supabase
                .from("mini_game_rank_points")
                .update({ points_awarded: pointsNum })
                .eq("id", existing.id);

            if (error) {
                toast.error(error.message || "Failed to update rank mapping");
                return;
            }
        } else {
            const { error } = await supabase.from("mini_game_rank_points").insert({
                mini_game_id: gameId,
                rank_position: rankPosition,
                points_awarded: pointsNum,
            });

            if (error) {
                toast.error(error.message || "Failed to create rank mapping");
                return;
            }
        }

        toast.success("Rank mapping saved");
        queryClient.invalidateQueries({ queryKey: ["admin-mini-game-ranks", gameId] });
    };

    const startEditingGameDetails = (gameId: string, currentName: string) => {
        setEditingGameDetailsId(gameId);
        setEditingDetailsName(currentName);
        setEditingDetailsPassword("");
        setShowEditPassword(false);
    };

    const saveGameDetails = async (gameId: string) => {
        if (!editingDetailsName.trim()) {
            toast.error("Game name cannot be empty");
            return;
        }

        const updates: any = { name: editingDetailsName.trim() };

        if (editingDetailsPassword.trim()) {
            const { error: passwordError } = await (supabase as any).rpc("admin_set_minigame_password", {
                p_mini_game_id: gameId,
                p_password: editingDetailsPassword,
            });
            if (passwordError) {
                toast.error(passwordError.message || "Failed to update password");
                return;
            }
        }

        const { error } = await supabase.from("mini_games").update(updates).eq("id", gameId);
        if (error) {
            toast.error(error.message || "Failed to update game");
            return;
        }
        toast.success("Game details updated");
        setEditingGameDetailsId(null);
        queryClient.invalidateQueries({ queryKey: ["admin-mini-games"] });
    };

    return (
        <div className="space-y-4 mt-4">
            {!showCreateForm ? (
                <Button onClick={() => setShowCreateForm(true)} className="w-full">
                    <Plus className="w-4 h-4 mr-2" /> Create Mini-Game
                </Button>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>Create New Mini-Game</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div>
                            <Label htmlFor="gameName" className="font-flavor">Game Name</Label>
                            <Input
                                id="gameName"
                                value={newGameName}
                                onChange={(e) => setNewGameName(e.target.value)}
                                placeholder="e.g., Trivia Challenge"
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="gamePassword" className="font-flavor">Holder Password</Label>
                            <div className="flex gap-2 mt-1">
                                <Input
                                    id="gamePassword"
                                    type={showCreatePassword ? "text" : "password"}
                                    value={newGamePassword}
                                    onChange={(e) => setNewGamePassword(e.target.value)}
                                    placeholder="Secure password"
                                    className="flex-1"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setShowCreatePassword((v) => !v)}
                                    aria-label={showCreatePassword ? "Hide password" : "Show password"}
                                >
                                    {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </Button>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={createGame} className="flex-1">Create</Button>
                            <Button onClick={() => setShowCreateForm(false)} variant="outline" className="flex-1">Cancel</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="space-y-2">
                {miniGames.map((game: any) => (
                    editingGameDetailsId === game.id ? (
                        <Card key={game.id} className={game.is_open ? "border-toxic/40" : "border-border"}>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg">Edit Game Details</CardTitle>
                                    <Switch
                                        checked={game.is_open}
                                        onCheckedChange={() => toggleGameActive(game.id, game.is_open)}
                                    />
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div>
                                    <Label htmlFor="edit-name" className="font-flavor text-sm">Game Name</Label>
                                    <Input
                                        id="edit-name"
                                        value={editingDetailsName}
                                        onChange={(e) => setEditingDetailsName(e.target.value)}
                                        placeholder="Game name"
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="edit-password" className="font-flavor text-sm">New Password (leave empty to keep current)</Label>
                                    <div className="flex gap-2 mt-1">
                                        <Input
                                            id="edit-password"
                                            type={showEditPassword ? "text" : "password"}
                                            value={editingDetailsPassword}
                                            onChange={(e) => setEditingDetailsPassword(e.target.value)}
                                            placeholder="Leave empty to keep current"
                                            className="flex-1"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            onClick={() => setShowEditPassword((v) => !v)}
                                            aria-label={showEditPassword ? "Hide password" : "Show password"}
                                        >
                                            {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        onClick={() => saveGameDetails(game.id)}
                                        className="flex-1"
                                    >
                                        Save
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setEditingGameDetailsId(null)}
                                        className="flex-1"
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card key={game.id} className={game.is_open ? "border-toxic/40" : "border-border"}>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Gamepad2 className="w-4 h-4 text-toxic" />
                                        <CardTitle className="text-lg">{game.name}</CardTitle>
                                        <span className={`text-xs px-2 py-1 rounded ${game.is_open ? "bg-toxic/20 text-toxic" : "bg-muted text-muted-foreground"}`}>
                                            {game.is_open ? "Open" : "Closed"}
                                        </span>
                                    </div>
                                    <Switch
                                        checked={game.is_open}
                                        onCheckedChange={() => toggleGameActive(game.id, game.is_open)}
                                    />
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => startEditingGameDetails(game.id, game.name)}
                                >
                                    <Edit2 className="w-4 h-4 mr-1" /> Edit Name/Password
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => loadGameForEditing(game.id, game.name)}
                                >
                                    <Edit2 className="w-4 h-4 mr-1" /> Configure Ranking Points
                                </Button>
                            </CardContent>
                        </Card>
                    )
                ))}
            </div>

            {editingGameId && (
                <RankMappingEditor
                    gameId={editingGameId}
                    gameName={editingGameName}
                    rankMappings={rankMappings}
                    onSave={(rank, points) => saveRankMapping(editingGameId, rank, points)}
                    onClose={() => setEditingGameId(null)}
                    queryClient={queryClient}
                />
            )}
        </div>
    );
}

function RankMappingEditor({
    gameId,
    gameName,
    rankMappings,
    onSave,
    onClose,
    queryClient,
}: {
    gameId: string;
    gameName: string;
    rankMappings: any[];
    onSave: (rank: number, points: string) => Promise<void>;
    onClose: () => void;
    queryClient: any;
}) {
    const [ranks, setRanks] = useState<Record<number, string>>({});

    React.useEffect(() => {
        const initial: Record<number, string> = {};
        rankMappings.forEach((r: any) => {
            initial[r.rank_position] = String(r.points_awarded);
        });
        setRanks(initial);
    }, [rankMappings]);

    const handleSaveRank = async (rank: number) => {
        const points = ranks[rank] || "0";
        await onSave(rank, points);
    };

    const applyTemplate = async (template: 'medium' | 'low') => {
        const templates = {
            medium: { 1: 120, 2: 110, 3: 100, 4: 90, 5: 80, 6: 70, 7: 60, 8: 50, 9: 40, 10: 30, 11: 20, 12: 10 },
            low: { 1: 60, 2: 55, 3: 50, 4: 45, 5: 40, 6: 35, 7: 30, 8: 25, 9: 20, 10: 15, 11: 10, 12: 5 },
        };

        const values = templates[template];
        const newRanks: Record<number, string> = {};

        for (let rank = 1; rank <= 12; rank++) {
            newRanks[rank] = String(values[rank as keyof typeof values]);
        }

        setRanks(newRanks);

        // Save all to database
        const mappings = [];
        for (let rank = 1; rank <= 12; rank++) {
            mappings.push({
                mini_game_id: gameId,
                rank_position: rank,
                points_awarded: values[rank as keyof typeof values],
            });
        }

        const { error } = await (supabase as any)
            .from("mini_game_rank_points")
            .upsert(mappings, { onConflict: "mini_game_id,rank_position" });

        if (error) {
            toast.error(error.message || "Failed to apply template");
            return;
        }

        toast.success(`${template.charAt(0).toUpperCase() + template.slice(1)} template applied`);
        queryClient.invalidateQueries({ queryKey: ["admin-mini-game-ranks", gameId] });
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="bg-card border border-border p-4 space-y-4"
        >
            <div className="flex items-center justify-between">
                <h3 className="font-display text-lg">{gameName} - Ranking Points</h3>
                <Button size="sm" variant="ghost" onClick={onClose}>×</Button>
            </div>

            <div className="flex gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyTemplate('medium')}
                    className="flex-1"
                >
                    Medium Template
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyTemplate('low')}
                    className="flex-1"
                >
                    Low Template
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((rank) => (
                    <div key={rank} className="flex items-center gap-2">
                        <Label htmlFor={`rank-${rank}`} className="font-flavor text-xs min-w-16">Rank {rank}</Label>
                        <Input
                            id={`rank-${rank}`}
                            type="number"
                            value={ranks[rank] || ""}
                            onChange={(e) => setRanks({ ...ranks, [rank]: e.target.value })}
                            placeholder="Points"
                            className="flex-1 h-8"
                        />
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSaveRank(rank)}
                            className="h-8"
                        >
                            Save
                        </Button>
                    </div>
                ))}
            </div>

            <Button onClick={onClose} variant="outline" className="w-full">Done</Button>
        </motion.div>
    );
}
