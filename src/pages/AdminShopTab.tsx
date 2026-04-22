/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";

const supportedCardTypes = ["hint_single", "recovery", "manipulation", "protection"];
const cardTypeOptions = [
    { value: "hint_single", label: "Hint" },
    { value: "recovery", label: "Healing" },
    { value: "manipulation", label: "Attack" },
    { value: "protection", label: "Defend" },
];

const hasEffectPercent = (cardType: string) => cardType === "recovery" || cardType === "manipulation";
const hasDuration = (cardType: string) => cardType === "protection";
const hasHintLevel = (cardType: string) => cardType === "hint_single";

export function AdminShopTab() {
    const queryClient = useQueryClient();
    const [drafts, setDrafts] = useState<Record<string, any>>({});
    const [newCard, setNewCard] = useState({
        name: "",
        card_type: "hint_single",
        rarity: "ordinary",
        shop_price: 40,
        effect_percent: 0,
        effect_duration_minutes: 0,
        hint_level: 1,
        shop_visible: true,
        shop_enabled: true,
    });

    const { data: cards = [] } = useQuery({
        queryKey: ["admin-shop-cards"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("cards")
                .select("id, name, card_type, rarity, image_url, shop_price, shop_visible, shop_enabled, effect_percent, effect_duration_minutes, hint_level")
                .in("card_type", supportedCardTypes)
                .order("sort_order");
            if (error) throw error;
            return data || [];
        },
    });

    const mergedCards = useMemo(() => cards.map((card: any) => ({ ...card, ...(drafts[card.id] || {}) })), [cards, drafts]);

    const createCard = async () => {
        if (!newCard.name.trim()) {
            toast.error("Card name is required");
            return;
        }

        const nextSortOrder = (cards.reduce((max: number, card: any) => Math.max(max, Number(card.sort_order || 0)), 0) || 0) + 1;
        const descriptionByType: Record<string, string> = {
            hint_single: "Reveal a mission hint based on this card level.",
            recovery: "Increase your team health by configured percentage.",
            manipulation: "Reduce target team health by configured percentage.",
            protection: "Block incoming attacks for configured duration.",
        };

        const { error } = await supabase.from("cards").insert({
            name: newCard.name.trim(),
            description: descriptionByType[newCard.card_type] || "Card",
            card_type: newCard.card_type,
            rarity: newCard.rarity,
            point_value: 0,
            is_mandatory: false,
            is_exclusive: false,
            sort_order: nextSortOrder,
            shop_price: Number(newCard.shop_price) || 0,
            shop_visible: newCard.shop_visible,
            shop_enabled: newCard.shop_enabled,
            effect_percent: hasEffectPercent(newCard.card_type) ? (Number(newCard.effect_percent) || 0) : 0,
            effect_duration_minutes: hasDuration(newCard.card_type) ? (Number(newCard.effect_duration_minutes) || 0) : 0,
            hint_level: hasHintLevel(newCard.card_type) ? Math.max(1, Number(newCard.hint_level) || 1) : 1,
        });

        if (error) {
            toast.error(error.message || "Failed to create card");
            return;
        }

        toast.success("Card created");
        setNewCard({
            name: "",
            card_type: "hint_single",
            rarity: "ordinary",
            shop_price: 40,
            effect_percent: 0,
            effect_duration_minutes: 0,
            hint_level: 1,
            shop_visible: true,
            shop_enabled: true,
        });
        queryClient.invalidateQueries({ queryKey: ["admin-shop-cards"] });
    };

    const saveCard = async (cardId: string) => {
        const draft = drafts[cardId] || {};
        const card = mergedCards.find((c: any) => c.id === cardId);
        if (!card) return;

        const { error } = await supabase.rpc("admin_set_card_shop_config", {
            p_card_id: cardId,
            p_shop_price: draft.shop_price ?? null,
            p_shop_visible: draft.shop_visible ?? null,
            p_shop_enabled: draft.shop_enabled ?? null,
            p_effect_percent: hasEffectPercent(card.card_type) ? (draft.effect_percent ?? card.effect_percent ?? 0) : 0,
            p_effect_duration_minutes: hasDuration(card.card_type) ? (draft.effect_duration_minutes ?? card.effect_duration_minutes ?? 0) : 0,
            p_hint_level: hasHintLevel(card.card_type) ? (draft.hint_level ?? card.hint_level ?? 1) : 1,
        });

        if (error) {
            toast.error(error.message || "Failed to save card config");
            return;
        }

        toast.success("Card configuration saved");
        queryClient.invalidateQueries({ queryKey: ["admin-shop-cards"] });
    };

    const updateDraft = (cardId: string, patch: Record<string, any>) => {
        setDrafts((prev) => ({
            ...prev,
            [cardId]: { ...(prev[cardId] || {}), ...patch },
        }));
    };

    return (
        <div className="space-y-4 mt-4">
            <h2 className="text-2xl font-display text-toxic flex items-center gap-2">
                <Settings2 className="w-6 h-6" /> Shop Management
            </h2>

            <Card className="border-border rounded-none">
                <CardContent className="p-4 space-y-3">
                    <p className="font-bold text-sm">Create Card</p>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div>
                            <Label className="text-xs">Card Name</Label>
                            <Input value={newCard.name} onChange={(e) => setNewCard((prev) => ({ ...prev, name: e.target.value }))} />
                        </div>
                        <div>
                            <Label className="text-xs">Card Type</Label>
                            <Select
                                value={newCard.card_type}
                                onValueChange={(value) => setNewCard((prev) => ({ ...prev, card_type: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {cardTypeOptions.map((type) => (
                                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-xs">Rarity</Label>
                            <Select value={newCard.rarity} onValueChange={(value) => setNewCard((prev) => ({ ...prev, rarity: value }))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ordinary">ordinary</SelectItem>
                                    <SelectItem value="rare">rare</SelectItem>
                                    <SelectItem value="epic">epic</SelectItem>
                                    <SelectItem value="legendary">legendary</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-xs">Price</Label>
                            <Input type="number" value={newCard.shop_price} onChange={(e) => setNewCard((prev) => ({ ...prev, shop_price: Number(e.target.value) }))} />
                        </div>
                    </div>

                    {(hasEffectPercent(newCard.card_type) || hasDuration(newCard.card_type) || hasHintLevel(newCard.card_type)) && (
                        <div className="grid gap-3 md:grid-cols-3">
                            {hasEffectPercent(newCard.card_type) && (
                                <div>
                                    <Label className="text-xs">Effect %</Label>
                                    <Input type="number" value={newCard.effect_percent} onChange={(e) => setNewCard((prev) => ({ ...prev, effect_percent: Number(e.target.value) }))} />
                                </div>
                            )}
                            {hasDuration(newCard.card_type) && (
                                <div>
                                    <Label className="text-xs">Duration (min)</Label>
                                    <Input type="number" value={newCard.effect_duration_minutes} onChange={(e) => setNewCard((prev) => ({ ...prev, effect_duration_minutes: Number(e.target.value) }))} />
                                </div>
                            )}
                            {hasHintLevel(newCard.card_type) && (
                                <div>
                                    <Label className="text-xs">Hint Level</Label>
                                    <Input type="number" min={1} value={newCard.hint_level} onChange={(e) => setNewCard((prev) => ({ ...prev, hint_level: Number(e.target.value) }))} />
                                </div>
                            )}
                        </div>
                    )}

                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="flex items-center justify-between rounded border border-border px-3 py-2">
                            <Label className="text-xs">Visible</Label>
                            <Switch checked={newCard.shop_visible} onCheckedChange={(value) => setNewCard((prev) => ({ ...prev, shop_visible: value }))} />
                        </div>
                        <div className="flex items-center justify-between rounded border border-border px-3 py-2">
                            <Label className="text-xs">Enabled</Label>
                            <Switch checked={newCard.shop_enabled} onCheckedChange={(value) => setNewCard((prev) => ({ ...prev, shop_enabled: value }))} />
                        </div>
                    </div>

                    <Button onClick={createCard}>Create Card</Button>
                </CardContent>
            </Card>

            <div className="grid gap-3">
                {mergedCards.length === 0 && (
                    <Card className="border-border rounded-none">
                        <CardContent className="p-6 text-sm text-muted-foreground">
                            No supported cards found. The shop only uses Hint, Healing, Attack, and Defend cards.
                        </CardContent>
                    </Card>
                )}

                {mergedCards.map((card: any) => (
                    <Card key={card.id} className="border-border rounded-none">
                        <CardContent className="p-4 space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="font-bold text-lg">{card.name}</p>
                                    <p className="text-xs text-muted-foreground capitalize">{card.card_type.replace(/_/g, " ")} • {card.rarity}</p>
                                </div>
                                <div className="w-20 text-right text-xs text-muted-foreground">{card.shop_price} pts</div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                <div>
                                    <Label className="text-xs">Price</Label>
                                    <Input
                                        type="number"
                                        defaultValue={String(card.shop_price ?? 0)}
                                        onChange={(e) => updateDraft(card.id, { shop_price: Number(e.target.value) })}
                                    />
                                </div>
                                {hasEffectPercent(card.card_type) && (
                                    <div>
                                        <Label className="text-xs">Effect %</Label>
                                        <Input
                                            type="number"
                                            defaultValue={String(card.effect_percent ?? 0)}
                                            onChange={(e) => updateDraft(card.id, { effect_percent: Number(e.target.value) })}
                                        />
                                    </div>
                                )}
                                {hasDuration(card.card_type) && (
                                    <div>
                                        <Label className="text-xs">Duration (min)</Label>
                                        <Input
                                            type="number"
                                            defaultValue={String(card.effect_duration_minutes ?? 0)}
                                            onChange={(e) => updateDraft(card.id, { effect_duration_minutes: Number(e.target.value) })}
                                        />
                                    </div>
                                )}
                                {hasHintLevel(card.card_type) && (
                                    <div>
                                        <Label className="text-xs">Hint Level</Label>
                                        <Input
                                            type="number"
                                            defaultValue={String(card.hint_level ?? 1)}
                                            onChange={(e) => updateDraft(card.id, { hint_level: Number(e.target.value) })}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="flex items-center justify-between rounded border border-border px-3 py-2">
                                    <Label className="text-xs">Visible</Label>
                                    <Switch
                                        checked={card.shop_visible}
                                        onCheckedChange={(value) => updateDraft(card.id, { shop_visible: value })}
                                    />
                                </div>
                                <div className="flex items-center justify-between rounded border border-border px-3 py-2">
                                    <Label className="text-xs">Enabled</Label>
                                    <Switch
                                        checked={card.shop_enabled}
                                        onCheckedChange={(value) => updateDraft(card.id, { shop_enabled: value })}
                                    />
                                </div>
                            </div>

                            <Button onClick={() => saveCard(card.id)}>Save Card</Button>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
