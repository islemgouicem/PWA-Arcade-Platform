import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, Swords, Shield, Eye, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
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
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/useAuth";

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

const actionTypes = ["recovery", "manipulation", "protection", "hint_single"];

const rarityColors: Record<string, string> = {
  ordinary: "text-rarity-ordinary",
  rare: "text-rarity-rare",
  epic: "text-rarity-epic",
  legendary: "text-rarity-legendary",
};

export default function CardDetailModal({ card, owned, onClose, teamId }: Props) {
  const { team } = useAuth();
  const queryClient = useQueryClient();
  const [showActivateConfirm, setShowActivateConfirm] = useState(false);
  const [targetTeamId, setTargetTeamId] = useState("");
  const [activating, setActivating] = useState(false);
  const [activationResult, setActivationResult] = useState<any>(null);
  const isActionCard = actionTypes.includes(card.card_type);
  const isHintCard = card.card_type === "hint_single";
  const needsTarget = ["manipulation"].includes(card.card_type);

  const { data: allTeams = [] } = useQuery({
    queryKey: ["all-teams"],
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("id, team_name").neq("id", teamId);
      return data || [];
    },
    enabled: needsTarget && owned > 0,
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

  const handleActivate = async () => {
    setActivating(true);
    try {
      const { data, error } = await supabase.rpc("process_card_activation", {
        p_team_id: teamId,
        p_card_id: card.id,
        p_target_team_id: needsTarget ? targetTeamId || null : null,
      });

      if (error) {
        throw error;
      }

      setActivationResult(data || null);
      const revealedHint = data?.result?.hint_text;
      if (data?.action_type === "hint" && revealedHint) {
        toast.success(`Hint unlocked: ${revealedHint}`);
      } else {
        toast.success(`${card.name} activated!`);
      }
      queryClient.invalidateQueries({ queryKey: ["team-cards"] });
      queryClient.invalidateQueries({ queryKey: ["admin-activations"] });
    } catch (error: any) {
      toast.error(error?.message || "Activation failed");
    }
    setActivating(false);
  };

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
          initial={{ scale: 0.8, rotateY: 90 }}
          animate={{ scale: 1, rotateY: 0 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ type: "spring", damping: 20 }}
          className="bg-card border border-border rounded-lg max-w-sm w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Card image */}
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
                <p className="text-xs text-muted-foreground font-flavor capitalize">{card.card_type.replace("_", " ")}</p>
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

            {activationResult?.result?.effect === "hint" && activationResult?.result?.hint_text && (
              <div className="bg-toxic/10 border border-toxic rounded p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-toxic" />
                  <span className="text-xs font-bold text-toxic">REVEALED HINT</span>
                </div>
                <p className="text-sm font-flavor">{activationResult.result.hint_text}</p>
              </div>
            )}

            {activationResult?.result?.effect && activationResult.result.effect !== "hint" && (
              <div className="bg-secondary rounded p-3 border border-border">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Activation Result</p>
                <pre className="text-xs whitespace-pre-wrap font-mono-arcade text-foreground/80">{JSON.stringify(activationResult.result, null, 2)}</pre>
              </div>
            )}

            {/* Hint content */}
            {isHintCard && owned > 0 && (card.hint_content || activationResult?.result?.hint_text) && (
              <div className="bg-secondary rounded p-3 border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-4 h-4 text-toxic" />
                  <span className="text-xs font-bold text-toxic">HINT CONTENT</span>
                </div>
                <p className="text-sm font-flavor">{activationResult?.result?.hint_text || card.hint_content}</p>
              </div>
            )}

            {isHintCard && owned === 0 && (
              <div className="bg-secondary rounded p-3 border border-border flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground font-flavor">Acquire this card to reveal the hint</span>
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
              <br /><br />
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
                    <SelectItem key={t.id} value={t.id}>{t.team_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleActivate}
              disabled={activating || (needsTarget && !targetTeamId)}
            >
              {activating ? "Activating..." : "Confirm Activation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AnimatePresence>
  );
}
