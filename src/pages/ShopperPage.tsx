import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Store, Check, X, ArrowLeftRight, DollarSign, ShoppingCart, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function ShopperPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const { data: pendingRequests = [] } = useQuery({
    queryKey: ["shopper-pending"],
    queryFn: async () => {
      const { data } = await supabase
        .from("trade_requests")
        .select("*, teams(team_name), cards:offered_card_id(name, rarity, is_mandatory, is_exclusive), wanted:wanted_card_id(name, rarity)")
        .eq("status", "pending")
        .order("created_at");
      return data || [];
    },
    refetchInterval: 5000,
  });

  const { data: transactionLog = [] } = useQuery({
    queryKey: ["shopper-log"],
    queryFn: async () => {
      const { data } = await supabase
        .from("trade_requests")
        .select("*, teams(team_name), cards:offered_card_id(name), wanted:wanted_card_id(name)")
        .in("status", ["completed", "rejected"])
        .order("updated_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const handleApprove = async (request: any) => {
    try {
      if (!user) {
        toast.error("You must be logged in as shopper");
        return;
      }

      const { error } = await supabase.rpc("process_trade_request", {
        p_request_id: request.id,
        p_action: "approve",
        p_actor_user_id: user.id,
      });

      if (error) {
        toast.error(error.message || "Failed to process request");
        return;
      }

      toast.success("Request approved and processed");
      queryClient.invalidateQueries({ queryKey: ["shopper-pending"] });
      queryClient.invalidateQueries({ queryKey: ["shopper-log"] });
      queryClient.invalidateQueries({ queryKey: ["store-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["admin-teams"] });
    } catch {
      toast.error("Failed to process request");
    }
  };

  const handleReject = async (requestId: string) => {
    const reason = rejectReason[requestId] || "Rejected by Shopper";
    if (!user) {
      toast.error("You must be logged in as shopper");
      return;
    }

    const { error } = await supabase.rpc("process_trade_request", {
      p_request_id: requestId,
      p_action: "reject",
      p_actor_user_id: user.id,
      p_reject_reason: reason,
    });

    if (error) {
      toast.error(error.message || "Failed to reject request");
      return;
    }

    toast.success("Request rejected");
    queryClient.invalidateQueries({ queryKey: ["shopper-pending"] });
    queryClient.invalidateQueries({ queryKey: ["shopper-log"] });
  };

  const trades = pendingRequests.filter((r: any) => r.request_type === "trade");
  const sells = pendingRequests.filter((r: any) => r.request_type === "sell");
  const buys = pendingRequests.filter((r: any) => r.request_type === "buy");

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-display text-toxic flex items-center gap-2">
        <Store className="w-8 h-8" /> Shopper Dashboard
      </h1>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-biohazard">{trades.length}</p>
          <p className="text-xs text-muted-foreground">Trades</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-biohazard">{sells.length}</p>
          <p className="text-xs text-muted-foreground">Sells</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-biohazard">{buys.length}</p>
          <p className="text-xs text-muted-foreground">Buys</p>
        </div>
      </div>

      <Tabs defaultValue="queue">
        <TabsList className="w-full">
          <TabsTrigger value="queue" className="flex-1">Queue ({pendingRequests.length})</TabsTrigger>
          <TabsTrigger value="log" className="flex-1"><History className="w-4 h-4 mr-1" />Log</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-3 mt-4">
          {pendingRequests.length === 0 ? (
            <p className="text-muted-foreground font-flavor text-center py-8">No pending requests</p>
          ) : (
            pendingRequests.map((req: any) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-lg p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  {req.request_type === "trade" && <ArrowLeftRight className="w-4 h-4 text-toxic" />}
                  {req.request_type === "sell" && <DollarSign className="w-4 h-4 text-biohazard" />}
                  {req.request_type === "buy" && <ShoppingCart className="w-4 h-4 text-rare-blue" />}
                  <span className="text-sm font-bold capitalize">{req.request_type}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(req.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm">
                  <span className="text-toxic font-bold">{req.teams?.team_name}</span>
                  {req.cards?.name && <> offers <strong>{req.cards.name}</strong></>}
                  {req.wanted?.name && <> wants <strong>{req.wanted.name}</strong></>}
                  {req.price && <> • <span className="text-biohazard">{req.price} pts</span></>}
                </p>
                {req.cards?.is_mandatory && (
                  <p className="text-xs text-blood mt-1">⚠ Mandatory card — verify before approving</p>
                )}
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => handleApprove(req)} className="flex-1">
                    <Check className="w-4 h-4 mr-1" /> Approve
                  </Button>
                  <div className="flex-1 flex gap-1">
                    <Input
                      placeholder="Reason..."
                      className="text-xs h-8"
                      value={rejectReason[req.id] || ""}
                      onChange={(e) => setRejectReason(prev => ({ ...prev, [req.id]: e.target.value }))}
                    />
                    <Button size="sm" variant="destructive" onClick={() => handleReject(req.id)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </TabsContent>

        <TabsContent value="log" className="space-y-2 mt-4">
          {transactionLog.map((tx: any) => (
            <div key={tx.id} className="bg-card border border-border rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <span className="font-bold">{tx.teams?.team_name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${tx.status === "completed" ? "bg-toxic/20 text-toxic" : "bg-blood/20 text-blood"
                  }`}>{tx.status}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {tx.request_type}: {tx.cards?.name || ""} {tx.wanted?.name ? `→ ${tx.wanted.name}` : ""} {tx.price ? `• ${tx.price}pts` : ""}
              </p>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
