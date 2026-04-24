import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, Swords, Shield, Eye, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

interface Card {
  id: string;
  name: string;
  description: string;
  card_type: string;
  rarity: string;
  point_value: number;
  image_url: string | null;
  is_mandatory: boolean;
  hint_content: string | null;
  combine_group_id: string | null;
}

interface Props {
  card: Card;
  owned: number;
  onClose: () => void;
  teamId: string;
}

const HINT_TYPES = new Set(["hint_low", "hint_mid", "hint_high"]);
const ACTION_TYPES = new Set(["attack", "healing", "hint_low", "hint_mid", "hint_high"]);

const rarityColors: Record<string, string> = {
  ordinary: "text-rarity-ordinary",
  rare: "text-rarity-rare",
  epic: "text-rarity-epic",
  legendary: "text-rarity-legendary",
};

type HintMission = { id: string; name: string; sequence_number: number | null };

export default function CardDetailModal({ card, owned, onClose, teamId }: Props) {
  const queryClient = useQueryClient();
  const [showActivateConfirm, setShowActivateConfirm] = useState(false);
  const [targetTeamId, setTargetTeamId] = useState("");
  const [missionIdForHint, setMissionIdForHint] = useState("");
  const [activating, setActivating] = useState(false);
  const [activationResult, setActivationResult] = useState<any>(null);
  const [hintModalOpen, setHintModalOpen] = useState(false);
  const [hintModalPayload, setHintModalPayload] = useState<{
    text: string;
    tier: string;
    missionName: string;
  } | null>(null);

  const isActionCard = ACTION_TYPES.has(card.card_type);
  const isHintCard = HINT_TYPES.has(card.card_type);
  const needsTarget = card.card_type === "attack";

  const { data: allTeams = [] } = useQuery({
    queryKey: ["all-teams"],
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("id, team_name").neq("id", teamId);
      return data || [];
    },
    enabled: needsTarget && owned > 0,
  });

  const { data: hintMissionOptions = [] } = useQuery({
    queryKey: ["hint-active-missions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("missions")
        .select("id, name, sequence_number")
        .eq("enabled", true)
        .eq("visible", true)
        .eq("is_open", true)
        .order("sequence_number", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as HintMission[];
    },
    enabled: isHintCard && owned > 0,
  });

  const { data: activationOpen = true } = useQuery({
    queryKey: ["activation-window-open"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings").select("value").eq("key", "activation_window_open").maybeSingle();
      return data?.value === true;
    },
    enabled: isActionCard,
  });

  const { data: winnerDeclared = false } = useQuery({
    queryKey: ["winner-declared"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings").select("value").eq("key", "winner_declared").maybeSingle();
      return data?.value === true;
    },
    enabled: isActionCard,
  });

  const activationBlocked = !activationOpen || winnerDeclared;

  useEffect(() => {
    if (!showActivateConfirm || !isHintCard) return;
    if (hintMissionOptions.length === 1) {
      setMissionIdForHint(hintMissionOptions[0].id);
    } else {
      setMissionIdForHint("");
    }
  }, [showActivateConfirm, isHintCard, hintMissionOptions]);

  const hintMissionLabel = (m: HintMission) =>
    `${m.sequence_number != null ? `M${m.sequence_number}: ` : ""}${m.name}`;

  const handleActivate = async () => {
    setActivating(true);
    try {
      let pMissionId: string | null = null;
      if (isHintCard) {
        if (hintMissionOptions.length === 1) {
          pMissionId = hintMissionOptions[0].id;
        } else {
          pMissionId = missionIdForHint || null;
        }
      }

      const { data, error } = await supabase.rpc("process_card_activation", {
        p_team_id: teamId,
        p_card_id: card.id,
        p_target_team_id: needsTarget ? targetTeamId || null : null,
        p_mission_id: pMissionId,
      });

      if (error) {
        throw error;
      }

      if (data && data.ok === false && data.code === "MISSION_SELECTION_REQUIRED") {
        toast.message("Choose which mission this hint applies to.");
        setShowActivateConfirm(true);
        setActivating(false);
        return;
      }

      setActivationResult(data || null);

      if (data?.action_type === "hint" && data?.result?.hint_text) {
        setHintModalPayload({
          text: String(data.result.hint_text),
          tier: String(data.result.tier ?? ""),
          missionName: String(data.result.mission_name ?? "Mission"),
        });
        setHintModalOpen(true);
        toast.success("Hint saved — review it in the window below or under My Hints.");
      } else {
        toast.success(`${card.name} activated!`);
      }

      queryClient.invalidateQueries({ queryKey: ["team-cards"] });
      queryClient.invalidateQueries({ queryKey: ["admin-activations"] });
      queryClient.invalidateQueries({ queryKey: ["my-hint-reveals", teamId] });
      setShowActivateConfirm(false);
    } catch (err: any) {
      toast.error(err?.message || "Activation failed");
    }
    setActivating(false);
  };

  const hintConfirmDisabled =
    activating ||
    (needsTarget && !targetTeamId) ||
    (isHintCard && hintMissionOptions.length > 1 && !missionIdForHint) ||
    (isHintCard && hintMissionOptions.length === 0);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.98, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.98, opacity: 0 }}
          transition={{ type: "spring", damping: 22 }}
          className="bg-card border border-border rounded-lg max-w-sm w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative aspect-[4/3] bg-secondary">
            {card.image_url ? (
              <img src={card.image_url} alt={card.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Swords className="w-20 h-20 text-muted-foreground/20" />
              </div>
            )}
            <Button
              variant="outline"
              size="icon"
              className="absolute top-2 right-2"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
            <div className={`absolute bottom-2 left-2 px-2 py-1 rounded text-xs font-bold bg-background/80 ${rarityColors[card.rarity]}`}>
              {card.rarity.toUpperCase()}
            </div>
          </div>

          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-display">{card.name}</h2>
                <p className="text-xs text-muted-foreground font-flavor capitalize">
                  {card.card_type.replace(/_/g, " ")}
                </p>
              </div>
              <div className="flex items-center gap-1 text-biohazard font-mono-arcade">
                <Zap className="w-4 h-4" />
                <span>{card.point_value}</span>
              </div>
            </div>

            {card.is_mandatory && (
              <div className="bg-blood/20 border border-blood rounded px-2 py-1 text-xs text-accent-foreground font-flavor">
                ⚠ MANDATORY CARD — Required for victory
              </div>
            )}

            <p className="text-sm text-foreground/80">{card.description}</p>

            {activationResult?.result?.effect === "attack" && (
              <div className="bg-secondary rounded p-3 border border-border space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Attack Result</p>
                {activationResult.result.blocked ? (
                  <p className="text-sm font-flavor text-toxic">Attack blocked.</p>
                ) : (
                  <p className="text-sm font-flavor text-blood">
                    Attack successful. Damage applied:{" "}
                    <span className="font-bold">{Number(activationResult.result.damage ?? 0)}%</span>.
                  </p>
                )}
              </div>
            )}

            {activationResult?.result?.effect === "healing" && (
              <div className="bg-secondary rounded p-3 border border-border">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Healing Result</p>
                <p className="text-sm font-flavor text-toxic">
                  Health restored: <span className="font-bold">{Number(activationResult.result.amount ?? 0)}%</span>.
                </p>
              </div>
            )}

            {isHintCard && owned > 0 && (
              <div className="bg-secondary rounded p-3 border border-border flex items-start gap-2">
                <Eye className="w-4 h-4 text-toxic shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground font-flavor leading-relaxed">
                  Hint text is never shown only on this card face. When you activate, it opens in a full-screen-safe window
                  and is permanently listed under{" "}
                  <Link to="/my-hints" className="text-toxic underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
                    My Hints
                  </Link>
                  .
                </p>
              </div>
            )}

            {isHintCard && owned === 0 && (
              <div className="bg-secondary rounded p-3 border border-border flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground font-flavor">Acquire this card to use hint activation.</span>
              </div>
            )}

            {card.card_type === "defense" && (
              <div className="bg-secondary rounded p-3 border border-border flex items-start gap-2">
                <Shield className="w-4 h-4 text-toxic shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground font-flavor leading-relaxed">
                  Defense is passive. If attacked while owning at least one Defense card, one Defense card is consumed automatically to fully block damage.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-sm text-muted-foreground">
                Owned: <span className="text-foreground font-bold">{owned}</span>
              </span>

              {isActionCard && owned > 0 && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowActivateConfirm(true)}
                  disabled={activationBlocked}
                  className="glow-blood"
                >
                  <Shield className="w-4 h-4 mr-1" />
                  Activate
                </Button>
              )}
            </div>

            {isActionCard && activationBlocked && (
              <p className="text-xs text-blood font-flavor">Activation is currently blocked by admin settings.</p>
            )}
          </div>
        </motion.div>
      </motion.div>

      <AlertDialog open={showActivateConfirm} onOpenChange={setShowActivateConfirm}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-accent">Confirm Activation</AlertDialogTitle>
            <AlertDialogDescription>
              Activate <strong>{card.name}</strong>? This will consume 1 instance and cannot be undone.
              <br />
              <br />
              <em className="text-muted-foreground">{card.description}</em>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {needsTarget && (
            <div className="py-2">
              <label className="text-sm font-flavor mb-1 block">Select Target Team</label>
              <Select value={targetTeamId} onValueChange={setTargetTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a team..." />
                </SelectTrigger>
                <SelectContent>
                  {allTeams.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.team_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isHintCard && hintMissionOptions.length > 1 && (
            <div className="py-2 space-y-2">
              <label className="text-sm font-flavor mb-1 block">Mission for this hint</label>
              <p className="text-xs text-muted-foreground">
                More than one mission is open. Pick which mission&apos;s hint pool to draw from.
              </p>
              <Select value={missionIdForHint || undefined} onValueChange={setMissionIdForHint}>
                <SelectTrigger>
                  <SelectValue placeholder="Select mission…" />
                </SelectTrigger>
                <SelectContent>
                  {hintMissionOptions.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {hintMissionLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isHintCard && hintMissionOptions.length === 0 && (
            <p className="text-xs text-blood font-flavor">No mission is currently open for hints (visible, enabled, and open).</p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={hintConfirmDisabled} onClick={(e) => { e.preventDefault(); void handleActivate(); }}>
              {activating ? "Activating…" : "Confirm Activation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={hintModalOpen} onOpenChange={setHintModalOpen}>
        <DialogContent className="z-[100] max-w-lg w-[calc(100%-2rem)] max-h-[85vh] flex flex-col gap-0 border-border bg-card p-0">
          <DialogHeader className="p-4 pb-2 shrink-0 border-b border-border">
            <DialogTitle className="font-display text-toxic flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Hint unlocked
            </DialogTitle>
            <DialogDescription className="text-left text-xs font-flavor space-y-1">
              <span className="block text-foreground/90">
                {hintModalPayload?.missionName}
                {hintModalPayload?.tier ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · Level: <span className="uppercase text-toxic">{hintModalPayload.tier}</span>
                  </span>
                ) : null}
              </span>
              <span className="block text-muted-foreground">
                This text is saved under <Link to="/my-hints" className="text-toxic underline">My Hints</Link>.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <p className="text-sm leading-relaxed whitespace-pre-wrap font-flavor">{hintModalPayload?.text}</p>
          </div>
          <DialogFooter className="p-4 pt-2 border-t border-border shrink-0">
            <Button type="button" variant="default" className="w-full sm:w-auto" onClick={() => setHintModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AnimatePresence>
  );
}
