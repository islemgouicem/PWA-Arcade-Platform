/* eslint-disable @typescript-eslint/no-explicit-any */
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

  const normalizeValue = (value: any, defaultValue: any) => {
    if (value === null || value === undefined) return defaultValue;

    if (typeof defaultValue === "boolean") {
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value !== 0;
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "1", "yes", "on"].includes(normalized)) return true;
        if (["false", "0", "no", "off"].includes(normalized)) return false;
      }
      return Boolean(value);
    }

    if (typeof defaultValue === "number") {
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? defaultValue : parsed;
      }
    }

    if (typeof defaultValue === "string") {
      return String(value);
    }

    return value;
  };

  const getSetting = (key: string, defaultValue: any = null) => {
    return normalizeValue(settings[key], defaultValue);
  };

  return { settings, loading, getSetting, refetch: fetchSettings };
}
