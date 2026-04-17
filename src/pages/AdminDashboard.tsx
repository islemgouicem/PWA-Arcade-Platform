/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Shield, Users, Package, Compass, Zap, ScrollText, Megaphone,
  Plus, Minus, Crown, AlertTriangle, Settings, Trophy,
  BarChart3, UserCog, Eye, Undo2
} from "lucide-react";

export default function AdminDashboard() {
  const [searchParams] = useSearchParams();
  const validTabs = ["teams", "coffres", "points", "activations", "settings", "announce", "analytics"];
  const tabParam = searchParams.get("tab") || "teams";
  const activeTab = validTabs.includes(tabParam) ? tabParam : "teams";

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-display text-toxic flex items-center gap-2">
        <Shield className="w-8 h-8" /> Admin Dashboard
      </h1>

      {activeTab === "teams" && <AdminTeams />}
      {activeTab === "coffres" && <AdminCoffres />}
      {activeTab === "points" && <AdminPoints />}
      {activeTab === "activations" && <AdminActivationLog />}
      {activeTab === "settings" && <AdminSettings />}
      {activeTab === "announce" && <AdminAnnouncements />}
      {activeTab === "analytics" && <AdminAnalytics />}
    </div>
  );
}

function AdminTeams() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [viewTeamId, setViewTeamId] = useState<string | null>(null);

  const { data: teams = [] } = useQuery({
    queryKey: ["admin-teams"],
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("*").order("points", { ascending: false });
      return data || [];
    },
  });

  const { data: viewedTeamCards = [] } = useQuery({
    queryKey: ["admin-team-cards", viewTeamId],
    queryFn: async () => {
      if (!viewTeamId) return [];
      const { data } = await supabase
        .from("team_cards")
        .select("quantity, cards(name, rarity, card_type)")
        .eq("team_id", viewTeamId)
        .order("acquired_at", { ascending: false });
      return data || [];
    },
    enabled: !!viewTeamId,
  });

  const toggleSuspend = async (teamId: string, current: boolean) => {
    await supabase.from("teams").update({ is_suspended: !current }).eq("id", teamId);
    queryClient.invalidateQueries({ queryKey: ["admin-teams"] });
    toast.success(current ? "Team unsuspended" : "Team suspended");
  };

  const declareWinner = async (teamId: string) => {
    await supabase.from("teams").update({ is_winner: false }).neq("id", teamId);
    await supabase.from("teams").update({ is_winner: true }).eq("id", teamId);
    await supabase.from("platform_settings").update({ value: "true" as any }).eq("key", "winner_declared");
    await supabase.from("platform_settings").update({ value: JSON.stringify(teamId) as any }).eq("key", "winner_team_id");
    await supabase.from("platform_settings").update({ value: false as any }).eq("key", "activation_window_open");

    const winnerTeam = teams.find((t: any) => t.id === teamId);
    await supabase.from("announcements").insert({
      title: "Winner Declared",
      content: `${winnerTeam?.team_name || "A team"} has been declared the ARCADE winner!`,
      created_by: user?.id,
    });

    const { data: participants } = await supabase.from("teams").select("user_id, id");
    if (participants?.length) {
      await supabase.from("notifications").insert(
        participants.map((p: any) => ({
          user_id: p.user_id,
          team_id: p.id,
          type: "winner_declared" as any,
          title: "Winner Declared",
          message: `${winnerTeam?.team_name || "A team"} has won the event.`,
        })),
      );
    }

    queryClient.invalidateQueries({ queryKey: ["admin-teams"] });
    toast.success("Winner declared!");
  };

  const saveTeamName = async (teamId: string) => {
    if (!editingName.trim()) return;
    const { error } = await supabase.from("teams").update({ team_name: editingName.trim() }).eq("id", teamId);
    if (error) {
      toast.error(error.message || "Failed to update team name");
      return;
    }
    setEditingTeamId(null);
    setEditingName("");
    queryClient.invalidateQueries({ queryKey: ["admin-teams"] });
    toast.success("Team name updated");
  };

  const sendResetEmail = async (email: string | null | undefined) => {
    if (!email) {
      toast.error("Team email is not available");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      toast.error(error.message || "Failed to send reset email");
      return;
    }
    toast.success("Password reset email sent");
  };

  return (
    <div className="space-y-3 mt-4">
      {teams.map((team: any) => (
        <div key={team.id} className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              {editingTeamId === team.id ? (
                <div className="flex items-center gap-2">
                  <label htmlFor={`teamName-${team.id}`} className="sr-only">Team Name</label>
                  <Input id={`teamName-${team.id}`} value={editingName} onChange={(e) => setEditingName(e.target.value)} className="h-8" />
                  <Button size="sm" onClick={() => saveTeamName(team.id)}>Save</Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditingTeamId(null); setEditingName(""); }}>Cancel</Button>
                </div>
              ) : (
                <p className="font-bold">{team.team_name} {team.is_winner && <Crown className="w-4 h-4 inline text-legendary-gold" />}</p>
              )}
              <p className="text-xs text-muted-foreground">{team.points} pts • {team.is_suspended ? "SUSPENDED" : "Active"}</p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => { setEditingTeamId(team.id); setEditingName(team.team_name); }}>
                Edit
              </Button>
              <Button size="sm" variant="outline" onClick={() => setViewTeamId(viewTeamId === team.id ? null : team.id)}>
                <Eye className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => sendResetEmail(team.contact_email)}>
                Reset PW
              </Button>
              <Button size="sm" variant="outline" onClick={() => toggleSuspend(team.id, team.is_suspended)}>
                {team.is_suspended ? "Unsuspend" : "Suspend"}
              </Button>
              {!team.is_winner && (
                <Button size="sm" variant="destructive" onClick={() => declareWinner(team.id)}>
                  <Crown className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {viewTeamId === team.id && (
            <div className="mt-3 border-t border-border pt-3 space-y-2">
              <p className="text-xs font-bold text-muted-foreground">Inventory</p>
              {viewedTeamCards.length === 0 ? (
                <p className="text-xs text-muted-foreground">No cards</p>
              ) : (
                viewedTeamCards.map((tc: any, idx: number) => (
                  <div key={`${team.id}-${idx}`} className="text-xs flex items-center justify-between bg-secondary/40 rounded px-2 py-1">
                    <span>{tc.cards?.name} ({tc.cards?.rarity})</span>
                    <span>x{tc.quantity}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AdminCoffres() {
  const queryClient = useQueryClient();
  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedTier, setSelectedTier] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [tierCardCount, setTierCardCount] = useState("");
  const [tierOrd, setTierOrd] = useState("");
  const [tierRare, setTierRare] = useState("");
  const [tierEpic, setTierEpic] = useState("");
  const [tierLegendary, setTierLegendary] = useState("");

  const { data: teams = [] } = useQuery({
    queryKey: ["admin-teams"],
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("id, team_name").order("team_name");
      return data || [];
    },
  });

  const { data: tiers = [] } = useQuery({
    queryKey: ["coffre-tiers"],
    queryFn: async () => {
      const { data } = await supabase.from("coffre_tiers").select("*");
      return data || [];
    },
  });

  const { data: cards = [] } = useQuery({
    queryKey: ["all-cards-for-coffre"],
    queryFn: async () => {
      const { data } = await supabase.from("cards").select("*");
      return data || [];
    },
  });

  const awardCoffre = async () => {
    if (!selectedTeam || !selectedTier) return;
    const tier = tiers.find((t: any) => t.id === selectedTier);
    if (!tier) return;

    // Generate cards based on tier weights
    const generatedCards = generateCoffreCards(tier as any, cards);

    // Create coffre
    const { data: coffre } = await supabase.from("coffres").insert({
      team_id: selectedTeam,
      tier_id: selectedTier,
      coffre_type: "game_reward" as any,
      source_label: sourceLabel || null,
    }).select().single();

    if (coffre) {
      // Insert coffre cards
      for (const cardId of generatedCards) {
        await supabase.from("coffre_cards").insert({
          coffre_id: coffre.id,
          card_id: cardId,
        });
      }

      // Notify team
      const team = teams.find((t: any) => t.id === selectedTeam);
      const teamData = await supabase.from("teams").select("user_id").eq("id", selectedTeam).single();
      if (teamData.data) {
        await supabase.from("notifications").insert({
          user_id: teamData.data.user_id,
          team_id: selectedTeam,
          type: "coffre_awarded" as any,
          title: "New Coffre!",
          message: `You received a ${tier.name} coffre${sourceLabel ? ` from ${sourceLabel}` : ""}!`,
        });
      }

      toast.success(`Coffre awarded to ${team?.team_name || "team"}!`);
      setSelectedTeam("");
      setSelectedTier("");
      setSourceLabel("");
      queryClient.invalidateQueries({ queryKey: ["coffres"] });
    }
  };

  const loadTierEditor = (tierId: string) => {
    setSelectedTier(tierId);
    const tier = tiers.find((t: any) => t.id === tierId);
    if (!tier) return;
    setTierCardCount(String(tier.card_count));
    setTierOrd(String(tier.ordinary_weight));
    setTierRare(String(tier.rare_weight));
    setTierEpic(String(tier.epic_weight));
    setTierLegendary(String(tier.legendary_weight));
  };

  const saveTierTemplate = async () => {
    if (!selectedTier) return;
    const { error } = await supabase.from("coffre_tiers").update({
      card_count: Number(tierCardCount || 0),
      ordinary_weight: Number(tierOrd || 0),
      rare_weight: Number(tierRare || 0),
      epic_weight: Number(tierEpic || 0),
      legendary_weight: Number(tierLegendary || 0),
    }).eq("id", selectedTier);

    if (error) {
      toast.error(error.message || "Failed to update tier template");
      return;
    }
    toast.success("Tier template updated");
    queryClient.invalidateQueries({ queryKey: ["coffre-tiers"] });
  };

  return (
    <div className="space-y-4 mt-4">
      <div>
        <Label htmlFor="coffreTeam" className="font-flavor">Team</Label>
        <Select value={selectedTeam} onValueChange={setSelectedTeam}>
          <SelectTrigger id="coffreTeam" className="mt-1"><SelectValue placeholder="Select team..." /></SelectTrigger>
          <SelectContent>
            {teams.map((t: any) => (
              <SelectItem key={t.id} value={t.id}>{t.team_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="coffreTier" className="font-flavor">Coffre Tier</Label>
        <Select value={selectedTier} onValueChange={loadTierEditor}>
          <SelectTrigger id="coffreTier" className="mt-1"><SelectValue placeholder="Select tier..." /></SelectTrigger>
          <SelectContent>
            {tiers.map((t: any) => (
              <SelectItem key={t.id} value={t.id}>{t.name} ({t.card_count} cards)</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="sourceLabel" className="font-flavor">Source (e.g. game name)</Label>
        <Input id="sourceLabel" value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} placeholder="Mini-game #1" className="mt-1" />
      </div>
      <Button onClick={awardCoffre} disabled={!selectedTeam || !selectedTier} className="w-full">
        <Package className="w-4 h-4 mr-2" /> Award Coffre
      </Button>

      {selectedTier && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <h3 className="font-display text-lg">Edit Tier Template</h3>
          <div>
            <Label htmlFor="tierCardCount" className="font-flavor">Card Count</Label>
            <Input id="tierCardCount" type="number" value={tierCardCount} onChange={(e) => setTierCardCount(e.target.value)} placeholder="Card count" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="tierOrd" className="font-flavor text-xs">Ordinary Weight</Label>
              <Input id="tierOrd" type="number" value={tierOrd} onChange={(e) => setTierOrd(e.target.value)} placeholder="Ordinary weight" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="tierRare" className="font-flavor text-xs">Rare Weight</Label>
              <Input id="tierRare" type="number" value={tierRare} onChange={(e) => setTierRare(e.target.value)} placeholder="Rare weight" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="tierEpic" className="font-flavor text-xs">Epic Weight</Label>
              <Input id="tierEpic" type="number" value={tierEpic} onChange={(e) => setTierEpic(e.target.value)} placeholder="Epic weight" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="tierLegendary" className="font-flavor text-xs">Legendary Weight</Label>
              <Input id="tierLegendary" type="number" value={tierLegendary} onChange={(e) => setTierLegendary(e.target.value)} placeholder="Legendary weight" className="mt-1" />
            </div>
          </div>
          <Button onClick={saveTierTemplate}>Save Tier Template</Button>
        </div>
      )}
    </div>
  );
}

function generateCoffreCards(
  tier: any,
  cards: any[],
): string[] {
  const result: string[] = [];
  const weights = {
    ordinary: tier.ordinary_weight,
    rare: tier.rare_weight,
    epic: tier.epic_weight,
    legendary: tier.legendary_weight,
  };
  const total = Object.values(weights).reduce((a: number, b: any) => a + Number(b), 0);

  for (let i = 0; i < tier.card_count; i++) {
    let roll = Math.random() * total;
    let selectedRarity = "ordinary";
    for (const [rarity, weight] of Object.entries(weights)) {
      roll -= Number(weight);
      if (roll <= 0) { selectedRarity = rarity; break; }
    }
    const rarityCards = cards.filter((c: any) => c.rarity === selectedRarity && !c.is_mandatory);
    if (rarityCards.length > 0) {
      result.push(rarityCards[Math.floor(Math.random() * rarityCards.length)].id);
    } else if (cards.length > 0) {
      result.push(cards[Math.floor(Math.random() * cards.length)].id);
    }
  }
  return result;
}

function AdminPoints() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedTeam, setSelectedTeam] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [gameLabel, setGameLabel] = useState("");
  const [rank1Team, setRank1Team] = useState("");
  const [rank2Team, setRank2Team] = useState("");
  const [rank3Team, setRank3Team] = useState("");
  const [rank4Team, setRank4Team] = useState("");
  const [rank1Pts, setRank1Pts] = useState("100");
  const [rank2Pts, setRank2Pts] = useState("70");
  const [rank3Pts, setRank3Pts] = useState("50");
  const [rank4Pts, setRank4Pts] = useState("30");

  const { data: teams = [] } = useQuery({
    queryKey: ["admin-teams-points"],
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("*").order("points", { ascending: false });
      return data || [];
    },
  });

  const adjustPoints = async (add: boolean) => {
    if (!selectedTeam || !amount || !reason) return;
    const pts = parseInt(amount) * (add ? 1 : -1);
    const team = teams.find((t: any) => t.id === selectedTeam);
    if (!team) return;

    await supabase.from("teams").update({ points: team.points + pts }).eq("id", selectedTeam);
    await supabase.from("point_logs").insert({
      team_id: selectedTeam,
      amount: pts,
      reason,
      admin_user_id: user?.id,
    });

    await supabase.from("notifications").insert({
      user_id: team.user_id,
      team_id: selectedTeam,
      type: "trade_completed" as any,
      title: "Points Updated",
      message: `${add ? "+" : ""}${pts} points (${reason}).`,
    });

    toast.success(`${add ? "Added" : "Subtracted"} ${amount} points`);
    setAmount(""); setReason("");
    queryClient.invalidateQueries({ queryKey: ["admin-teams-points"] });
  };

  const applyBulkResults = async () => {
    const rows = [
      { teamId: rank1Team, points: Number(rank1Pts || 0), rank: 1 },
      { teamId: rank2Team, points: Number(rank2Pts || 0), rank: 2 },
      { teamId: rank3Team, points: Number(rank3Pts || 0), rank: 3 },
      { teamId: rank4Team, points: Number(rank4Pts || 0), rank: 4 },
    ].filter((r) => !!r.teamId && r.points !== 0);

    if (rows.length === 0) {
      toast.error("Add at least one ranked team");
      return;
    }

    for (const row of rows) {
      const team = teams.find((t: any) => t.id === row.teamId);
      if (!team) continue;

      await supabase.from("teams").update({ points: team.points + row.points }).eq("id", row.teamId);
      await supabase.from("point_logs").insert({
        team_id: row.teamId,
        amount: row.points,
        reason: `Bulk results${gameLabel ? ` (${gameLabel})` : ""} - Rank ${row.rank}`,
        admin_user_id: user?.id,
      });
      await supabase.from("notifications").insert({
        user_id: team.user_id,
        team_id: row.teamId,
        type: "trade_completed" as any,
        title: "Points Awarded",
        message: `You received ${row.points} points${gameLabel ? ` from ${gameLabel}` : ""}.`,
      });
    }

    toast.success("Bulk results applied");
    queryClient.invalidateQueries({ queryKey: ["admin-teams-points"] });
  };

  return (
    <div className="space-y-4 mt-4">
      <Select value={selectedTeam} onValueChange={setSelectedTeam}>
        <SelectTrigger><SelectValue placeholder="Select team..." /></SelectTrigger>
        <SelectContent>
          {teams.map((t: any) => (
            <SelectItem key={t.id} value={t.id}>{t.team_name} ({t.points} pts)</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div>
        <Label htmlFor="pointsAmount" className="font-flavor">Points</Label>
        <Input id="pointsAmount" type="number" placeholder="Points" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" />
      </div>
      <div>
        <Label htmlFor="pointsReason" className="font-flavor">Reason</Label>
        <Input id="pointsReason" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" />
      </div>
      <div className="flex gap-2">
        <Button onClick={() => adjustPoints(true)} disabled={!selectedTeam || !amount || !reason} className="flex-1">
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
        <Button onClick={() => adjustPoints(false)} disabled={!selectedTeam || !amount || !reason} variant="destructive" className="flex-1">
          <Minus className="w-4 h-4 mr-1" /> Subtract
        </Button>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="font-display text-lg">Bulk Points by Rank</h3>
        <div>
          <Label htmlFor="gameLabel" className="font-flavor">Game/Round Label</Label>
          <Input id="gameLabel" placeholder="Game/round label" value={gameLabel} onChange={(e) => setGameLabel(e.target.value)} className="mt-1" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Select value={rank1Team} onValueChange={setRank1Team}>
            <SelectTrigger><SelectValue placeholder="Rank 1 Team" /></SelectTrigger>
            <SelectContent>{teams.map((t: any) => <SelectItem key={`r1-${t.id}`} value={t.id}>{t.team_name}</SelectItem>)}</SelectContent>
          </Select>
          <div>
            <Label htmlFor="rank1Points" className="font-flavor text-xs">Rank 1 Points</Label>
            <Input id="rank1Points" type="number" placeholder="Rank 1 points" value={rank1Pts} onChange={(e) => setRank1Pts(e.target.value)} className="mt-1" />
          </div>

          <Select value={rank2Team} onValueChange={setRank2Team}>
            <SelectTrigger><SelectValue placeholder="Rank 2 Team" /></SelectTrigger>
            <SelectContent>{teams.map((t: any) => <SelectItem key={`r2-${t.id}`} value={t.id}>{t.team_name}</SelectItem>)}</SelectContent>
          </Select>
          <div>
            <Label htmlFor="rank2Points" className="font-flavor text-xs">Rank 2 Points</Label>
            <Input id="rank2Points" type="number" placeholder="Rank 2 points" value={rank2Pts} onChange={(e) => setRank2Pts(e.target.value)} className="mt-1" />
          </div>

          <Select value={rank3Team} onValueChange={setRank3Team}>
            <SelectTrigger><SelectValue placeholder="Rank 3 Team" /></SelectTrigger>
            <SelectContent>{teams.map((t: any) => <SelectItem key={`r3-${t.id}`} value={t.id}>{t.team_name}</SelectItem>)}</SelectContent>
          </Select>
          <div>
            <Label htmlFor="rank3Points" className="font-flavor text-xs">Rank 3 Points</Label>
            <Input id="rank3Points" type="number" placeholder="Rank 3 points" value={rank3Pts} onChange={(e) => setRank3Pts(e.target.value)} className="mt-1" />
          </div>

          <Select value={rank4Team} onValueChange={setRank4Team}>
            <SelectTrigger><SelectValue placeholder="Rank 4 Team" /></SelectTrigger>
            <SelectContent>{teams.map((t: any) => <SelectItem key={`r4-${t.id}`} value={t.id}>{t.team_name}</SelectItem>)}</SelectContent>
          </Select>
          <div>
            <Label htmlFor="rank4Points" className="font-flavor text-xs">Rank 4 Points</Label>
            <Input id="rank4Points" type="number" placeholder="Rank 4 points" value={rank4Pts} onChange={(e) => setRank4Pts(e.target.value)} className="mt-1" />
          </div>
        </div>

        <Button onClick={applyBulkResults} className="w-full">
          Apply Bulk Results
        </Button>
      </div>
    </div>
  );
}

function AdminActivationLog() {
  const [teamFilter, setTeamFilter] = useState("all");
  const [rarityFilter, setRarityFilter] = useState("all");

  const { data: teams = [] } = useQuery({
    queryKey: ["admin-teams-for-activation-filter"],
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("id, team_name").order("team_name");
      return data || [];
    },
  });

  const { data: activations = [] } = useQuery({
    queryKey: ["admin-activations", teamFilter, rarityFilter],
    queryFn: async () => {
      let query = supabase
        .from("card_activations")
        .select("*, teams(team_name), target:target_team_id(team_name)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (teamFilter !== "all") query = query.eq("team_id", teamFilter);
      if (rarityFilter !== "all") query = query.eq("card_rarity", rarityFilter as any);

      const { data } = await query;
      return data || [];
    },
    refetchInterval: 5000,
  });

  const reverseActivation = async (activationId: string) => {
    const reason = window.prompt("Reason for reversal:") || "Reversed by admin";
    const { error } = await (supabase as any).rpc("reverse_card_activation", {
      p_activation_id: activationId,
      p_reason: reason,
    });
    if (error) {
      toast.error(error.message || "Failed to reverse activation");
      return;
    }
    toast.success("Activation reversed");
  };

  return (
    <div className="space-y-2 mt-4">
      <h3 className="font-display text-lg">Card Activations</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pb-2">
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger><SelectValue placeholder="Filter by team" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teams</SelectItem>
            {teams.map((t: any) => (
              <SelectItem key={t.id} value={t.id}>{t.team_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={rarityFilter} onValueChange={setRarityFilter}>
          <SelectTrigger><SelectValue placeholder="Filter by rarity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All rarities</SelectItem>
            <SelectItem value="ordinary">ordinary</SelectItem>
            <SelectItem value="rare">rare</SelectItem>
            <SelectItem value="epic">epic</SelectItem>
            <SelectItem value="legendary">legendary</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {activations.length === 0 ? (
        <p className="text-muted-foreground font-flavor text-sm">No activations yet</p>
      ) : activations.map((act: any) => (
        <motion.div
          key={act.id}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className={`bg-card border rounded-lg p-3 text-sm ${act.card_rarity === "epic" || act.card_rarity === "legendary"
            ? "border-blood glow-blood"
            : "border-border"
            }`}
        >
          <div className="flex justify-between">
            <span className="font-bold text-toxic">{(act.teams as any)?.team_name}</span>
            <span className="text-xs text-muted-foreground">{new Date(act.created_at).toLocaleTimeString()}</span>
          </div>
          <p>Used <strong>{act.card_name}</strong> ({act.card_rarity})</p>
          {act.target && <p className="text-xs text-muted-foreground">→ Target: {(act.target as any)?.team_name}</p>}
          {act.is_cancelled && <span className="text-xs text-blood">CANCELLED</span>}
          {!act.is_cancelled && (
            <Button size="sm" variant="outline" className="mt-2" onClick={() => reverseActivation(act.id)}>
              <Undo2 className="w-4 h-4 mr-1" /> Reverse
            </Button>
          )}
        </motion.div>
      ))}
    </div>
  );
}

function AdminSettings() {
  const queryClient = useQueryClient();
  const { data: settings = [] } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings").select("*");
      return data || [];
    },
  });

  const getSetting = (key: string, defaultValue: any = null) => {
    const s = settings.find((s: any) => s.key === key);
    const value = s?.value;

    if (value === null || value === undefined) return defaultValue;

    if (typeof defaultValue === "boolean") {
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value !== 0;
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "1", "yes", "on"].includes(normalized)) return true;
        if (["false", "0", "no", "off"].includes(normalized)) return false;
      }
      return Boolean(value);
    }

    return value;
  };

  const toggleSetting = async (key: string) => {
    const current = getSetting(key, false);
    const newVal = !current;
    await supabase.from("platform_settings").update({ value: newVal as any }).eq("key", key);

    if (key === "ranking_visible") {
      const { data: teams } = await supabase.from("teams").select("id, user_id");
      if (teams?.length) {
        const title = newVal ? "Rankings Visible" : "Rankings Hidden";
        const message = newVal ? "Rankings are now visible." : "Rankings have been hidden by admin.";

        await supabase.from("notifications").insert(
          teams.map((t: any) => ({
            user_id: t.user_id,
            team_id: t.id,
            type: "ranking_visibility" as any,
            title,
            message,
          })),
        );
      }
    }

    queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
    toast.success(`${key.replace(/_/g, " ")} ${newVal ? "enabled" : "disabled"}`);
  };

  const boolSettings = [
    { key: "registration_open", label: "Registration Open", icon: Users },
    { key: "ranking_visible", label: "Rankings Visible", icon: Trophy },
    { key: "activation_window_open", label: "Card Activations", icon: Zap },
  ];

  return (
    <div className="space-y-3 mt-4">
      {boolSettings.map(({ key, label, icon: Icon }) => (
        <div key={key} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-toxic" />
            <span className="font-flavor">{label}</span>
          </div>
          <Switch checked={getSetting(key, false)} onCheckedChange={() => toggleSetting(key)} />
        </div>
      ))}
    </div>
  );
}

function AdminAnnouncements() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const { data: announcements = [] } = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: async () => {
      const { data } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const broadcast = async () => {
    if (!title || !content) return;
    await supabase.from("announcements").insert({
      title,
      content,
      created_by: user?.id,
    });
    toast.success("Announcement broadcast!");
    setTitle(""); setContent("");
    queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div>
          <Label htmlFor="announcementTitle" className="font-flavor">Title</Label>
          <Input id="announcementTitle" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="announcementContent" className="font-flavor">Content</Label>
          <Textarea id="announcementContent" placeholder="Announcement content..." value={content} onChange={(e) => setContent(e.target.value)} className="mt-1" />
        </div>
        <Button onClick={broadcast} disabled={!title || !content} className="w-full">
          <Megaphone className="w-4 h-4 mr-2" /> Broadcast
        </Button>
      </div>
      <div className="space-y-2">
        {announcements.map((a: any) => (
          <div key={a.id} className="bg-card border border-border rounded-lg p-3">
            <p className="font-bold text-sm">{a.title}</p>
            <p className="text-xs text-muted-foreground">{a.content}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{new Date(a.created_at).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminAnalytics() {
  const { data: analytics } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: async () => {
      const [{ data: cards }, { data: activations }, { data: teams }] = await Promise.all([
        supabase.from("team_cards").select("quantity, cards(rarity)"),
        supabase.from("card_activations").select("card_rarity, created_at"),
        supabase.from("teams").select("team_name, points"),
      ]);

      const rarityTotals: Record<string, number> = { ordinary: 0, rare: 0, epic: 0, legendary: 0 };
      (cards || []).forEach((c: any) => {
        const rarity = c.cards?.rarity || "ordinary";
        rarityTotals[rarity] = (rarityTotals[rarity] || 0) + Number(c.quantity || 0);
      });

      const activationTotals: Record<string, number> = { ordinary: 0, rare: 0, epic: 0, legendary: 0 };
      (activations || []).forEach((a: any) => {
        activationTotals[a.card_rarity] = (activationTotals[a.card_rarity] || 0) + 1;
      });

      return {
        rarityTotals,
        activationTotals,
        teams: teams || [],
      };
    },
  });

  return (
    <div className="space-y-4 mt-4">
      <h3 className="font-display text-lg flex items-center gap-2"><BarChart3 className="w-5 h-5" /> Platform Analytics</h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {Object.entries(analytics?.rarityTotals || {}).map(([rarity, count]) => (
          <div key={rarity} className="bg-card border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground capitalize">{rarity} in circulation</p>
            <p className="text-xl font-bold">{count as number}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="font-bold text-sm mb-2">Activations by rarity</p>
          {Object.entries(analytics?.activationTotals || {}).map(([rarity, count]) => (
            <p key={rarity} className="text-xs capitalize">{rarity}: {count as number}</p>
          ))}
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="font-bold text-sm mb-2">Gameplay Scope</p>
          <p className="text-xs">Missions and Mini-Games are active.</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-3 space-y-1">
        <p className="font-bold text-sm">Points distribution</p>
        {(analytics?.teams || []).map((t: any) => (
          <div key={t.team_name} className="text-xs flex items-center justify-between">
            <span>{t.team_name}</span>
            <span>{t.points} pts</span>
          </div>
        ))}
      </div>
    </div>
  );
}
