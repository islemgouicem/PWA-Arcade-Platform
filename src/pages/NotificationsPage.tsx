import { Bell, Megaphone } from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function NotificationsPage() {
    const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications();
    const { data: announcements = [] } = useQuery({
        queryKey: ["notifications-page-announcements"],
        queryFn: async () => {
            const { data } = await supabase
                .from("announcements")
                .select("id, title, content, created_at")
                .eq("is_active", true)
                .order("created_at", { ascending: false });
            return data || [];
        },
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-display text-toxic flex items-center gap-2">
                    <Bell className="w-8 h-8" /> Notifications
                </h1>
                {unreadCount > 0 && (
                    <Button variant="outline" onClick={markAllRead}>Mark all read</Button>
                )}
            </div>

            <section className="space-y-2">
                <h2 className="text-lg font-display text-foreground flex items-center gap-2">
                    <Megaphone className="w-5 h-5" /> Broadcasts
                </h2>
                {announcements.length === 0 ? (
                    <p className="text-sm text-muted-foreground font-flavor">No active broadcasts.</p>
                ) : (
                    announcements.map((a: { id: string; title: string; content: string; created_at: string }) => (
                        <div key={a.id} className="bg-card border border-border rounded-lg p-3">
                            <p className="font-bold text-sm">{a.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">{a.content}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">{new Date(a.created_at).toLocaleString()}</p>
                        </div>
                    ))
                )}
            </section>

            <section className="space-y-2">
                <h2 className="text-lg font-display text-foreground">Team Events</h2>
                {notifications.length === 0 ? (
                    <p className="text-sm text-muted-foreground font-flavor">No notifications yet.</p>
                ) : (
                    notifications.map((n) => (
                        <button
                            type="button"
                            key={n.id}
                            onClick={() => {
                                if (!n.is_read) markAsRead(n.id);
                            }}
                            className={`w-full text-left bg-card border rounded-lg p-3 ${n.is_read ? "border-border opacity-70" : "border-toxic"}`}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <p className="font-bold text-sm">{n.title}</p>
                                {!n.is_read && <span className="text-[10px] px-2 py-0.5 rounded-full bg-toxic/20 text-toxic">NEW</span>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{n.message}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
                        </button>
                    ))
                )}
            </section>
        </div>
    );
}
