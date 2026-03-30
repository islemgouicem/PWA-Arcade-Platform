import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useAnnouncements() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const dismissedKey = user ? `arcade-dismissed-announcements:${user.id}` : "arcade-dismissed-announcements:guest";

  useEffect(() => {
    const raw = localStorage.getItem(dismissedKey);
    if (!raw) {
      setDismissed(new Set());
      return;
    }
    try {
      const parsed = JSON.parse(raw) as string[];
      setDismissed(new Set(parsed));
    } catch {
      setDismissed(new Set());
    }
  }, [dismissedKey]);

  const fetchAnnouncements = useCallback(async () => {
    const { data } = await supabase
      .from("announcements")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (data) setAnnouncements(data);
  }, []);

  useEffect(() => {
    fetchAnnouncements();
    const channel = supabase
      .channel("announcements-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () => {
        fetchAnnouncements();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAnnouncements]);

  const dismiss = (id: string) => {
    setDismissed(prev => {
      const next = new Set(prev).add(id);
      localStorage.setItem(dismissedKey, JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const activeAnnouncements = announcements.filter(a => !dismissed.has(a.id));

  return { announcements: activeAnnouncements, dismiss };
}
