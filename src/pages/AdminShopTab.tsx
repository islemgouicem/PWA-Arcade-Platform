/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";

type CardType = "attack" | "defense" | "healing" | "hint_low" | "hint_mid" | "hint_high";

const CARD_ORDER: CardType[] = ["attack", "defense", "healing", "hint_low", "hint_mid", "hint_high"];

const CARD_LABEL: Record<CardType, string> = {
  attack: "Attack",
  defense: "Defense",
  healing: "Healing",
  hint_low: "Hint Low",
  hint_mid: "Hint Mid",
  hint_high: "Hint High",
};

const hasPercent = (cardType: string) => cardType === "attack" || cardType === "healing";
const hasDuration = (cardType: string) => cardType === "defense";

export function AdminShopTab() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, any>>({});

  const { data: rawCards = [] } = useQuery({
    queryKey: ["admin-shop-cards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cards")
        .select(
          "id, name, card_type, rarity, sort_order, shop_price, shop_visible, shop_enabled, reward_enabled, effect_percent, effect_duration_minutes, hint_level",
        )
        .in("card_type", CARD_ORDER)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const cardsByType = useMemo(() => {
    const map = new Map<CardType, any>();
    for (const cardType of CARD_ORDER) {
      const first = rawCards.find((c: any) => c.card_type === cardType);
      if (first) {
        map.set(cardType, { ...first, ...(drafts[first.id] || {}) });
      }
    }
    return map;
  }, [rawCards, drafts]);

  const saveCard = async (cardType: CardType) => {
    const card = cardsByType.get(cardType);
    if (!card) return;
    const draft = drafts[card.id] || {};

    const { error } = await supabase.rpc("admin_set_card_shop_config", {
      p_card_id: card.id,
      p_shop_price: draft.shop_price ?? null,
      p_shop_visible: draft.shop_visible ?? null,
      p_shop_enabled: true,
      p_reward_enabled: cardType.startsWith("hint_") ? false : card.reward_enabled ?? true,
      p_effect_percent: hasPercent(card.card_type) ? (draft.effect_percent ?? card.effect_percent ?? 0) : 0,
      p_effect_duration_minutes: hasDuration(card.card_type)
        ? (draft.effect_duration_minutes ?? card.effect_duration_minutes ?? 0)
        : 0,
      p_hint_level: card.hint_level ?? 1,
      p_linked_mission_id: null,
    });

    if (error) {
      toast.error(error.message || "Failed to save card config");
      return;
    }

    toast.success("Saved");
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[card.id];
      return next;
    });
    queryClient.invalidateQueries({ queryKey: ["admin-shop-cards"] });
  };

  const updateDraft = (cardId: string, patch: Record<string, any>) => {
    setDrafts((prev) => ({
      ...prev,
      [cardId]: { ...(prev[cardId] || {}), ...patch },
    }));
  };

  const missingTypes = CARD_ORDER.filter((t) => !cardsByType.has(t));

  return (
    <div className="space-y-4 mt-4">
      <h2 className="text-2xl font-display text-toxic flex items-center gap-2">
        <Settings2 className="w-6 h-6" /> Shop - card controls
      </h2>

      <p className="text-sm text-muted-foreground max-w-3xl">
        Static admin controls for exactly 6 card types: Attack, Defense, Healing, Hint Low, Hint Mid, Hint High.
        Admin can edit price and visibility for each type, plus attack/heal percentages and defense duration.
      </p>

      {missingTypes.length > 0 && (
        <Card className="border-blood/40 rounded-none bg-blood/10">
          <CardContent className="p-4 text-sm">
            <p className="font-bold text-blood">Missing card rows</p>
            <p className="text-muted-foreground mt-1">
              The following types are missing in DB: {missingTypes.map((t) => CARD_LABEL[t]).join(", ")}. Apply migration{" "}
              <code className="text-xs">20260424113000_admin_shop_strict_six_cards.sql</code>.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {CARD_ORDER.map((cardType) => {
          const card = cardsByType.get(cardType);
          if (!card) {
            return (
              <Card key={cardType} className="border-dashed">
                <CardContent className="p-4 text-sm text-muted-foreground">
                  Missing card for <span className="font-semibold">{CARD_LABEL[cardType]}</span>
                </CardContent>
              </Card>
            );
          }

          return (
            <Card key={card.id} className="border-border rounded-none">
              <CardContent className="p-4 space-y-3">
                <div>
                  <p className="font-bold">{CARD_LABEL[cardType]}</p>
                  <p className="text-xs text-muted-foreground">{card.name}</p>
                </div>

                <div className="grid gap-2">
                  <div>
                    <Label className="text-[10px]">Price (pts)</Label>
                    <Input
                      type="number"
                      value={String(card.shop_price ?? 0)}
                      onChange={(e) => updateDraft(card.id, { shop_price: Number(e.target.value) })}
                    />
                  </div>

                  {hasPercent(cardType) && (
                    <div>
                      <Label className="text-[10px]">
                        {cardType === "attack" ? "Attack percentage (%)" : "Healing percentage (%)"}
                      </Label>
                      <Input
                        type="number"
                        value={String(card.effect_percent ?? 0)}
                        onChange={(e) => updateDraft(card.id, { effect_percent: Number(e.target.value) })}
                      />
                    </div>
                  )}

                  {hasDuration(cardType) && (
                    <div>
                      <Label className="text-[10px]">Defense duration (minutes)</Label>
                      <Input
                        type="number"
                        value={String(card.effect_duration_minutes ?? 0)}
                        onChange={(e) => updateDraft(card.id, { effect_duration_minutes: Number(e.target.value) })}
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 text-[10px]">
                  <Switch
                    checked={!!card.shop_visible}
                    onCheckedChange={(v) => updateDraft(card.id, { shop_visible: v })}
                  />
                  <span>Visible in participant shop</span>
                </div>

                <Button size="sm" className="w-full" onClick={() => saveCard(cardType)}>
                  Save
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
