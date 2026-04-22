import { ClipboardCheck } from "lucide-react";
import { ZoneHandlerInterface } from "@/pages/ZoneInterface";

export default function MissionResponsiblePage() {
    return (
        <div className="space-y-4">
            <h1 className="text-3xl font-display text-toxic flex items-center gap-2">
                <ClipboardCheck className="w-8 h-8" /> Mission Responsible
            </h1>

            <ZoneHandlerInterface />
        </div>
    );
}