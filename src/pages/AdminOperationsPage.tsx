/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";

export default function AdminOperationsPage() {
    const queryClient = useQueryClient();

    const { data: settings = [] } = useQuery({
        queryKey: ["admin-ops-settings"],
        queryFn: async () => {
            const { data, error } = await (supabase as any).from("platform_settings").select("key, value");
            if (error) throw error;
            return data || [];
        },
    });

    const getSetting = (key: string, fallback: number) => {
        const val = settings.find((s: any) => s.key === key)?.value;
        const n = Number(typeof val === "string" ? val.replace(/\"/g, "") : val);
        return Number.isFinite(n) ? n : fallback;
    };

    const numericSettings = useMemo(
        () => [
            { key: "health_zero_penalty_points", label: "Penalty Points (HS=0)", value: getSetting("health_zero_penalty_points", 50) },
            { key: "health_restore_percentage", label: "Health Restore (HS=0) %", value: getSetting("health_restore_percentage", 30) },
        ],
        [settings],
    );

    const updateSetting = async (key: string, value: number) => {
        const { error } = await (supabase as any)
            .from("platform_settings")
            .upsert({ key, value }, { onConflict: "key" });
        if (error) {
            toast.error(error.message || "Failed to update setting");
            return;
        }
        queryClient.invalidateQueries({ queryKey: ["admin-ops-settings"] });
        toast.success("Setting updated");
    };

    return (
        <div className="space-y-4">
            <h1 className="text-3xl font-display text-toxic flex items-center gap-2">
                <Settings2 className="w-8 h-8" /> Admin Operations Config
            </h1>

            <Card>
                <CardHeader><CardTitle>Core Config</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    {numericSettings.map((s) => (
                        <div key={s.key} className="grid grid-cols-[1fr_180px_auto] gap-2 items-end">
                            <Label>{s.label}</Label>
                            <Input defaultValue={String(s.value)} type="number" id={`cfg-${s.key}`} />
                            <Button onClick={() => {
                                const input = document.getElementById(`cfg-${s.key}`) as HTMLInputElement | null;
                                updateSetting(s.key, Number(input?.value || s.value));
                            }}>Save</Button>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}
