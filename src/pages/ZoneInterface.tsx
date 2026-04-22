/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import missionsAPI from "@/integrations/supabase/missions";
import { useAuth } from "@/contexts/useAuth";
const WRONG_PASSWORD_MESSAGES = [
    "Wrong password, try again.",
    "Nope, that password is not correct.",
    "Incorrect password. Double-check and retry.",
    "That code did not match. Try once more.",
];

// ============================================
// PARTICIPANT ZONE ENTRY INTERFACE
// ============================================

interface ZoneEntry {
    id: string;
    zone_id: string;
    status: "pending" | "inside" | "exit_requested" | "exited";
    entry_requested_at: string;
    mission_zones?: {
        name: string;
        zone_type: string;
        infection_rate: number;
    };
}

export function ParticipantZoneInterface() {
    const { toast } = useToast();
    const { user } = useAuth();
    const queryClient = useQueryClient();

    // Get team
    const { data: teamId } = useQuery({
        queryKey: ["team-id"],
        queryFn: async () => {
            const { data } = await missionsAPI.supabase
                .from("teams")
                .select("id")
                .eq("user_id", user?.id)
                .single();
            return data?.id;
        },
        enabled: !!user?.id,
    });

    // Get current zone entries
    const { data: zoneEntries, isLoading } = useQuery({
        queryKey: ["zone-entries", teamId],
        queryFn: async () => {
            if (!teamId) return [];
            const result = await missionsAPI.getZoneEntriesForTeam(teamId);
            if (!result.success) return [];
            return result.entries || [];
        },
        enabled: !!teamId,
        refetchInterval: 5000, // Refresh every 5 seconds
    });

    useEffect(() => {
        if (!teamId) return;

        const channel = missionsAPI.supabase
            .channel(`participant-zone-entries-${teamId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "zone_entries",
                    filter: `team_id=eq.${teamId}`,
                },
                () => {
                    queryClient.invalidateQueries({ queryKey: ["zone-entries", teamId] });
                }
            )
            .subscribe();

        return () => {
            missionsAPI.supabase.removeChannel(channel);
        };
    }, [teamId, queryClient]);

    // Get available zones for mission (dummy - replace with actual mission context)
    const { data: missions } = useQuery({
        queryKey: ["available-missions"],
        queryFn: async () => {
            const result = await missionsAPI.getAvailableMissions();
            if (!result.success) return [];
            return result.missions || [];
        },
    });

    // Request zone entry
    const requestZoneEntryMutation = useMutation({
        mutationFn: async (zoneId: string) => {
            const result = await missionsAPI.requestZoneEntry(zoneId, "");
            if (!result.success) throw new Error(result.error);
            return result;
        },
        onSuccess: () => {
            toast({ title: "Zone entry requested", description: "Waiting for handler confirmation" });
            queryClient.invalidateQueries({ queryKey: ["zone-entries", teamId] });
        },
        onError: (err) => {
            toast({
                title: "Could not request zone entry",
                description: String(err),
                variant: "destructive",
            });
        },
    });

    // Request zone exit
    const requestZoneExitMutation = useMutation({
        mutationFn: async (zoneEntryId: string) => {
            const result = await missionsAPI.requestZoneExit(zoneEntryId);
            if (!result.success) throw new Error(result.error);
            return result;
        },
        onSuccess: () => {
            toast({ title: "Exit requested", description: "Waiting for handler confirmation" });
            queryClient.invalidateQueries({ queryKey: ["zone-entries", teamId] });
        },
        onError: (err) => {
            toast({
                title: "Could not request exit",
                description: String(err),
                variant: "destructive",
            });
        },
    });

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "pending":
                return <Badge variant="secondary">Pending Approval</Badge>;
            case "inside":
                return <Badge variant="default">Inside Zone</Badge>;
            case "exit_requested":
                return <Badge variant="outline">Exit Requested</Badge>;
            case "exited":
                return <Badge>Exited</Badge>;
            default:
                return null;
        }
    };

    const allZones = missions.flatMap((m: any) => m.mission_zones || []);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold">Zone Navigation</h2>
                <p className="text-muted-foreground mt-1">
                    Request entry to zones, manage your time, and request exit
                </p>
            </div>

            {/* Current Status */}
            {isLoading ? (
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-muted-foreground">Loading...</p>
                    </CardContent>
                </Card>
            ) : zoneEntries?.length ? (
                <div className="space-y-4">
                    {zoneEntries.map((entry: ZoneEntry) => (
                        <Card key={entry.id}>
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="flex items-center gap-2">
                                            {entry.mission_zones?.name || "Unknown Zone"}
                                            {getStatusBadge(entry.status)}
                                        </CardTitle>
                                        <CardDescription className="mt-1">
                                            Type: {entry.mission_zones?.zone_type || "N/A"} • Infection Risk:{" "}
                                            {entry.mission_zones?.infection_rate || 0}%/min
                                        </CardDescription>
                                    </div>
                                    {entry.status === "inside" && (
                                        <Button
                                            variant="outline"
                                            onClick={() =>
                                                requestZoneExitMutation.mutate(entry.id)
                                            }
                                            disabled={requestZoneExitMutation.isPending}
                                        >
                                            Request Exit
                                        </Button>
                                    )}
                                    {entry.status === "pending" && (
                                        <div className="text-xs text-muted-foreground italic">
                                            Awaiting handler approval...
                                        </div>
                                    )}
                                </div>
                            </CardHeader>
                        </Card>
                    ))}
                </div>
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-muted-foreground">
                            No active zone entries. Join a mission to enter zones.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Available Zones */}
            {allZones.length > 0 && (
                <>
                    <div className="border-t pt-6">
                        <h3 className="text-lg font-semibold mb-4">Available Zones</h3>
                        <div className="grid gap-3">
                            {allZones.map((zone: any) => {
                                const alreadyIn = zoneEntries?.some(
                                    (z: any) => z.zone_id === zone.id
                                );

                                return (
                                    <Card key={zone.id} className={alreadyIn ? "opacity-50" : ""}>
                                        <CardContent className="pt-6">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h4 className="font-semibold">{zone.name}</h4>
                                                    <p className="text-sm text-muted-foreground">
                                                        Type: {zone.zone_type}
                                                    </p>
                                                </div>
                                                <Button
                                                    onClick={() => {
                                                        requestZoneEntryMutation.mutate(zone.id);
                                                    }}
                                                    disabled={alreadyIn}
                                                >
                                                    {alreadyIn ? "Already Entered" : "Request Entry"}
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

        </div>
    );
}

// ============================================
// ZONE HANDLER INTERFACE
// ============================================

export function ZoneHandlerInterface() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
    const [selectedZoneName, setSelectedZoneName] = useState<string>("");
    const [unlockPassword, setUnlockPassword] = useState("");
    const [unlockError, setUnlockError] = useState("");

    useEffect(() => {
        const persistedZoneId = window.localStorage.getItem("zone-handler-selected-zone-id");
        const persistedZoneName = window.localStorage.getItem("zone-handler-selected-zone-name");

        if (persistedZoneId) {
            setSelectedZoneId(persistedZoneId);
            setSelectedZoneName(persistedZoneName || "");
        }
    }, []);

    useEffect(() => {
        if (!selectedZoneId) {
            window.localStorage.removeItem("zone-handler-selected-zone-id");
            window.localStorage.removeItem("zone-handler-selected-zone-name");
            return;
        }

        window.localStorage.setItem("zone-handler-selected-zone-id", selectedZoneId);
        window.localStorage.setItem("zone-handler-selected-zone-name", selectedZoneName || "");
    }, [selectedZoneId, selectedZoneName]);

    // Get entries for selected zone
    const { data: zoneEntries, isLoading: entriesLoading } = useQuery({
        queryKey: ["zone-entries-handler", selectedZoneId],
        queryFn: async () => {
            if (!selectedZoneId) return [];
            const result = await missionsAPI.getZoneHandlerView(selectedZoneId);
            if (!result.success) throw new Error(result.error || "Failed to load zone entries");
            return result.entries || [];
        },
        enabled: !!selectedZoneId,
        refetchInterval: 3000,
    });

    useEffect(() => {
        if (!selectedZoneId) return;

        const channel = missionsAPI.supabase
            .channel(`handler-zone-entries-${selectedZoneId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "zone_entries",
                    filter: `zone_id=eq.${selectedZoneId}`,
                },
                () => {
                    queryClient.invalidateQueries({ queryKey: ["zone-entries-handler", selectedZoneId] });
                }
            )
            .subscribe();

        return () => {
            missionsAPI.supabase.removeChannel(channel);
        };
    }, [selectedZoneId, queryClient]);

    const unlockZoneMutation = useMutation({
        mutationFn: async () => {
            if (!unlockPassword.trim()) throw new Error("Password is required");
            const result = await missionsAPI.identifyZoneHandlerAccess(unlockPassword.trim());
            if (!result.success) throw new Error(result.error);
            return result;
        },
        onSuccess: (result) => {
            const zoneId = result.data?.zone_id as string;
            const zoneName = result.data?.zone_name as string | undefined;

            setSelectedZoneId(zoneId);
            setSelectedZoneName(zoneName || "");
            setUnlockPassword("");
            setUnlockError("");
            toast({ title: "Zone unlocked", description: zoneName || undefined });
        },
        onError: (err) => {
            const message = String(err);
            if (message.includes("Invalid zone password")) {
                setUnlockError(
                    WRONG_PASSWORD_MESSAGES[Math.floor(Math.random() * WRONG_PASSWORD_MESSAGES.length)]
                );
                return;
            }
            setUnlockError(message);
        },
    });

    // Approve entry
    const approveEntryMutation = useMutation({
        mutationFn: async (entryId: string) => {
            const result = await missionsAPI.approveZoneEntry(entryId);
            if (!result.success) throw new Error(result.error);
            return result;
        },
        onSuccess: () => {
            toast({ title: "Team entry approved" });
            queryClient.invalidateQueries({
                queryKey: ["zone-entries-handler", selectedZoneId],
            });
        },
        onError: (err) => {
            toast({
                title: "Error approving entry",
                description: String(err),
                variant: "destructive",
            });
        },
    });

    // Deny entry
    const denyEntryMutation = useMutation({
        mutationFn: async (entryId: string) => {
            const result = await missionsAPI.denyZoneEntry(entryId);
            if (!result.success) throw new Error(result.error);
            return result;
        },
        onSuccess: () => {
            toast({ title: "Team entry denied" });
            queryClient.invalidateQueries({
                queryKey: ["zone-entries-handler", selectedZoneId],
            });
        },
        onError: (err) => {
            toast({
                title: "Error denying entry",
                description: String(err),
                variant: "destructive",
            });
        },
    });

    // Approve exit
    const approveExitMutation = useMutation({
        mutationFn: async (entryId: string) => {
            const result = await missionsAPI.approveZoneExit(entryId);
            if (!result.success) throw new Error(result.error);
            return result;
        },
        onSuccess: () => {
            toast({ title: "Team exit approved" });
            queryClient.invalidateQueries({
                queryKey: ["zone-entries-handler", selectedZoneId],
            });
        },
        onError: (err) => {
            toast({
                title: "Error approving exit",
                description: String(err),
                variant: "destructive",
            });
        },
    });

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold">Zone Handler Control</h2>
                <p className="text-muted-foreground mt-1">
                    Enter your zone password to identify and manage a single zone queue.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Unlock Zone By Password</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex gap-2">
                        <Input
                            type="password"
                            value={unlockPassword}
                            onChange={(event) => {
                                setUnlockPassword(event.target.value);
                                setUnlockError("");
                            }}
                            placeholder="Zone password"
                        />
                        <Button
                            onClick={() => unlockZoneMutation.mutate()}
                            disabled={unlockZoneMutation.isPending || !unlockPassword.trim()}
                        >
                            {unlockZoneMutation.isPending ? "Identifying..." : "Identify Zone"}
                        </Button>
                    </div>

                    {!!unlockError && <p className="text-sm text-destructive">{unlockError}</p>}

                    {selectedZoneId && (
                        <p className="text-sm text-muted-foreground">
                            Active zone: {selectedZoneName || selectedZoneId}
                        </p>
                    )}
                </CardContent>
            </Card>

            {selectedZoneId && (
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Team Requests</h3>

                    {entriesLoading ? (
                        <Card>
                            <CardContent className="pt-6">
                                <p className="text-muted-foreground">Loading entries...</p>
                            </CardContent>
                        </Card>
                    ) : !zoneEntries?.length ? (
                        <Card>
                            <CardContent className="pt-6">
                                <p className="text-muted-foreground">No pending requests</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {zoneEntries.map((entry: any) => (
                                <Card key={entry.id}>
                                    <CardContent className="pt-6">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h4 className="font-semibold">
                                                    {entry.teams?.team_name || "Unknown Team"}
                                                </h4>
                                                <p className="text-sm text-muted-foreground">
                                                    Status:{" "}
                                                    <Badge variant="outline" className="ml-1">
                                                        {entry.status}
                                                    </Badge>
                                                </p>
                                            </div>
                                            <div className="flex gap-2">
                                                {entry.status === "pending" && (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            onClick={() =>
                                                                approveEntryMutation.mutate(entry.id)
                                                            }
                                                            disabled={approveEntryMutation.isPending}
                                                        >
                                                            Approve
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="destructive"
                                                            onClick={() => denyEntryMutation.mutate(entry.id)}
                                                            disabled={denyEntryMutation.isPending}
                                                        >
                                                            Deny
                                                        </Button>
                                                    </>
                                                )}
                                                {entry.status === "exit_requested" && (
                                                    <Button
                                                        size="sm"
                                                        onClick={() =>
                                                            approveExitMutation.mutate(entry.id)
                                                        }
                                                        disabled={approveExitMutation.isPending}
                                                    >
                                                        Approve Exit
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default ParticipantZoneInterface;
