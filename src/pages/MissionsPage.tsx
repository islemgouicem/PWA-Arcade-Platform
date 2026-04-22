import { Activity, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/useAuth";
import MissionBrowser from "@/pages/MissionBrowser";

export default function MissionsPage() {
    const { team } = useAuth();

    if (team?.is_suspended) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-blood" /> Mission Access Blocked
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm">Your team is suspended and cannot join missions.</p>
                    {team.suspended_until && (
                        <p className="text-xs text-muted-foreground mt-1">
                            Suspended until: {new Date(team.suspended_until).toLocaleString()}
                        </p>
                    )}
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-display text-toxic flex items-center gap-2">
                <Activity className="w-8 h-8" /> Missions
            </h1>

            <MissionBrowser />
        </div>
    );
}