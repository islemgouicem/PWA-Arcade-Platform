import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Compass, Lock, CheckCircle, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";

export default function SideQuestsPage() {
  const { team } = useAuth();
  const queryClient = useQueryClient();
  const [expandedQuest, setExpandedQuest] = useState<string | null>(null);

  const { data: quests = [] } = useQuery({
    queryKey: ["side-quests"],
    queryFn: async () => {
      const { data } = await supabase
        .from("side_quests")
        .select("*, cards(name), quest_teams(*)")
        .eq("is_published", true)
        .order("created_at");
      return data || [];
    },
  });

  const handleUnlock = async (questId: string) => {
    if (!team) return;
    const { error } = await supabase.from("quest_teams").insert({
      quest_id: questId,
      team_id: team.id,
    });
    if (error) {
      toast.error("Failed to join quest");
    } else {
      const { data: adminUsers } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (adminUsers && adminUsers.length > 0) {
        await supabase.from("notifications").insert(
          adminUsers.map((a: any) => ({
            user_id: a.user_id,
            team_id: team.id,
            type: "quest_completed" as any,
            title: "Quest Validation Requested",
            message: `${team.team_name} started a quest and may need validation soon.`,
            metadata: { team_id: team.id, quest_id: questId, kind: "quest-awaiting-validation" },
          })),
        );
      }

      toast.success("Quest activated! Good luck, survivor.");
      queryClient.invalidateQueries({ queryKey: ["side-quests"] });
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-display text-toxic flex items-center gap-2">
        <Compass className="w-8 h-8" /> Side Quests
      </h1>

      {quests.length === 0 ? (
        <p className="text-muted-foreground font-flavor">No quests available yet. Stand by...</p>
      ) : (
        <div className="space-y-3">
          {quests.map((quest: any) => {
            const myStatus = quest.quest_teams?.find((qt: any) => qt.team_id === team?.id);
            const isFull = quest.slots_filled >= quest.max_slots;
            const isLocked = isFull && !myStatus;

            return (
              <motion.div
                key={quest.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-card border border-border rounded-lg overflow-hidden ${isLocked ? "opacity-60" : ""}`}
              >
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => setExpandedQuest(expandedQuest === quest.id ? null : quest.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-display text-lg">{quest.title}</h3>
                      {quest.theme && (
                        <p className="text-xs text-muted-foreground font-flavor">{quest.theme}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="w-3 h-3" />
                      {quest.slots_filled}/{quest.max_slots}
                    </div>
                  </div>

                  {myStatus && (
                    <div className="mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${myStatus.status === "completed" || myStatus.status === "reward_claimed"
                          ? "bg-toxic/20 text-toxic"
                          : "bg-biohazard/20 text-biohazard"
                        }`}>
                        {myStatus.status === "in_progress" && <><Clock className="w-3 h-3 inline mr-1" />In Progress</>}
                        {myStatus.status === "completed" && <><CheckCircle className="w-3 h-3 inline mr-1" />Completed</>}
                        {myStatus.status === "reward_claimed" && <><CheckCircle className="w-3 h-3 inline mr-1" />Reward Claimed</>}
                      </span>
                    </div>
                  )}

                  {isLocked && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="w-3 h-3" /> All slots claimed
                    </div>
                  )}
                </div>

                {expandedQuest === quest.id && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: "auto" }}
                    className="border-t border-border p-4 space-y-3"
                  >
                    <p className="text-sm">{quest.description}</p>

                    <div>
                      <p className="text-xs font-bold text-muted-foreground mb-1">Reward:</p>
                      <p className="text-sm text-biohazard font-flavor">
                        {quest.cards?.name || "🔒 Hidden"}
                      </p>
                    </div>

                    {quest.hints && Array.isArray(quest.hints) && quest.hints.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-muted-foreground mb-1">Hints:</p>
                        <ul className="space-y-1">
                          {quest.hints.map((hint: string, i: number) => (
                            <li key={i} className="text-sm text-foreground/80 font-flavor">• {hint}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {!myStatus && !isLocked && (
                      <Button onClick={() => handleUnlock(quest.id)} className="w-full">
                        Pursue This Quest
                      </Button>
                    )}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
