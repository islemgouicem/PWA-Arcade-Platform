/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import missionsAPI, { type StaticMission } from "@/integrations/supabase/missions";
import { useAuth } from "@/contexts/useAuth";

const WRONG_PASSWORD_MESSAGES = [
    "Wrong password, try again.",
    "Nope, that password is not correct.",
    "Incorrect password. Double-check and retry.",
    "That code did not match. Try once more.",
];

interface MissionZone {
    id: string;
    mission_id: string;
    mission_number: number;
    sequence_in_mission: number;
    name: string;
    infection_rate: number;
}

export function MissionBrowser() {
    const { user } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [joiningMissionNumber, setJoiningMissionNumber] = useState<number | null>(null);
    const [passwordByMission, setPasswordByMission] = useState<Record<number, string>>({});
    const [passwordErrorByMission, setPasswordErrorByMission] = useState<Record<number, string>>({});
    const [mission6File, setMission6File] = useState<File | null>(null);

    const { data: teamId } = useQuery({
        queryKey: ["team-id", user?.id],
        queryFn: async () => {
            const { data, error } = await missionsAPI.supabase
                .from("teams")
                .select("id")
                .eq("user_id", user?.id)
                .single();
            if (error) throw error;
            return data?.id as string;
        },
        enabled: !!user?.id,
    });

    const { data: missionsData, isLoading } = useQuery({
        queryKey: ["static-missions-for-team"],
        queryFn: async () => {
            const result = await missionsAPI.getStaticMissionsForTeam();
            if (!result.success) throw new Error(result.error);
            return result.missions || [];
        },
    });

    const missionIdsByNumber = useMemo(() => {
        return (missionsData || []).reduce<Record<number, string>>((acc, mission) => {
            acc[mission.mission_number] = mission.mission_id;
            return acc;
        }, {});
    }, [missionsData]);

    const { data: zoneEntries } = useQuery({
        queryKey: ["zone-entries", teamId],
        queryFn: async () => {
            if (!teamId) return [];
            const result = await missionsAPI.getZoneEntriesForTeam(teamId);
            if (!result.success) return [];
            return result.entries || [];
        },
        enabled: !!teamId,
        refetchInterval: 3000,
    });

    const { data: missionZones } = useQuery({
        queryKey: ["static-mission-zones"],
        enabled: !!missionIdsByNumber[1] || !!missionIdsByNumber[2],
        queryFn: async () => {
            const { data, error } = await (missionsAPI.supabase as any)
                .from("mission_zones")
                .select("id, mission_id, name, infection_rate, sequence_in_mission")
                .in("mission_id", [missionIdsByNumber[1], missionIdsByNumber[2]].filter(Boolean))
                .order("sequence_in_mission", { ascending: true });

            if (error) throw error;

            return ((data || []) as any[]).map((row) => ({
                id: row.id,
                mission_id: row.mission_id,
                mission_number: Number(
                    Object.entries(missionIdsByNumber).find(([, missionId]) => missionId === row.mission_id)?.[0] || 0
                ),
                sequence_in_mission: row.sequence_in_mission,
                name: row.name,
                infection_rate: row.infection_rate,
            })) as MissionZone[];
        },
    });

    const visibleMissions = useMemo(() => {
        return (missionsData || [])
            .filter((mission) => mission.unlocked || mission.status !== "not_joined")
            .sort((a, b) => a.mission_number - b.mission_number);
    }, [missionsData]);

    const activeMission = useMemo(() => {
        return (missionsData || []).find(
            (mission) => mission.status !== "completed" && mission.status !== "not_joined"
        );
    }, [missionsData]);

    const joinMissionMutation = useMutation({
        mutationFn: async (missionNumber: number) => {
            setJoiningMissionNumber(missionNumber);
            const result = await missionsAPI.joinStaticMission(missionNumber);
            if (!result.success) throw new Error(result.error);
            return result;
        },
        onSuccess: (_, missionNumber) => {
            toast({ title: `Joined Mission ${missionNumber}` });
            queryClient.invalidateQueries({ queryKey: ["static-missions-for-team"] });
            queryClient.invalidateQueries({ queryKey: ["zone-entries", teamId] });
        },
        onError: (err, missionNumber) => {
            console.error("[MissionBrowser] join static mission failed", {
                missionNumber,
                error: err,
            });
            toast({
                title: "Could not join mission",
                description: String(err),
                variant: "destructive",
            });
        },
        onSettled: () => {
            setJoiningMissionNumber(null);
        },
    });

    const completeMissionMutation = useMutation({
        mutationFn: async (missionNumber: number) => {
            const password = passwordByMission[missionNumber] || "";
            if (!password.trim()) throw new Error("Password is required");
            const result = await missionsAPI.completeStaticMission(missionNumber, password.trim());
            if (!result.success) throw new Error(result.error);
            return result;
        },
        onSuccess: (result, missionNumber) => {
            setPasswordByMission((prev) => ({ ...prev, [missionNumber]: "" }));
            setPasswordErrorByMission((prev) => ({ ...prev, [missionNumber]: "" }));
            const resourceValue = result?.data?.resource_value;
            if (resourceValue) {
                toast({
                    title: `Mission ${missionNumber} completed`,
                    description: "Resource unlocked for your team.",
                });
            } else {
                toast({ title: `Mission ${missionNumber} completed` });
            }
            queryClient.invalidateQueries({ queryKey: ["static-missions-for-team"] });
        },
        onError: (err, missionNumber) => {
            const text = String(err);
            const isWrongPassword = text.includes("INVALID_PASSWORD");
            const message = isWrongPassword
                ? WRONG_PASSWORD_MESSAGES[Math.floor(Math.random() * WRONG_PASSWORD_MESSAGES.length)]
                : text;

            console.error("[MissionBrowser] complete static mission failed", {
                error: err,
                missionNumber,
            });

            if (isWrongPassword) {
                setPasswordErrorByMission((prev) => ({ ...prev, [missionNumber]: message }));
                return;
            }

            setPasswordErrorByMission((prev) => ({ ...prev, [missionNumber]: message }));
        },
    });

    const requestZoneEntryMutation = useMutation({
        mutationFn: async (zoneId: string) => {
            const result = await missionsAPI.requestZoneEntry(zoneId, "");
            if (!result.success) throw new Error(result.error);
            return result;
        },
        onSuccess: () => {
            toast({ title: "Zone entry requested" });
            queryClient.invalidateQueries({ queryKey: ["zone-entries", teamId] });
        },
        onError: (err) => {
            console.error("[MissionBrowser] request zone entry failed", { error: err });
            toast({
                title: "Could not request zone entry",
                description: String(err),
                variant: "destructive",
            });
        },
    });

    const requestZoneExitMutation = useMutation({
        mutationFn: async (zoneEntryId: string) => {
            const result = await missionsAPI.requestZoneExit(zoneEntryId);
            if (!result.success) throw new Error(result.error);
            return result;
        },
        onSuccess: () => {
            toast({ title: "Zone exit requested" });
            queryClient.invalidateQueries({ queryKey: ["zone-entries", teamId] });
        },
        onError: (err) => {
            console.error("[MissionBrowser] request zone exit failed", { error: err });
            toast({
                title: "Could not request zone exit",
                description: String(err),
                variant: "destructive",
            });
        },
    });

    const finalSubmissionMutation = useMutation({
        mutationFn: async (mission: StaticMission) => {
            if (!teamId) throw new Error("Team not found");
            if (!mission6File) throw new Error("Select a file first");

            const safeFileName = mission6File.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const submissionPath = `${teamId}/${mission.mission_id}/${Date.now()}-${safeFileName}`;

            const { error: uploadError } = await missionsAPI.supabase.storage
                .from("mission-submissions")
                .upload(submissionPath, mission6File, { upsert: true });

            if (uploadError) throw uploadError;

            const result = await missionsAPI.submitFinalMission(
                mission.mission_id,
                submissionPath,
                mission6File.name,
                { mission_number: 6 }
            );

            if (!result.success) throw new Error(result.error);
            return result;
        },
        onSuccess: () => {
            toast({ title: "Mission 6 submitted" });
            setMission6File(null);
            queryClient.invalidateQueries({ queryKey: ["static-missions-for-team"] });
        },
        onError: (err) => {
            console.error("[MissionBrowser] mission 6 submit failed", { error: err });
            toast({
                title: "Final submission failed",
                description: String(err),
                variant: "destructive",
            });
        },
    });

    const getZonesForMission = (missionNumber: number) => {
        return (missionZones || []).filter((zone) => zone.mission_number === missionNumber);
    };

    const getMissionZoneState = (missionNumber: number) => {
        const zones = getZonesForMission(missionNumber);
        const entry = (zoneEntries || []).find((zoneEntry: any) =>
            zones.some((zone) => zone.id === zoneEntry.zone_id)
        );
        return entry;
    };

    if (isLoading) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <p className="text-muted-foreground">Loading static missions...</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold">Missions 1-6</h2>
                <p className="text-muted-foreground mt-1">
                    Static mission flow with strict progression. Missions 4 and 5 unlock together after Mission 3.
                </p>
            </div>

            {!visibleMissions.length ? (
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-muted-foreground">No unlocked mission right now.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {visibleMissions.map((mission) => {
                        const missionNumber = mission.mission_number;
                        const isCompleted = mission.status === "completed";
                        const isJoined = mission.is_joined;
                        const canJoin = mission.can_join && (!activeMission || activeMission.mission_number === missionNumber);
                        const zones = missionNumber <= 2 ? getZonesForMission(missionNumber) : [];
                        const zoneState = missionNumber <= 2 ? getMissionZoneState(missionNumber) : null;
                        const showZoneControls = isJoined && missionNumber <= 2;
                        const hasActiveZone = !!zoneState && zoneState.status !== "exited";
                        const showEnterButtons = showZoneControls && zones.length > 0 && !hasActiveZone;

                        return (
                            <Card key={mission.mission_number}>
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <CardTitle className="flex items-center gap-2 flex-wrap">
                                                Mission {missionNumber}
                                                {isCompleted && <Badge>Completed</Badge>}
                                                {isJoined && !isCompleted && (
                                                    <Badge variant="secondary">In Progress</Badge>
                                                )}
                                                {!isJoined && !isCompleted && (
                                                    <Badge variant="outline">Unlocked</Badge>
                                                )}
                                            </CardTitle>
                                            <CardDescription className="mt-1">
                                                {mission.name}
                                            </CardDescription>
                                        </div>
                                        {!isJoined && !isCompleted && (
                                            <Button
                                                onClick={() => joinMissionMutation.mutate(missionNumber)}
                                                disabled={
                                                    !canJoin ||
                                                    joinMissionMutation.isPending ||
                                                    (joiningMissionNumber !== null &&
                                                        joiningMissionNumber !== missionNumber)
                                                }
                                            >
                                                {joiningMissionNumber === missionNumber ? "Joining..." : "Join"}
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>

                                <CardContent className="space-y-4">
                                    {mission.description && (
                                        <p className="text-sm text-muted-foreground">{mission.description}</p>
                                    )}

                                    {!mission.enabled && (
                                        <Alert>
                                            <AlertDescription>
                                                This mission is unlocked but disabled by admin.
                                            </AlertDescription>
                                        </Alert>
                                    )}

                                    {showZoneControls && (
                                        <div className="border-t pt-4 space-y-3">
                                            <p className="font-medium">Zones</p>

                                            {zones.length === 0 && (
                                                <p className="text-sm text-muted-foreground">
                                                    No zones configured yet for this mission.
                                                </p>
                                            )}

                                            {showEnterButtons && (
                                                <div className="grid gap-2 md:grid-cols-3">
                                                    {zones.map((zone) => (
                                                        <Button
                                                            key={zone.id}
                                                            onClick={() => requestZoneEntryMutation.mutate(zone.id)}
                                                            disabled={requestZoneEntryMutation.isPending}
                                                        >
                                                            Enter {zone.name}
                                                        </Button>
                                                    ))}
                                                </div>
                                            )}

                                            {hasActiveZone && (
                                                <div className="space-y-2">
                                                    <Button
                                                        variant="outline"
                                                        onClick={() => requestZoneExitMutation.mutate(zoneState.id)}
                                                        disabled={requestZoneExitMutation.isPending || zoneState.status !== "inside"}
                                                    >
                                                        Leave Zone
                                                    </Button>

                                                    {zoneState.status === "pending" && (
                                                        <Alert>
                                                            <AlertDescription>
                                                                Entry requested. Waiting for zone handler validation.
                                                            </AlertDescription>
                                                        </Alert>
                                                    )}

                                                    {zoneState.status === "exit_requested" && (
                                                        <Alert>
                                                            <AlertDescription>
                                                                Exit requested. Waiting for zone handler validation.
                                                            </AlertDescription>
                                                        </Alert>
                                                    )}
                                                </div>
                                            )}

                                        </div>
                                    )}

                                    {isJoined && missionNumber >= 1 && missionNumber <= 5 && (
                                        <div className="border-t pt-4 space-y-3">
                                            <Label htmlFor={`password-${missionNumber}`}>
                                                Mission {missionNumber} completion password
                                            </Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    id={`password-${missionNumber}`}
                                                    type="password"
                                                    value={passwordByMission[missionNumber] || ""}
                                                    onChange={(event) =>
                                                        {
                                                            setPasswordByMission((prev) => ({
                                                                ...prev,
                                                                [missionNumber]: event.target.value,
                                                            }));
                                                            setPasswordErrorByMission((prev) => ({
                                                                ...prev,
                                                                [missionNumber]: "",
                                                            }));
                                                        }
                                                    }
                                                />
                                                <Button
                                                    onClick={() => completeMissionMutation.mutate(missionNumber)}
                                                    disabled={completeMissionMutation.isPending}
                                                >
                                                    Complete
                                                </Button>
                                            </div>
                                            {!!passwordErrorByMission[missionNumber] && (
                                                <p className="text-sm text-destructive">
                                                    {passwordErrorByMission[missionNumber]}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {isJoined && missionNumber === 6 && (
                                        <div className="border-t pt-4 space-y-3">
                                            <p className="font-medium">Final Submission</p>
                                            <p className="text-sm text-muted-foreground">
                                                Submit your final document using the required format from the mission instructions.
                                            </p>
                                            <div className="space-y-2">
                                                <Label htmlFor="mission6-file">Upload file</Label>
                                                <Input
                                                    id="mission6-file"
                                                    type="file"
                                                    onChange={(event) => {
                                                        const file = event.target.files?.[0] || null;
                                                        setMission6File(file);
                                                    }}
                                                />
                                            </div>
                                            <Button
                                                onClick={() => finalSubmissionMutation.mutate(mission)}
                                                disabled={finalSubmissionMutation.isPending || !mission6File}
                                            >
                                                {finalSubmissionMutation.isPending ? "Submitting..." : "Submit Mission 6"}
                                            </Button>
                                        </div>
                                    )}

                                    {missionNumber >= 4 && missionNumber <= 5 && mission.resource_value && (
                                        <div className="border-t pt-4 space-y-2">
                                            <p className="font-medium">Unlocked Resource</p>
                                            {mission.resource_type === "link" ? (
                                                <a
                                                    href={mission.resource_value}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-sm underline text-toxic"
                                                >
                                                    {mission.resource_value}
                                                </a>
                                            ) : (
                                                <p className="text-sm text-muted-foreground">{mission.resource_value}</p>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default MissionBrowser;
