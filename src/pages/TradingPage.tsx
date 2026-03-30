import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlatformSettings } from "@/hooks/use-platform-settings";
import { motion } from "framer-motion";
import { ShoppingBag, ArrowLeftRight, DollarSign, ShoppingCart, Lock, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export default function TradingPage() {
  const { team } = useAuth();
  const queryClient = useQueryClient();
  const { getSetting } = usePlatformSettings();
  const isOpen = getSetting("trading_window_open", false) === true;
  const winnerDeclared = getSetting("winner_declared", false) === true;
  const tradingAvailable = isOpen && !winnerDeclared;

  const [tradeOffer, setTradeOffer] = useState("");
  const [tradeWant, setTradeWant] = useState("");
  const [tradeTarget, setTradeTarget] = useState("");
  const [sellCard, setSellCard] = useState("");
  const [sellPrice, setSellPrice] = useState("");

  const { data: myCards = [] } = useQuery({
    queryKey: ["my-cards-for-trade", team?.id],
    queryFn: async () => {
      if (!team) return [];
      const { data } = await supabase
        .from("team_cards")
        .select("*, cards(*)")
        .eq("team_id", team.id);
      return data || [];
    },
    enabled: !!team,
  });

  const { data: allCards = [] } = useQuery({
    queryKey: ["all-cards"],
    queryFn: async () => {
      const { data } = await supabase.from("cards").select("id, name, rarity").order("name");
      return data || [];
    },
  });

  const { data: storeItems = [] } = useQuery({
    queryKey: ["store-inventory"],
    queryFn: async () => {
      const { data } = await supabase.from("store_inventory").select("*, cards(*)").gt("quantity", 0);
      return data || [];
    },
  });

  const { data: allTeams = [] } = useQuery({
    queryKey: ["teams-for-trade"],
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("id, team_name").neq("id", team?.id || "");
      return data || [];
    },
    enabled: !!team,
  });

  const { data: myTransactions = [] } = useQuery({
    queryKey: ["my-transactions", team?.id],
    queryFn: async () => {
      if (!team) return [];
      const { data } = await supabase
        .from("trade_requests")
        .select("*, cards:offered_card_id(name), wanted:wanted_card_id(name)")
        .eq("team_id", team.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!team,
  });

  const submitTrade = async () => {
    if (!team) return;
    const { error } = await supabase.from("trade_requests").insert({
      team_id: team.id,
      request_type: "trade" as any,
      offered_card_id: tradeOffer,
      wanted_card_id: tradeWant,
      target_team_id: tradeTarget || null,
      status: "pending" as any,
    });
    if (error) toast.error("Failed to submit trade");
    else {
      toast.success("Trade request submitted!");
      setTradeOffer("");
      setTradeWant("");
      setTradeTarget("");
      queryClient.invalidateQueries({ queryKey: ["my-transactions"] });
    }
  };

  const submitSell = async () => {
    if (!team || !sellPrice) return;
    const { error } = await supabase.from("trade_requests").insert({
      team_id: team.id,
      request_type: "sell" as any,
      offered_card_id: sellCard,
      price: parseInt(sellPrice),
      status: "pending" as any,
    });
    if (error) toast.error("Failed to submit sell request");
    else {
      toast.success("Sell request submitted!");
      setSellCard("");
      setSellPrice("");
      queryClient.invalidateQueries({ queryKey: ["my-transactions"] });
    }
  };

  const submitBuy = async (storeItemId: string, cardId: string, price: number) => {
    if (!team) return;
    const { error } = await supabase.from("trade_requests").insert({
      team_id: team.id,
      request_type: "buy" as any,
      wanted_card_id: cardId,
      price,
      status: "pending" as any,
    });
    if (error) toast.error("Failed to submit purchase");
    else {
      toast.success("Purchase request sent to Shopper!");
      queryClient.invalidateQueries({ queryKey: ["my-transactions"] });
    }
  };

  if (!tradingAvailable) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Lock className="w-12 h-12 text-muted-foreground mb-3" />
        <p className="text-xl font-display text-muted-foreground">Trading Window Closed</p>
        <p className="text-sm text-muted-foreground font-flavor mt-1">
          {winnerDeclared ? "Trading is frozen after winner declaration" : "Wait for the admin to open trading"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-display text-toxic flex items-center gap-2">
        <ShoppingBag className="w-8 h-8" /> Trading Post
      </h1>

      <Tabs defaultValue="trade">
        <TabsList className="w-full">
          <TabsTrigger value="trade" className="flex-1"><ArrowLeftRight className="w-4 h-4 mr-1" />Trade</TabsTrigger>
          <TabsTrigger value="sell" className="flex-1"><DollarSign className="w-4 h-4 mr-1" />Sell</TabsTrigger>
          <TabsTrigger value="buy" className="flex-1"><ShoppingCart className="w-4 h-4 mr-1" />Buy</TabsTrigger>
          <TabsTrigger value="history" className="flex-1"><History className="w-4 h-4 mr-1" />Log</TabsTrigger>
        </TabsList>

        <TabsContent value="trade" className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-flavor mb-1 block">Card to Offer</label>
            <Select value={tradeOffer} onValueChange={setTradeOffer}>
              <SelectTrigger><SelectValue placeholder="Select card..." /></SelectTrigger>
              <SelectContent>
                {myCards.map((tc: any) => (
                  <SelectItem key={tc.card_id} value={tc.card_id}>
                    {tc.cards?.name} (x{tc.quantity})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-flavor mb-1 block">Card You Want</label>
            <Select value={tradeWant} onValueChange={setTradeWant}>
              <SelectTrigger><SelectValue placeholder="Select card..." /></SelectTrigger>
              <SelectContent>
                {allCards.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name} ({c.rarity})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-flavor mb-1 block">Target Team (optional)</label>
            <Select value={tradeTarget} onValueChange={setTradeTarget}>
              <SelectTrigger><SelectValue placeholder="Any team..." /></SelectTrigger>
              <SelectContent>
                {allTeams.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.team_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={submitTrade} disabled={!tradeOffer || !tradeWant} className="w-full">
            Submit Trade Request
          </Button>
        </TabsContent>

        <TabsContent value="sell" className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-flavor mb-1 block">Card to Sell</label>
            <Select value={sellCard} onValueChange={setSellCard}>
              <SelectTrigger><SelectValue placeholder="Select card..." /></SelectTrigger>
              <SelectContent>
                {myCards.map((tc: any) => (
                  <SelectItem key={tc.card_id} value={tc.card_id}>
                    {tc.cards?.name} (x{tc.quantity})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-flavor mb-1 block">Asking Price (points)</label>
            <Input
              type="number"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              placeholder="100"
            />
          </div>
          <Button onClick={submitSell} disabled={!sellCard || !sellPrice} className="w-full">
            Submit Sell Request
          </Button>
        </TabsContent>

        <TabsContent value="buy" className="space-y-3 mt-4">
          {storeItems.length === 0 ? (
            <p className="text-muted-foreground font-flavor text-sm">No items in the store right now.</p>
          ) : (
            storeItems.map((item: any) => (
              <div key={item.id} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm">{item.cards?.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{item.cards?.rarity} • x{item.quantity}</p>
                </div>
                <Button size="sm" onClick={() => submitBuy(item.id, item.card_id, item.price)}>
                  Buy ({item.price} pts)
                </Button>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-2 mt-4">
          {myTransactions.length === 0 ? (
            <p className="text-muted-foreground font-flavor text-sm">No transactions yet.</p>
          ) : (
            myTransactions.map((tx: any) => (
              <div key={tx.id} className="bg-card border border-border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-flavor capitalize">{tx.request_type}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${tx.status === "completed" ? "bg-toxic/20 text-toxic" :
                      tx.status === "rejected" ? "bg-blood/20 text-blood" :
                        "bg-biohazard/20 text-biohazard"
                    }`}>{tx.status}</span>
                </div>
                <p className="text-sm mt-1">
                  {tx.cards?.name && `Offered: ${tx.cards.name}`}
                  {tx.wanted?.name && ` → Want: ${tx.wanted.name}`}
                  {tx.price && ` • ${tx.price} pts`}
                </p>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
