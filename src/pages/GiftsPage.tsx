import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, Package, History, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function GiftsPage() {
  const { team } = useAuth();
  const queryClient = useQueryClient();
  const [openingCoffreId, setOpeningCoffreId] = useState<string | null>(null);
  const [revealedCards, setRevealedCards] = useState<any[]>([]);
  const [animPhase, setAnimPhase] = useState<"idle" | "shake" | "reveal">("idle");

  const { data: coffres = [] } = useQuery({
    queryKey: ["coffres", team?.id],
    queryFn: async () => {
      if (!team) return [];
      const { data } = await supabase
        .from("coffres")
        .select("*, coffre_cards(*, cards(*))")
        .eq("team_id", team.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!team,
  });

  const pendingCoffres = coffres.filter((c: any) => !c.is_opened);
  const openedCoffres = coffres.filter((c: any) => c.is_opened);

  const handleOpen = async (coffreId: string) => {
    if (!team) return;

    setOpeningCoffreId(coffreId);
    setAnimPhase("shake");

    // Wait for shake animation
    await new Promise(r => setTimeout(r, 1500));

    const { data: openResult, error: openError } = await (supabase as any).rpc("open_coffre_atomic", {
      p_coffre_id: coffreId,
    });

    if (openError || !openResult?.ok) {
      setOpeningCoffreId(null);
      setAnimPhase("idle");
      toast.error("Failed to open coffre. Please try again.");
      return;
    }

    // Optimistic cache update so pending count changes immediately.
    const openedAt = new Date().toISOString();
    queryClient.setQueryData(["coffres", team.id], (prev: any[] | undefined) => {
      if (!prev) return prev;
      return prev.map((c) =>
        c.id === coffreId
          ? {
            ...c,
            is_opened: true,
            opened_at: openedAt,
          }
          : c,
      );
    });

    const cards = Array.isArray(openResult.cards) ? openResult.cards : [];
    setRevealedCards(cards);

    setAnimPhase("reveal");
    queryClient.invalidateQueries({ queryKey: ["coffres", team.id] });
    queryClient.invalidateQueries({ queryKey: ["team-cards"] });
    toast.success("Coffre opened! Check your new cards.");
  };

  const closeReveal = () => {
    setOpeningCoffreId(null);
    setRevealedCards([]);
    setAnimPhase("idle");
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-display text-toxic flex items-center gap-2">
        <Gift className="w-8 h-8" /> Get My Gifts
      </h1>

      {/* Pending coffres */}
      <div>
        <h2 className="text-lg font-display text-foreground mb-3 flex items-center gap-2">
          <Package className="w-5 h-5 text-biohazard" /> Pending Coffres
          {pendingCoffres.length > 0 && (
            <span className="bg-accent text-accent-foreground text-xs px-2 py-0.5 rounded-full">
              {pendingCoffres.length}
            </span>
          )}
        </h2>
        {pendingCoffres.length === 0 ? (
          <p className="text-muted-foreground text-sm font-flavor">No coffres waiting. Win games to earn rewards!</p>
        ) : (
          <div className="grid gap-3">
            {pendingCoffres.map((coffre: any) => (
              <motion.div
                key={coffre.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className={`bg-card border border-border rounded-lg p-4 ${openingCoffreId === coffre.id && animPhase === "shake" ? "animate-coffre-shake" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-display text-biohazard">{coffre.coffre_type.replace("_", " ").toUpperCase()}</span>
                    {coffre.source_label && (
                      <p className="text-xs text-muted-foreground font-flavor">{coffre.source_label}</p>
                    )}
                  </div>
                  <Button
                    onClick={() => handleOpen(coffre.id)}
                    disabled={openingCoffreId !== null}
                    className="glow-toxic"
                  >
                    <Sparkles className="w-4 h-4 mr-1" /> Open
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Opened history */}
      <div>
        <h2 className="text-lg font-display text-foreground mb-3 flex items-center gap-2">
          <History className="w-5 h-5" /> History
        </h2>
        {openedCoffres.length === 0 ? (
          <p className="text-muted-foreground text-sm font-flavor">No opened coffres yet.</p>
        ) : (
          <div className="space-y-2">
            {openedCoffres.map((coffre: any) => (
              <div key={coffre.id} className="bg-card border border-border rounded-lg p-3 opacity-70">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-flavor">{coffre.coffre_type.replace("_", " ")}</span>
                  <span className="text-xs text-muted-foreground">{new Date(coffre.opened_at || coffre.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {coffre.coffre_cards?.map((cc: any) => (
                    <span key={cc.id} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded">
                      {cc.cards?.name || "Unknown"}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reveal overlay */}
      <AnimatePresence>
        {animPhase === "reveal" && revealedCards.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/90 backdrop-blur-md flex flex-col items-center justify-center p-4"
            onClick={closeReveal}
          >
            <motion.h2
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="text-4xl font-display text-toxic mb-8"
            >
              Cards Revealed!
            </motion.h2>
            <div className="flex flex-wrap justify-center gap-4 max-w-3xl">
              {revealedCards.map((card, i) => (
                <motion.div
                  key={card.id + "-" + i}
                  className="animate-card-reveal book-card-face w-[170px]"
                  style={{ animationDelay: `${i * 0.3}s`, animationFillMode: "both" }}
                >
                  <div className="book-card-header">
                    <span>GF</span>
                    <span className="truncate px-1">{card.name}</span>
                    <span>{(card.card_type || "card").slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div className="book-card-art">
                    {card.image_url ? (
                      <img src={card.image_url} alt={card.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="book-card-art-fallback">⚔</div>
                    )}
                    <div className="book-card-rarity bg-gradient-to-r from-orange-700 to-red-500">
                      {(card.rarity || "ordinary").toUpperCase()}
                    </div>
                  </div>
                  <div className="book-card-text">
                    <p className="book-card-type">{(card.card_type || "card").replace(/_/g, " ")}</p>
                    <p className="line-clamp-3">{card.description || "New card added to your collection."}</p>
                  </div>
                </motion.div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mt-6 font-flavor">Tap anywhere to close</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
