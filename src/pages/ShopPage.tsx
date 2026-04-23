/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ShoppingCart, Coins, EyeOff } from "lucide-react";

const supportedCardTypes = ["attack", "defense", "healing", "hint_low", "hint_mid", "hint_high"];

interface ShopCard {
  id: string;
  name: string;
  description: string;
  card_type: string;
  rarity: string;
  image_url: string | null;
  shop_price: number;
  sort_order: number;
  shop_visible: boolean;
  shop_enabled: boolean;
}

const availabilityLabel = (card: ShopCard) => {
  if (!card.shop_visible) return "Hidden";
  if (!card.shop_enabled) return "Disabled";
  return "Available";
};

export default function ShopPage() {
  const { team } = useAuth();
  const queryClient = useQueryClient();

  const { data: cards = [] } = useQuery({
    queryKey: ["shop-catalogue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cards")
        .select("id, name, description, card_type, rarity, image_url, shop_price, sort_order, shop_visible, shop_enabled")
        .eq("shop_visible", true)
        .in("card_type", supportedCardTypes)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as ShopCard[];
    },
  });

  // Enforce one visible row per type on participant side.
  const purchasableCards = useMemo(() => {
    const byType = new Map<string, ShopCard>();
    for (const c of cards) {
      if (!byType.has(c.card_type)) byType.set(c.card_type, c);
    }
    return supportedCardTypes.map((t) => byType.get(t)).filter(Boolean) as ShopCard[];
  }, [cards]);

  const buyCard = async (cardId: string) => {
    if (!team) {
      toast.error("Team not loaded");
      return;
    }

    const { error } = await supabase.rpc("purchase_shop_card", {
      p_team_id: team.id,
      p_card_id: cardId,
      p_quantity: 1,
    });

    if (error) {
      toast.error(error.message || "Purchase failed");
      return;
    }

    toast.success("Card purchased successfully");
    queryClient.invalidateQueries({ queryKey: ["shop-catalogue"] });
    queryClient.invalidateQueries({ queryKey: ["team-cards", team.id] });
    queryClient.invalidateQueries({ queryKey: ["ranking-teams"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display text-toxic flex items-center gap-2">
            <ShoppingCart className="w-8 h-8" /> Shop
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Buy cards directly using team points.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <Coins className="w-4 h-4 text-biohazard" />
          <span className="font-mono-arcade text-sm">{team?.points ?? 0} pts</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {purchasableCards.length === 0 ? (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="py-12 text-center text-muted-foreground">
              No cards are currently available in the shop.
            </CardContent>
          </Card>
        ) : (
          purchasableCards.map((card) => {
            const available = card.shop_visible && card.shop_enabled;
            const canAfford = (team?.points ?? 0) >= card.shop_price;

            return (
              <Card key={card.id} className="overflow-hidden border-border">
                <div className="aspect-[4/3] bg-secondary">
                  <img src={card.image_url || "/card-placeholder.svg"} alt={card.name} className="h-full w-full object-cover" />
                </div>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-lg leading-tight">{card.name}</p>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        {card.card_type.replace(/_/g, " ")}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-secondary text-muted-foreground">
                      {availabilityLabel(card)}
                    </span>
                  </div>

                  <p className="text-sm text-muted-foreground line-clamp-3">{card.description}</p>

                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono-arcade text-biohazard">{card.shop_price} pts</span>
                    <span className="text-xs text-muted-foreground capitalize">{card.rarity}</span>
                  </div>

                  <Button className="w-full" disabled={!available || !canAfford} onClick={() => buyCard(card.id)}>
                    {available ? (canAfford ? "Buy Card" : "Not Enough Points") : <><EyeOff className="w-4 h-4 mr-2" />Unavailable</>}
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
