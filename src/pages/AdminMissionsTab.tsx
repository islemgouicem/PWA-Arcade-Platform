/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTrigger,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import missionsAPI from "@/integrations/supabase/missions";

interface Mission {
    id: string;
    name: string;
    description: string;
    sequence_number: number;
    mission_type: string;
    visible: boolean;
    enabled: boolean;
}

export function AdminMissionsTab() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isZoneManagerOpen, setIsZoneManagerOpen] = useState<string | null>(null);
    const [mission1TeamId, setMission1TeamId] = useState("");
    const [mission1Password, setMission1Password] = useState("");
    const [mission2TeamId, setMission2TeamId] = useState("");
    const [mission2Password, setMission2Password] = useState("");
    const [mission3Password, setMission3Password] = useState("");
    const [mission4Password, setMission4Password] = useState("");
    const [mission5Password, setMission5Password] = useState("");
    const [mission4ResourceType, setMission4ResourceType] = useState<"text" | "link">("text");
    const [mission4ResourceValue, setMission4ResourceValue] = useState("");
    const [mission5ResourceType, setMission5ResourceType] = useState<"text" | "link">("text");
    const [mission5ResourceValue, setMission5ResourceValue] = useState("");

    // Fetch missions
    const { data: missions, isLoading } = useQuery({
        queryKey: ["missions"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("missions")
                .select("*")
                .order("sequence_number", { ascending: true });

            if (error) throw error;
            return (data || []) as Mission[];
        },
    });

    const { data: teams } = useQuery({
        queryKey: ["teams-for-mission-passwords"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("teams")
                .select("id, team_name")
                .order("team_name", { ascending: true });
            if (error) throw error;
            return data || [];
        },
    });

    const { data: staticResources } = useQuery({
        queryKey: ["mission-static-resources"],
        queryFn: async () => {
            const result = await missionsAPI.getStaticMissionResourcesAdmin();
            if (!result.success) throw new Error(result.error);
            return result.resources || [];
        },
    });

    const missionByNumber = (missions || []).reduce<Record<number, Mission>>((acc, mission) => {
        acc[mission.sequence_number] = mission;
        return acc;
    }, {});

    const teamPasswordMutation = useMutation({
        mutationFn: async (payload: { missionNumber: 1 | 2; teamId: string; password: string }) => {
            const mission = missionByNumber[payload.missionNumber];
            if (!mission?.id) throw new Error(`Mission ${payload.missionNumber} is not configured`);
            if (!payload.teamId || !payload.password.trim()) {
                throw new Error("Team and password are required");
            }

            const result = await missionsAPI.setTeamMissionPassword(
                payload.teamId,
                mission.id,
                undefined,
                payload.password.trim()
            );

            if (!result.success) throw new Error(result.error);
            return payload;
        },
        onSuccess: (payload) => {
            toast({ title: `Mission ${payload.missionNumber} team password saved` });
            if (payload.missionNumber === 1) setMission1Password("");
            if (payload.missionNumber === 2) setMission2Password("");
        },
        onError: (err) => {
            toast({ title: "Error", description: String(err), variant: "destructive" });
        },
    });

    const staticPasswordMutation = useMutation({
        mutationFn: async (payload: { missionNumber: 3 | 4 | 5; password: string }) => {
            if (!payload.password.trim()) throw new Error("Password is required");
            const result = await missionsAPI.setStaticMissionPassword(
                payload.missionNumber,
                payload.password.trim()
            );
            if (!result.success) throw new Error(result.error);
            return payload;
        },
        onSuccess: (payload) => {
            toast({ title: `Mission ${payload.missionNumber} password saved` });
            if (payload.missionNumber === 3) setMission3Password("");
            if (payload.missionNumber === 4) setMission4Password("");
            if (payload.missionNumber === 5) setMission5Password("");
            queryClient.invalidateQueries({ queryKey: ["missions"] });
        },
        onError: (err) => {
            toast({ title: "Error", description: String(err), variant: "destructive" });
        },
    });

    const missionResourceMutation = useMutation({
        mutationFn: async (payload: {
            missionNumber: 4 | 5;
            resourceType: "text" | "link";
            resourceValue: string;
        }) => {
            const result = await missionsAPI.setStaticMissionResource(
                payload.missionNumber,
                payload.resourceType,
                payload.resourceValue.trim()
            );
            if (!result.success) throw new Error(result.error);
            return result;
        },
        onSuccess: () => {
            toast({ title: "Mission resource saved" });
            queryClient.invalidateQueries({ queryKey: ["mission-static-resources"] });
        },
        onError: (err) => {
            toast({ title: "Error", description: String(err), variant: "destructive" });
        },
    });

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold">Mission Management</h2>
                <p className="text-muted-foreground mt-1">
                    Static missions only. Team-level passwords for Missions 1 and 2, global passwords for Missions 3-5.
                </p>
            </div>

            {/* Missions List */}
            {isLoading ? (
                <div>Loading missions...</div>
            ) : !missions?.length ? (
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-muted-foreground">
                            No missions yet. Create your first mission!
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {missions.map((mission) => (
                        <Card key={mission.id}>
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <CardTitle className="flex items-center gap-2">
                                            {mission.name}
                                            {mission.visible && mission.enabled && (
                                                <Badge variant="default">Active</Badge>
                                            )}
                                            {!mission.visible && mission.enabled && (
                                                <Badge variant="secondary">Hidden</Badge>
                                            )}
                                            {mission.visible && !mission.enabled && (
                                                <Badge variant="outline">Disabled</Badge>
                                            )}
                                        </CardTitle>
                                        <CardDescription className="mt-1">
                                            Seq: {mission.sequence_number} • Type: {mission.mission_type}
                                        </CardDescription>
                                    </div>
                                    <div className="flex gap-2">
                                        {[1, 2].includes(mission.sequence_number) && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setIsZoneManagerOpen(mission.id)}
                                                >
                                                    Manage Zones
                                                </Button>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            {mission.description && (
                                <CardContent>
                                    <p className="text-sm text-muted-foreground">
                                        {mission.description}
                                    </p>
                                </CardContent>
                            )}
                        </Card>
                    ))}
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Static Mission Password Controls</CardTitle>
                    <CardDescription>
                        Missions 1 and 2 use team-specific completion passwords.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-3 border rounded-md p-4">
                        <h4 className="font-semibold">Mission 1: Team-specific password</h4>
                        <div className="grid gap-3 md:grid-cols-2">
                            <Select value={mission1TeamId} onValueChange={setMission1TeamId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select team" />
                                </SelectTrigger>
                                <SelectContent>
                                    {(teams || []).map((team: any) => (
                                        <SelectItem key={team.id} value={team.id}>
                                            {team.team_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input
                                type="password"
                                placeholder="Completion password"
                                value={mission1Password}
                                onChange={(e) => setMission1Password(e.target.value)}
                            />
                        </div>
                        <Button
                            onClick={() =>
                                teamPasswordMutation.mutate({
                                    missionNumber: 1,
                                    teamId: mission1TeamId,
                                    password: mission1Password,
                                })
                            }
                            disabled={teamPasswordMutation.isPending}
                        >
                            Save Mission 1 Password
                        </Button>
                    </div>

                    <div className="space-y-3 border rounded-md p-4">
                        <h4 className="font-semibold">Mission 2: Team-specific password</h4>
                        <div className="grid gap-3 md:grid-cols-2">
                            <Select value={mission2TeamId} onValueChange={setMission2TeamId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select team" />
                                </SelectTrigger>
                                <SelectContent>
                                    {(teams || []).map((team: any) => (
                                        <SelectItem key={team.id} value={team.id}>
                                            {team.team_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input
                                type="password"
                                placeholder="Completion password"
                                value={mission2Password}
                                onChange={(e) => setMission2Password(e.target.value)}
                            />
                        </div>
                        <Button
                            onClick={() =>
                                teamPasswordMutation.mutate({
                                    missionNumber: 2,
                                    teamId: mission2TeamId,
                                    password: mission2Password,
                                })
                            }
                            disabled={teamPasswordMutation.isPending}
                        >
                            Save Mission 2 Password
                        </Button>
                    </div>

                    <div className="space-y-3 border rounded-md p-4">
                        <h4 className="font-semibold">Mission 3: Global password</h4>
                        <div className="flex gap-3">
                            <Input
                                type="password"
                                placeholder="Completion password"
                                value={mission3Password}
                                onChange={(e) => setMission3Password(e.target.value)}
                            />
                            <Button
                                onClick={() =>
                                    staticPasswordMutation.mutate({
                                        missionNumber: 3,
                                        password: mission3Password,
                                    })
                                }
                                disabled={staticPasswordMutation.isPending}
                            >
                                Save
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-3 border rounded-md p-4">
                        <h4 className="font-semibold">Mission 4: Global password</h4>
                        <div className="flex gap-3">
                            <Input
                                type="password"
                                placeholder="Completion password"
                                value={mission4Password}
                                onChange={(e) => setMission4Password(e.target.value)}
                            />
                            <Button
                                onClick={() =>
                                    staticPasswordMutation.mutate({
                                        missionNumber: 4,
                                        password: mission4Password,
                                    })
                                }
                                disabled={staticPasswordMutation.isPending}
                            >
                                Save
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-3 border rounded-md p-4">
                        <h4 className="font-semibold">Mission 5: Global password</h4>
                        <div className="flex gap-3">
                            <Input
                                type="password"
                                placeholder="Completion password"
                                value={mission5Password}
                                onChange={(e) => setMission5Password(e.target.value)}
                            />
                            <Button
                                onClick={() =>
                                    staticPasswordMutation.mutate({
                                        missionNumber: 5,
                                        password: mission5Password,
                                    })
                                }
                                disabled={staticPasswordMutation.isPending}
                            >
                                Save
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Mission 4 & 5 Resource Controls</CardTitle>
                    <CardDescription>
                        Configure the reward resource granted when teams complete Mission 4 or Mission 5.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-3 border rounded-md p-4">
                        <h4 className="font-semibold">Mission 4 resource</h4>
                        <div className="grid gap-3 md:grid-cols-3">
                            <Select
                                value={mission4ResourceType}
                                onValueChange={(value: "text" | "link") => setMission4ResourceType(value)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="text">Text</SelectItem>
                                    <SelectItem value="link">Link</SelectItem>
                                </SelectContent>
                            </Select>
                            <Input
                                className="md:col-span-2"
                                placeholder="Resource value"
                                value={mission4ResourceValue}
                                onChange={(e) => setMission4ResourceValue(e.target.value)}
                            />
                        </div>
                        <Button
                            onClick={() =>
                                missionResourceMutation.mutate({
                                    missionNumber: 4,
                                    resourceType: mission4ResourceType,
                                    resourceValue: mission4ResourceValue,
                                })
                            }
                            disabled={missionResourceMutation.isPending}
                        >
                            Save Mission 4 Resource
                        </Button>
                    </div>

                    <div className="space-y-3 border rounded-md p-4">
                        <h4 className="font-semibold">Mission 5 resource</h4>
                        <div className="grid gap-3 md:grid-cols-3">
                            <Select
                                value={mission5ResourceType}
                                onValueChange={(value: "text" | "link") => setMission5ResourceType(value)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="text">Text</SelectItem>
                                    <SelectItem value="link">Link</SelectItem>
                                </SelectContent>
                            </Select>
                            <Input
                                className="md:col-span-2"
                                placeholder="Resource value"
                                value={mission5ResourceValue}
                                onChange={(e) => setMission5ResourceValue(e.target.value)}
                            />
                        </div>
                        <Button
                            onClick={() =>
                                missionResourceMutation.mutate({
                                    missionNumber: 5,
                                    resourceType: mission5ResourceType,
                                    resourceValue: mission5ResourceValue,
                                })
                            }
                            disabled={missionResourceMutation.isPending}
                        >
                            Save Mission 5 Resource
                        </Button>
                    </div>

                    {!!staticResources?.length && (
                        <div className="text-sm text-muted-foreground">
                            {staticResources.map((resource: any) => (
                                <p key={resource.mission_number}>
                                    Mission {resource.mission_number}: {resource.resource_type} - {resource.resource_value}
                                </p>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Zone Manager Modal */}
            {isZoneManagerOpen && (
                <AdminZoneManager
                    mission_id={isZoneManagerOpen}
                    onClose={() => setIsZoneManagerOpen(null)}
                />
            )}
        </div>
    );
}

// ============================================
// Zone Manager Component
// ============================================

interface AdminZoneManagerProps {
    mission_id: string;
    onClose: () => void;
}

function AdminZoneManager({ mission_id, onClose }: AdminZoneManagerProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isAddOpen, setIsAddOpen] = useState(false);

    const [formData, setFormData] = useState({
        name: "",
        zone_type: "standard",
        infection_rate: 1,
        password: "",
        sequence_in_mission: 1,
    });

    // Fetch zones
    const { data: zones, isLoading } = useQuery({
        queryKey: ["zones", mission_id],
        queryFn: async () => {
            const result = await missionsAPI.getZonesForMission(mission_id);
            if (!result.success) throw new Error(result.error);
            return result.zones || [];
        },
    });

    // Create zone
    const createZoneMutation = useMutation({
        mutationFn: async () => {
            const result = await missionsAPI.createZone({
                mission_id,
                name: formData.name,
                zone_type: formData.zone_type,
                infection_rate: formData.infection_rate,
                password: formData.password,
                sequence_in_mission: formData.sequence_in_mission,
            });

            if (!result.success) throw new Error(result.error);
            return result;
        },
        onSuccess: () => {
            toast({ title: "Zone created" });
            queryClient.invalidateQueries({ queryKey: ["zones", mission_id] });
            setFormData({
                name: "",
                zone_type: "standard",
                infection_rate: 1,
                password: "",
                sequence_in_mission: (zones?.length || 0) + 1,
            });
            setIsAddOpen(false);
        },
        onError: (err) => {
            toast({
                title: "Error creating zone",
                description: String(err),
                variant: "destructive",
            });
        },
    });

    // Delete zone
    const deleteZoneMutation = useMutation({
        mutationFn: async (zoneId: string) => {
            const result = await missionsAPI.deleteZone(zoneId);
            if (!result.success) throw new Error(result.error);
            return result;
        },
        onSuccess: () => {
            toast({ title: "Zone deleted" });
            queryClient.invalidateQueries({ queryKey: ["zones", mission_id] });
        },
        onError: (err) => {
            toast({
                title: "Error deleting zone",
                description: String(err),
                variant: "destructive",
            });
        },
    });

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Manage Mission Zones</DialogTitle>
                    <DialogDescription>
                        Add and configure zones for this multi-zone mission
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Zone List */}
                    {isLoading ? (
                        <div>Loading zones...</div>
                    ) : !zones?.length ? (
                        <p className="text-muted-foreground">
                            No zones yet. Add one below!
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {zones.map((zone: any) => (
                                <Card key={zone.id}>
                                    <CardContent className="pt-4">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h4 className="font-semibold">{zone.name}</h4>
                                                <p className="text-sm text-muted-foreground">
                                                    Type: {zone.zone_type} • Infection Rate:{" "}
                                                    {zone.infection_rate}%/min
                                                </p>
                                            </div>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="destructive" size="sm">
                                                        Delete
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Delete Zone?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This zone will be removed from the mission.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <div className="flex gap-2 justify-end">
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction
                                                            onClick={() =>
                                                                deleteZoneMutation.mutate(zone.id)
                                                            }
                                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                        >
                                                            Delete
                                                        </AlertDialogAction>
                                                    </div>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}

                    {/* Add Zone Form */}
                    <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                        <DialogTrigger asChild>
                            <Button className="w-full">Add Zone</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Add New Zone</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                                <div>
                                    <Label htmlFor="zone-name">Zone Name *</Label>
                                    <Input
                                        id="zone-name"
                                        value={formData.name}
                                        onChange={(e) =>
                                            setFormData({ ...formData, name: e.target.value })
                                        }
                                        placeholder="e.g., Emergency Exit"
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="zone-type">Zone Type</Label>
                                    <Select
                                        value={formData.zone_type}
                                        onValueChange={(value) =>
                                            setFormData({ ...formData, zone_type: value })
                                        }
                                    >
                                        <SelectTrigger id="zone-type">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="standard">Standard</SelectItem>
                                            <SelectItem value="hazard">Hazard</SelectItem>
                                            <SelectItem value="safe">Safe</SelectItem>
                                            <SelectItem value="checkpoint">Checkpoint</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <Label htmlFor="infection">Infection Rate (%/min)</Label>
                                    <Input
                                        id="infection"
                                        type="number"
                                        step="0.1"
                                        value={formData.infection_rate}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                infection_rate: parseFloat(e.target.value) || 0,
                                            })
                                        }
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="password">Zone Password *</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) =>
                                            setFormData({ ...formData, password: e.target.value })
                                        }
                                        placeholder="Password to enter this zone"
                                    />
                                </div>

                                <div className="flex gap-2 justify-end">
                                    <Button
                                        variant="outline"
                                        onClick={() => setIsAddOpen(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={() => createZoneMutation.mutate()}
                                        disabled={createZoneMutation.isPending}
                                    >
                                        {createZoneMutation.isPending ? "Creating..." : "Create Zone"}
                                    </Button>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// Export both as default for backward compatibility
export const AdminMissions = AdminMissionsTab;
