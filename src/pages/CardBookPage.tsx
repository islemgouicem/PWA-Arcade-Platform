import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { BookOpen, ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import CardDetailModal from "@/components/CardDetailModal";

const SUPPORTED_CARD_TYPES = [
  "attack",
  "defense",
  "healing",
  "hint_low",
  "hint_mid",
  "hint_high",
] as const;
type SupportedCardType = (typeof SUPPORTED_CARD_TYPES)[number];

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

interface TeamCardRow {
  card_id: string;
  quantity: number;
  cards: Card | null;
}

interface OwnedEntry {
  card: Card;
  quantity: number;
}

const cardTypeLabel: Record<string, string> = {
  attack: "Attack",
  defense: "Defense",
  healing: "Healing",
  hint_low: "Hint Low",
  hint_mid: "Hint Mid",
  hint_high: "Hint High",
};

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
  const order = Number.isFinite(card.sort_order) ? card.sort_order : 0;
  return `AR-${String(order + 1).padStart(2, "0")}-${typeToken}`;
}

function splitIntoSpreads(entries: OwnedEntry[]) {
  if (entries.length === 0) {
    return [[null, null, null, null] as Array<OwnedEntry | null>];
  }

  const spreads: Array<Array<OwnedEntry | null>> = [];
  for (let i = 0; i < entries.length; i += CARDS_PER_SPREAD) {
    const chunk: Array<OwnedEntry | null> = entries.slice(i, i + CARDS_PER_SPREAD);
    while (chunk.length < CARDS_PER_SPREAD) chunk.push(null);
    spreads.push(chunk);
  }
  return spreads;
}

function BookCard({ entry, onOpen }: { entry: OwnedEntry; onOpen: () => void }) {
  const { card, quantity } = entry;

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileHover={{ y: -4, scale: 1.015 }}
      whileTap={{ scale: 0.99 }}
      className="book-card-face group"
    >
      <div className="book-card-header">
        <span>{String((card.sort_order ?? 0) + 1).padStart(2, "0")}</span>
        <span className="truncate px-1">{card.name}</span>
        <span>{cardCode(card)}</span>
      </div>

      <div className="book-card-art">
        {card.image_url ? (
          <img src={card.image_url} alt={card.name} className="h-full w-full object-cover" />
        ) : (
          <div className="book-card-art-fallback">
            {card.card_type.startsWith("hint_") ? "?" : "⚔"}
          </div>
        )}

        <div
          className={`book-card-rarity bg-gradient-to-r ${
            rarityBanner[card.rarity] || rarityBanner.ordinary
          }`}
        >
          {rarityLabel[card.rarity] || "Common"}
        </div>

        {quantity > 1 && <div className="book-card-qty">x{quantity}</div>}
      </div>

      <div className="book-card-text">
        <p className="book-card-type">
          {cardTypeLabel[card.card_type] || card.card_type.replace(/_/g, " ")}
        </p>
        <p className="line-clamp-3">{card.description}</p>
      </div>

      <div className="book-card-footer">
        {card.is_mandatory ? (
          <span className="text-blood font-bold">KEY</span>
        ) : (
          <span className="text-muted-foreground">{rarityLabel[card.rarity] || "Common"}</span>
        )}
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

function PageSlot({ entry, onOpen }: { entry: OwnedEntry | null; onOpen: () => void }) {
  if (!entry) {
    return <div className="book-card-slot-empty" aria-hidden="true" />;
  }
  return <BookCard entry={entry} onOpen={onOpen} />;
}

function BookPagePanel({
  entries,
  pageClass,
  onSelect,
}: {
  entries: Array<OwnedEntry | null>;
  pageClass: string;
  onSelect: (card: Card) => void;
}) {
  return (
    <section className={`book-page ${pageClass}`}>
      <div className="book-page-grid">
        {entries.map((entry, idx) => (
          <PageSlot
            key={entry?.card.id || `${pageClass}-${idx}`}
            entry={entry}
            onOpen={() => entry && onSelect(entry.card)}
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

  const { data: inventory = [] } = useQuery({
    queryKey: ["team-cards-book", team?.id],
    queryFn: async () => {
      if (!team) return [] as TeamCardRow[];
      const { data, error } = await supabase
        .from("team_cards")
        .select("card_id, quantity, cards(*)")
        .eq("team_id", team.id)
        .gt("quantity", 0);
      if (error) throw error;
      return (data || []) as unknown as TeamCardRow[];
    },
    enabled: !!team,
  });

  const ownedEntries = useMemo<OwnedEntry[]>(() => {
    return inventory
      .filter(
        (row): row is TeamCardRow & { cards: Card } =>
          !!row.cards &&
          SUPPORTED_CARD_TYPES.includes(row.cards.card_type as SupportedCardType),
      )
      .map((row) => ({ card: row.cards as Card, quantity: row.quantity }))
      .sort((a, b) => {
        const orderA = a.card.sort_order ?? 0;
        const orderB = b.card.sort_order ?? 0;
        if (orderA !== orderB) return orderA - orderB;
        return a.card.name.localeCompare(b.card.name);
      });
  }, [inventory]);

  const ownedTotal = useMemo(
    () => ownedEntries.reduce((sum, entry) => sum + entry.quantity, 0),
    [ownedEntries],
  );

  const spreads = useMemo(() => splitIntoSpreads(ownedEntries), [ownedEntries]);
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

  const turnNext = () => startFlip(1);
  const turnPrev = () => startFlip(-1);

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
        <span className="font-mono-arcade text-biohazard text-sm">{ownedTotal} owned</span>
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
              <BookPagePanel
                entries={leftCards}
                pageClass="book-page-left"
                onSelect={setSelectedCard}
              />

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
                      <BookPagePanel
                        entries={currentLeft}
                        pageClass="book-page-left"
                        onSelect={setSelectedCard}
                      />
                    </div>
                    <div className="book-flip-face book-flip-face-back">
                      <BookPagePanel
                        entries={targetRight}
                        pageClass="book-page-right"
                        onSelect={setSelectedCard}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="book-gutter" aria-hidden="true" />

            <div className="book-page-slot">
              <BookPagePanel
                entries={rightCards}
                pageClass="book-page-right"
                onSelect={setSelectedCard}
              />

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
                      <BookPagePanel
                        entries={currentRight}
                        pageClass="book-page-right"
                        onSelect={setSelectedCard}
                      />
                    </div>
                    <div className="book-flip-face book-flip-face-back">
                      <BookPagePanel
                        entries={targetLeft}
                        pageClass="book-page-left"
                        onSelect={setSelectedCard}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>

      {ownedEntries.length === 0 && (
        <div className="text-center text-sm text-muted-foreground -mt-2">
          <BookOpen className="w-5 h-5 mx-auto mb-1" />
          Inventory empty. Buy cards or receive mission rewards to fill your Card Book.
        </div>
      )}

      {totalSpreads > 1 && (
        <div className="flex items-center justify-center gap-4 pt-1 pb-2">
          <Button
            variant="outline"
            size="icon"
            onClick={turnPrev}
            disabled={currentSpread === 0 || !!flipping}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-center">
            <p className="font-mono-arcade text-sm text-bone">
              Spread {currentSpread + 1} / {totalSpreads}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
              drag to swipe
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={turnNext}
            disabled={currentSpread >= totalSpreads - 1 || !!flipping}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          owned={ownedEntries.find((entry) => entry.card.id === selectedCard.id)?.quantity || 0}
          onClose={() => setSelectedCard(null)}
          teamId={team?.id || ""}
        />
      )}
    </div>
  );
}
