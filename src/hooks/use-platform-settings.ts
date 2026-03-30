import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function usePlatformSettings() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    const { data } = await supabase.from("platform_settings").select("*");
    if (data) {
      const map: Record<string, any> = {};
      data.forEach((s: any) => { map[s.key] = s.value; });
      setSettings(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSettings();
    const channel = supabase
      .channel("platform-settings-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_settings" }, () => {
        fetchSettings();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const getSetting = (key: string, defaultValue: any = null) => {
    return settings[key] ?? defaultValue;
  };

  return { settings, loading, getSetting, refetch: fetchSettings };
}
