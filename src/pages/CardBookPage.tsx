import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { ChevronLeft, ChevronRight, Lock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import CardDetailModal from "@/components/CardDetailModal";

const CARDS_PER_SPREAD = 4;

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
  sort_order: number;
}

interface TeamCard {
  card_id: string;
  quantity: number;
}

const rarityLabel: Record<string, string> = {
  ordinary: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

const rarityBanner: Record<string, string> = {
  ordinary: "from-zinc-700 to-zinc-500",
  rare: "from-orange-600 to-orange-400",
  epic: "from-red-700 to-red-500",
  legendary: "from-amber-500 to-yellow-300",
};

function cardCode(card: Card) {
  const typeToken = card.card_type.slice(0, 2).toUpperCase();
  return `AR-${String(card.sort_order + 1).padStart(2, "0")}-${typeToken}`;
}

function splitIntoSpreads(cards: Card[]) {
  if (cards.length === 0) return [[null, null, null, null] as Array<Card | null>];

  const spreads: Array<Array<Card | null>> = [];
  for (let i = 0; i < cards.length; i += CARDS_PER_SPREAD) {
    const chunk: Array<Card | null> = cards.slice(i, i + CARDS_PER_SPREAD);
    while (chunk.length < CARDS_PER_SPREAD) chunk.push(null);
    spreads.push(chunk);
  }
  return spreads;
}

function BookCard({
  card,
  owned,
  onOpen,
}: {
  card: Card;
  owned: number;
  onOpen: () => void;
}) {
  const isOwned = owned > 0;

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileHover={{ y: -4, scale: 1.015 }}
      whileTap={{ scale: 0.99 }}
      className="book-card-face group"
    >
      <div className="book-card-header">
        <span>{String(card.sort_order + 1).padStart(2, "0")}</span>
        <span className="truncate px-1">{card.name}</span>
        <span>{cardCode(card)}</span>
      </div>

      <div className={`book-card-art ${!isOwned ? "card-unowned" : ""}`}>
        {card.image_url ? (
          <img src={card.image_url} alt={card.name} className="h-full w-full object-cover" />
        ) : (
          <div className="book-card-art-fallback">
            {card.card_type === "hint_single" || card.card_type === "hint_combined" ? "?" : "⚔"}
          </div>
        )}

        {!isOwned && (
          <div className="book-card-locked-overlay">
            <Lock className="w-6 h-6" />
            <span className="text-[10px] tracking-widest">LOCKED</span>
          </div>
        )}

        <div className={`book-card-rarity bg-gradient-to-r ${rarityBanner[card.rarity] || rarityBanner.ordinary}`}>
          {rarityLabel[card.rarity] || "Common"}
        </div>

        {owned > 1 && <div className="book-card-qty">x{owned}</div>}
      </div>

      <div className="book-card-text">
        <p className="book-card-type">{card.card_type.replace(/_/g, " ")}</p>
        <p className="line-clamp-3">{isOwned ? card.description : "Unknown card. Acquire this card to reveal its full details."}</p>
      </div>

      <div className="book-card-footer">
        {card.is_mandatory ? <span className="text-blood font-bold">KEY</span> : <span className="text-muted-foreground">{rarityLabel[card.rarity]}</span>}
        {card.point_value > 0 ? (
          <span className="text-biohazard flex items-center gap-1 font-mono-arcade">
            <Zap className="w-3 h-3" /> {card.point_value}
          </span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </div>
    </motion.button>
  );
}

function PageSlot({
  card,
  owned,
  onOpen,
}: {
  card: Card | null;
  owned: number;
  onOpen: () => void;
}) {
  if (!card) {
    return <div className="book-card-slot-empty" aria-hidden="true" />;
  }

  return <BookCard card={card} owned={owned} onOpen={onOpen} />;
}

function BookPagePanel({
  cards,
  ownedMap,
  pageClass,
  onSelect,
}: {
  cards: Array<Card | null>;
  ownedMap: Record<string, number>;
  pageClass: string;
  onSelect: (card: Card) => void;
}) {
  return (
    <section className={`book-page ${pageClass}`}>
      <div className="book-page-grid">
        {cards.map((card, idx) => (
          <PageSlot
            key={card?.id || `${pageClass}-${idx}`}
            card={card}
            owned={card ? ownedMap[card.id] || 0 : 0}
            onOpen={() => card && onSelect(card)}
          />
        ))}
      </div>
    </section>
  );
}

export default function CardBookPage() {
  const { team } = useAuth();
  const [currentSpread, setCurrentSpread] = useState(0);
  const [flipping, setFlipping] = useState<null | { direction: 1 | -1; target: number }>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  const { data: cards = [] } = useQuery({
    queryKey: ["cards-catalogue"],
    queryFn: async () => {
      const { data } = await supabase.from("cards").select("*").order("sort_order");
      return (data || []) as Card[];
    },
  });

  const { data: teamCards = [] } = useQuery({
    queryKey: ["team-cards", team?.id],
    queryFn: async () => {
      if (!team) return [];
      const { data } = await supabase.from("team_cards").select("card_id, quantity").eq("team_id", team.id);
      return (data || []) as TeamCard[];
    },
    enabled: !!team,
  });

  const ownedMap = useMemo(() => {
    const map: Record<string, number> = {};
    teamCards.forEach((tc) => { map[tc.card_id] = tc.quantity; });
    return map;
  }, [teamCards]);

  const spreads = useMemo(() => splitIntoSpreads(cards), [cards]);
  const totalSpreads = spreads.length;

  useEffect(() => {
    if (currentSpread >= totalSpreads) {
      setCurrentSpread(Math.max(0, totalSpreads - 1));
    }
  }, [currentSpread, totalSpreads]);

  const visibleSpread = spreads[currentSpread] || [null, null, null, null];
  const targetSpread = flipping ? spreads[flipping.target] || visibleSpread : visibleSpread;

  const leftCards = targetSpread.slice(0, 2);
  const rightCards = targetSpread.slice(2, 4);

  const currentLeft = visibleSpread.slice(0, 2);
  const currentRight = visibleSpread.slice(2, 4);

  const targetLeft = targetSpread.slice(0, 2);
  const targetRight = targetSpread.slice(2, 4);

  const startFlip = (direction: 1 | -1) => {
    if (flipping) return;
    const target = currentSpread + direction;
    if (target < 0 || target >= totalSpreads) return;
    setFlipping({ direction, target });
  };

  const turnNext = () => {
    startFlip(1);
  };

  const turnPrev = () => {
    startFlip(-1);
  };

  const onDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const swipePower = info.offset.x + info.velocity.x * 0.35;
    if (swipePower > 90) {
      turnNext();
      return;
    }
    if (swipePower < -90) {
      turnPrev();
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-3xl font-display text-toxic tracking-wide">Card Book</h1>
        <span className="font-mono-arcade text-biohazard text-sm">
          {teamCards.reduce((sum, tc) => sum + tc.quantity, 0)} owned
        </span>
      </div>

      <div className="book-stage flex-1 min-h-[560px] md:min-h-[640px]">
        <motion.div
          drag={flipping ? false : "x"}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.14}
          onDragEnd={onDragEnd}
          className="book-shell book-shell-draggable"
        >
          <div className="book-spread">
            <div className="book-page-slot">
              <BookPagePanel cards={leftCards} ownedMap={ownedMap} pageClass="book-page-left" onSelect={setSelectedCard} />

              <AnimatePresence>
                {flipping?.direction === -1 && (
                  <motion.div
                    key={`flip-left-${currentSpread}`}
                    className="book-flip-sheet book-flip-sheet-left"
                    style={{ transformOrigin: "right center" }}
                    initial={{ rotateY: 0 }}
                    animate={{ rotateY: 180 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.62, ease: [0.26, 0.12, 0.16, 1] }}
                    onAnimationComplete={() => {
                      if (!flipping) return;
                      setCurrentSpread(flipping.target);
                      setFlipping(null);
                    }}
                  >
                    <div className="book-flip-face book-flip-face-front">
                      <BookPagePanel cards={currentLeft} ownedMap={ownedMap} pageClass="book-page-left" onSelect={setSelectedCard} />
                    </div>
                    <div className="book-flip-face book-flip-face-back">
                      <BookPagePanel cards={targetRight} ownedMap={ownedMap} pageClass="book-page-right" onSelect={setSelectedCard} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="book-gutter" aria-hidden="true" />

            <div className="book-page-slot">
              <BookPagePanel cards={rightCards} ownedMap={ownedMap} pageClass="book-page-right" onSelect={setSelectedCard} />

              <AnimatePresence>
                {flipping?.direction === 1 && (
                  <motion.div
                    key={`flip-right-${currentSpread}`}
                    className="book-flip-sheet book-flip-sheet-right"
                    style={{ transformOrigin: "left center" }}
                    initial={{ rotateY: 0 }}
                    animate={{ rotateY: -180 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.62, ease: [0.26, 0.12, 0.16, 1] }}
                    onAnimationComplete={() => {
                      if (!flipping) return;
                      setCurrentSpread(flipping.target);
                      setFlipping(null);
                    }}
                  >
                    <div className="book-flip-face book-flip-face-front">
                      <BookPagePanel cards={currentRight} ownedMap={ownedMap} pageClass="book-page-right" onSelect={setSelectedCard} />
                    </div>
                    <div className="book-flip-face book-flip-face-back">
                      <BookPagePanel cards={targetLeft} ownedMap={ownedMap} pageClass="book-page-left" onSelect={setSelectedCard} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>

      {totalSpreads > 1 && (
        <div className="flex items-center justify-center gap-4 pt-1 pb-2">
          <Button variant="outline" size="icon" onClick={turnPrev} disabled={currentSpread === 0 || !!flipping}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-center">
            <p className="font-mono-arcade text-sm text-bone">Spread {currentSpread + 1} / {totalSpreads}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">drag to swipe</p>
          </div>
          <Button variant="outline" size="icon" onClick={turnNext} disabled={currentSpread >= totalSpreads - 1 || !!flipping}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          owned={ownedMap[selectedCard.id] || 0}
          onClose={() => setSelectedCard(null)}
          teamId={team?.id || ""}
        />
      )}
    </div>
  );
}
