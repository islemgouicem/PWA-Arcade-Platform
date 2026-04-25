/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Settings2, ShieldAlert, Unlock } from "lucide-react";

interface PasswordLockoutRow {
    team_id: string;
    team_name: string;
    mission_id: string;
    mission_number: number;
    failed_attempts: number;
    last_attempt: string;
    remaining_seconds: number;
}

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

    const passwordSettings = useMemo(
        () => [
            { key: "password_max_attempts",    label: "Password: Max Wrong Attempts",     value: getSetting("password_max_attempts", 5) },
            { key: "password_window_minutes",  label: "Password: Detection Window (min)", value: getSetting("password_window_minutes", 5) },
            { key: "password_lockout_minutes", label: "Password: Lockout Duration (min)", value: getSetting("password_lockout_minutes", 5) },
        ],
        [settings],
    );

    const updateSetting = async (key: string, value: number) => {
        if (!Number.isFinite(value) || value <= 0) {
            toast.error("Value must be a positive number");
            return;
        }
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

    const { data: lockouts = [], isFetching: lockoutsLoading } = useQuery<PasswordLockoutRow[]>({
        queryKey: ["admin-password-lockouts"],
        queryFn: async () => {
            const { data, error } = await (supabase as any).rpc("admin_list_password_lockouts");
            if (error) throw error;
            return (data || []) as PasswordLockoutRow[];
        },
        refetchInterval: 15000,
    });

    const clearLockout = async (teamId: string, missionId: string) => {
        const { error } = await (supabase as any).rpc("admin_clear_mission_password_lockout", {
            p_team_id: teamId,
            p_mission_id: missionId,
        });
        if (error) {
            toast.error(error.message || "Failed to clear lockout");
            return;
        }
        toast.success("Team unlocked");
        queryClient.invalidateQueries({ queryKey: ["admin-password-lockouts"] });
    };

    const formatSeconds = (s: number) => {
        if (s <= 0) return "0s";
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60);
        const r = s % 60;
        return r === 0 ? `${m}m` : `${m}m ${r}s`;
    };

    const renderSettingsRow = (s: { key: string; label: string; value: number }) => (
        <div key={s.key} className="grid grid-cols-[1fr_180px_auto] gap-2 items-end">
            <Label>{s.label}</Label>
            <Input defaultValue={String(s.value)} type="number" min={1} id={`cfg-${s.key}`} />
            <Button onClick={() => {
                const input = document.getElementById(`cfg-${s.key}`) as HTMLInputElement | null;
                updateSetting(s.key, Number(input?.value || s.value));
            }}>Save</Button>
        </div>
    );

    return (
        <div className="space-y-4">
            <h1 className="text-3xl font-display text-toxic flex items-center gap-2">
                <Settings2 className="w-8 h-8" /> Admin Operations Config
            </h1>

            <Card>
                <CardHeader><CardTitle>Core Config</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    {numericSettings.map(renderSettingsRow)}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5" />
                        Mission Password Brute-Force Protection
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        If a team enters the wrong password for the same mission more than the configured number
                        of times within the detection window, they are temporarily locked out of submitting
                        that mission. Lockouts are per (team, mission). You will receive a notification when a
                        team is locked out and can unlock them below.
                    </p>
                    {passwordSettings.map(renderSettingsRow)}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span>Currently Locked Teams</span>
                        <span className="text-xs text-muted-foreground">
                            {lockoutsLoading ? "Refreshing…" : `${lockouts.length} active`}
                        </span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {lockouts.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No teams are currently locked out.</p>
                    ) : (
                        <div className="space-y-2">
                            {lockouts.map((row) => (
                                <div
                                    key={`${row.team_id}-${row.mission_id}`}
                                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                                >
                                    <div className="flex flex-col">
                                        <span className="font-medium">
                                            {row.team_name}
                                            <span className="text-muted-foreground"> · Mission {row.mission_number}</span>
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {row.failed_attempts} wrong attempts · unlocks in {formatSeconds(row.remaining_seconds)}
                                        </span>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => clearLockout(row.team_id, row.mission_id)}
                                    >
                                        <Unlock className="w-4 h-4 mr-1" /> Unlock
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
