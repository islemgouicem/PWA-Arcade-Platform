import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

function formatError(err: unknown): string {
    if (err instanceof Error) {
        if (err.message && err.message !== "[object Object]") return err.message;
        const errorWithDetails = err as Error & { details?: unknown; hint?: unknown; code?: unknown };
        const details = [errorWithDetails.details, errorWithDetails.hint, errorWithDetails.code]
            .filter(Boolean)
            .map(String)
            .join(" | ");
        return details || "Unknown error";
    }
    if (typeof err === "string") return err;
    if (err && typeof err === "object") {
        const e = err as Record<string, unknown>;
        const pieces = [e.message, e.error, e.details, e.hint, e.code]
            .filter(Boolean)
            .map(String);
        if (pieces.length) return pieces.join(" | ");
        try {
            return JSON.stringify(err);
        } catch {
            return "Unknown error object";
        }
    }
    return String(err);
}

// ============================================
// MISSION MANAGEMENT API
// ============================================

export interface MissionConfig {
    name: string;
    visible: boolean;
    enabled: boolean;
    is_open?: boolean;
    mission_type: "standard" | "multi_zone" | "special" | "final_submission";
    sequence_number?: number;
    description?: string;
    require_entry_password: boolean;
    require_finish_password: boolean;
    entry_password?: string;
    finish_password?: string;
    is_final_submission?: boolean;
    infection_rate_per_minute?: number;
}

export interface ZoneConfig {
    mission_id: string;
    name: string;
    zone_type: string;
    infection_rate: number;
    password: string;
    sequence_in_mission: number;
}

export interface StaticMission {
    mission_number: number;
    mission_id: string;
    name: string;
    description: string | null;
    enabled: boolean;
    unlocked: boolean;
    status: string;
    is_joined: boolean;
    can_join: boolean;
    is_final: boolean;
    resource_type: "text" | "link" | null;
    resource_value: string | null;
}

/**
 * Admin: Create or update mission with comprehensive configuration
 */
export async function configureMission(config: MissionConfig) {
    const {
        name,
        visible,
        enabled,
        is_open,
        mission_type,
        sequence_number,
        description,
        require_entry_password,
        require_finish_password,
        entry_password,
        finish_password,
        is_final_submission,
    } = config;

    try {
        const { data: mission, error } = await db
            .from("missions")
            .upsert(
                {
                    name,
                    visible,
                    enabled,
                    is_open: is_open ?? (visible && enabled),
                    mission_type,
                    sequence_number,
                    description,
                    require_entry_password,
                    require_finish_password,
                    entry_password_hash: entry_password
                        ? await hashPassword(entry_password)
                        : null,
                    finish_password_hash: finish_password
                        ? await hashPassword(finish_password)
                        : null,
                    is_final_submission: is_final_submission || false,
                    completion_password_hash: finish_password
                        ? await hashPassword(finish_password)
                        : null,
                },
                { onConflict: "name" }
            )
            .select()
            .single();

        if (error) throw error;
        return { success: true, mission };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

/**
 * Admin: Create zone in a mission
 */
export async function createZone(config: ZoneConfig) {
    const {
        mission_id,
        name,
        zone_type,
        infection_rate,
        password,
        sequence_in_mission,
    } = config;

    try {
        const { data: zone, error } = await db
            .from("mission_zones")
            .insert({
                mission_id,
                name,
                zone_type,
                infection_rate,
                password_hash: await hashPassword(password),
                sequence_in_mission,
            })
            .select()
            .single();

        if (error) throw error;
        return { success: true, zone };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

/**
 * Admin: Get all zones for a mission
 */
export async function getZonesForMission(mission_id: string) {
    try {
        const { data: zones, error } = await db
            .from("mission_zones")
            .select("*")
            .eq("mission_id", mission_id)
            .order("sequence_in_mission", { ascending: true });

        if (error) throw error;
        return { success: true, zones: zones || [] };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

/**
 * Admin: Delete zone
 */
export async function deleteZone(zone_id: string) {
    try {
        const { error } = await db
            .from("mission_zones")
            .delete()
            .eq("id", zone_id);

        if (error) throw error;
        return { success: true };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

/**
 * Admin: Set team-specific passwords for a mission
 */
export async function setTeamMissionPassword(
    team_id: string,
    mission_id: string,
    entry_password?: string,
    finish_password?: string
) {
    try {
        const { data, error } = await db.rpc(
            "set_team_mission_password",
            {
                p_team_id: team_id,
                p_mission_id: mission_id,
                p_entry_password: entry_password || null,
                p_finish_password: finish_password || null,
            }
        );

        if (error) throw error;
        return { success: true, data };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

// ============================================
// PARTICIPANT MISSION INTERACTIONS
// ============================================

/**
 * Participant: Get available missions based on progression
 */
export async function getAvailableMissions() {
    try {
        const { data: missions, error } = await db
            .from("missions")
            .select(
                `
        id, name, description, mission_type, sequence_number, 
        visible, enabled, require_entry_password, require_finish_password,
        mission_zones (id, name, zone_type, sequence_in_mission)
      `
            )
            .or("and(visible.eq.true,enabled.eq.true),and(visible.eq.false,enabled.eq.true)")
            .order("sequence_number", { ascending: true });

        if (error) throw error;
        return { success: true, missions: missions || [] };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

/**
 * Participant: Get current mission progression
 */
export async function getTeamMissionProgress(team_id: string) {
    try {
        const { data: progress, error } = await db
            .from("team_mission_progression")
            .select(
                `
        id, mission_id, status, is_current, started_at, completed_at,
        missions (id, name, description, mission_type, sequence_number)
      `
            )
            .eq("team_id", team_id)
            .order("missions(sequence_number)", { ascending: true });

        if (error) throw error;
        return { success: true, progress: progress || [] };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

/**
 * Participant: Join a mission
 */
export async function joinMission(mission_id: string) {
    try {
        const { error } = await db.rpc("join_mission", {
            p_mission_id: mission_id,
        });

        if (error) throw error;
        return { success: true };
    } catch (err) {
        console.error("[missions.joinMission] RPC join_mission failed", {
            mission_id,
            error: err,
        });
        return { success: false, error: String(err) };
    }
}

// ============================================
// STATIC MISSIONS (1..6)
// ============================================

export async function getStaticMissionsForTeam() {
    try {
        const { data, error } = await db.rpc("get_static_missions_for_team");
        if (error) throw error;
        return { success: true, missions: (data || []) as StaticMission[] };
    } catch (err) {
        console.error("[missions.getStaticMissionsForTeam] failed", { error: err });
        return { success: false, error: String(err), missions: [] as StaticMission[] };
    }
}

export async function joinStaticMission(mission_number: number) {
    try {
        const { data, error } = await db.rpc("join_static_mission", {
            p_mission_number: mission_number,
        });
        if (error) throw error;
        return { success: true, data };
    } catch (err) {
        console.error("[missions.joinStaticMission] failed", {
            mission_number,
            error: err,
        });
        return { success: false, error: String(err) };
    }
}

export async function completeStaticMission(mission_number: number, password: string) {
    try {
        const { data, error } = await db.rpc("complete_static_mission", {
            p_mission_number: mission_number,
            p_password: password,
        });
        if (error) throw error;

        // Brute-force protection: the RPC now returns wrong-password and lockout
        // responses as JSON (instead of RAISE EXCEPTION) so failed-attempt logs
        // and admin notifications survive the transaction.
        if (data && typeof data === "object" && (data as { error?: string }).error) {
            const payload = data as {
                error: string;
                remaining_seconds?: number;
                attempts_in_window?: number;
                max_attempts?: number;
                lockout_minutes?: number;
                window_minutes?: number;
            };
            return {
                success: false as const,
                error: payload.error,
                code: payload.error,
                remaining_seconds: payload.remaining_seconds,
                attempts_in_window: payload.attempts_in_window,
                max_attempts: payload.max_attempts,
                lockout_minutes: payload.lockout_minutes,
                window_minutes: payload.window_minutes,
                data: payload,
            };
        }

        return { success: true as const, data };
    } catch (err) {
        console.error("[missions.completeStaticMission] failed", {
            mission_number,
            error: err,
        });
        return { success: false as const, error: formatError(err) };
    }
}

export async function setStaticMissionPassword(
    missionNumber: 3 | 4 | 5,
    password: string
) {
    try {
        const { error } = await db.rpc("set_static_mission_password", {
            p_mission_number: missionNumber,
            p_password: password,
        });
        if (error) throw error;
        return { success: true };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

export async function setStaticMissionResource(
    missionNumber: 4 | 5,
    resourceType: "text" | "link",
    resourceValue: string
) {
    try {
        const { error } = await db.rpc("set_static_mission_resource", {
            p_mission_number: missionNumber,
            p_resource_type: resourceType,
            p_resource_value: resourceValue,
        });
        if (error) throw error;
        return { success: true };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

export async function getStaticMissionResourcesAdmin() {
    try {
        const { data, error } = await db.rpc("get_mission_static_resources_admin");
        if (error) throw error;
        return { success: true, resources: data || [] };
    } catch (err) {
        return { success: false, error: String(err), resources: [] };
    }
}

// ============================================
// ZONE ENTRY/EXIT FLOW
// ============================================

/**
 * Participant: Request entry into a zone
 */
export async function requestZoneEntry(zone_id: string, password: string) {
    try {
        const { data: result, error } = await db.rpc(
            "team_request_zone_entry",
            {
                p_zone_id: zone_id,
                p_password: password || null,
            }
        );

        if (error) throw error;
        if (!result || result.error || result.success === false) {
            throw new Error(formatError(result?.error || result || "Zone entry request failed"));
        }
        return { success: true, data: result };
    } catch (err) {
        return { success: false, error: formatError(err) };
    }
}

/**
 * Participant: View pending zone entries (for approval/denial)
 */
export async function getZoneEntriesForTeam(team_id?: string) {
    try {
        const { data: entries, error } = team_id
            ? await db.rpc("get_zone_entries_for_team", { p_team_id: team_id })
            : await db.rpc("get_zone_entries_for_team");
        if (error) throw error;
        return { success: true, entries: entries || [] };
    } catch (err) {
        return { success: false, error: formatError(err) };
    }
}

/**
 * Participant: Request zone exit
 */
export async function requestZoneExit(zone_entry_id: string) {
    try {
        const { data: result, error } = await db.rpc(
            "team_request_zone_exit",
            {
                p_zone_entry_id: zone_entry_id,
            }
        );

        if (error) throw error;
        if (!result || result.error || result.success === false) {
            throw new Error(formatError(result?.error || result || "Zone exit request failed"));
        }
        return { success: true, data: result };
    } catch (err) {
        return { success: false, error: formatError(err) };
    }
}

// ============================================
// ZONE HANDLER INTERFACE
// ============================================

/**
 * Handler: Get all zone entries for a zone (pending, inside, exit_requested)
 */
export async function getZoneHandlerView(zone_id: string) {
    try {
        const { data: entries, error } = await db
            .from("zone_entries")
            .select(
                `
        id, team_id, status, entry_requested_at, exit_requested_at,
        teams (team_name)
      `
            )
            .eq("zone_id", zone_id)
            .in("status", ["pending", "inside", "exit_requested"])
            .order("entry_requested_at", { ascending: true });

        if (error) throw error;
        return { success: true, entries: entries || [] };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

/**
 * Handler: Approve team entry into zone
 */
export async function approveZoneEntry(zone_entry_id: string) {
    try {
        const { data: result, error } = await db.rpc(
            "handler_approve_zone_entry",
            {
                p_zone_entry_id: zone_entry_id,
            }
        );

        if (error) throw error;
        if (!result || result.error || result.success === false) {
            throw new Error(formatError(result?.error || result || "Approve entry failed"));
        }
        return { success: true, data: result };
    } catch (err) {
        return { success: false, error: formatError(err) };
    }
}

/**
 * Handler: Deny team entry into zone
 */
export async function denyZoneEntry(zone_entry_id: string) {
    try {
        const { data: result, error } = await db.rpc(
            "handler_deny_zone_entry",
            {
                p_zone_entry_id: zone_entry_id,
            }
        );

        if (error) throw error;
        if (!result || result.error || result.success === false) {
            throw new Error(formatError(result?.error || result || "Deny entry failed"));
        }
        return { success: true, data: result };
    } catch (err) {
        return { success: false, error: formatError(err) };
    }
}

/**
 * Handler: Approve team exit from zone
 */
export async function approveZoneExit(zone_entry_id: string) {
    try {
        const { data: result, error } = await db.rpc(
            "handler_approve_zone_exit",
            {
                p_zone_entry_id: zone_entry_id,
            }
        );

        if (error) throw error;
        if (!result || result.error || result.success === false) {
            throw new Error(formatError(result?.error || result || "Approve exit failed"));
        }
        return { success: true, data: result };
    } catch (err) {
        return { success: false, error: formatError(err) };
    }
}

/**
 * Handler: Unlock zone access with zone password before viewing details
 */
export async function unlockZoneHandlerAccess(zone_id: string, password: string) {
    try {
        const { data: result, error } = await db.rpc(
            "validate_zone_handler_access",
            {
                p_zone_id: zone_id,
                p_password: password,
            }
        );

        if (error) throw error;
        return { success: true, data: result };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

/**
 * Handler: Identify zone by password and unlock access
 */
export async function identifyZoneHandlerAccess(password: string) {
    try {
        const { data: result, error } = await db.rpc(
            "identify_zone_handler_access",
            {
                p_password: password,
            }
        );

        if (error) throw error;
        if (!result || result.error || result.success === false || !result.zone_id) {
            return {
                success: false,
                error: result?.error || "Zone identification failed",
                data: result,
            };
        }

        return { success: true, data: result };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

// ============================================
// MISSION COMPLETION & REWARDS
// ============================================

/**
 * Participant: Complete mission with password validation
 */
export async function completeMission(
    mission_id: string,
    password: string
) {
    try {
        const { data: result, error } = await db.rpc("complete_mission", {
            p_mission_id: mission_id,
            p_password: password,
        });

        if (error) throw error;
        return { success: true, data: result };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

/**
 * Get team's mission rewards
 */
export async function getTeamMissionRewards(team_id: string) {
    try {
        const { data: rewards, error } = await db
            .from("mission_rewards")
            .select(
                `
        id, mission_id, card_id, completion_position, distributed_at,
        missions (name),
        cards (name, card_type, shop_price)
      `
            )
            .eq("team_id", team_id)
            .order("distributed_at", { ascending: false });

        if (error) throw error;
        return { success: true, rewards: rewards || [] };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

// ============================================
// FINAL SUBMISSION MISSION
// ============================================

/**
 * Get final mission (if accessible)
 */
export async function getFinalMission() {
    try {
        const { data: mission, error } = await db
            .from("missions")
            .select("*")
            .eq("is_final_submission", true)
            .single();

        if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
        return { success: true, mission };
    } catch (err) {
        return { success: false, error: formatError(err) };
    }
}

/**
 * Participant: Submit final mission document
 */
export async function submitFinalMission(
    mission_id: string,
    document_path: string,
    document_name: string,
    submission_data?: Record<string, any>
) {
    try {
        const { data: result, error } = await db.rpc(
            "submit_final_mission",
            {
                p_mission_id: mission_id,
                p_document_path: document_path,
                p_document_name: document_name,
                p_submission_data: submission_data || null,
            }
        );

        if (error) throw error;
        if (!result || result.error || result.success === false) {
            throw new Error(formatError(result?.error || result || "Final submission failed"));
        }
        return { success: true, data: result };
    } catch (err) {
        return { success: false, error: formatError(err) };
    }
}

/**
 * Admin: Get all final submissions
 */
export async function getFinalSubmissions() {
    try {
        const { data: submissions, error } = await db
            .from("mission_submissions")
            .select(
                `
        id, mission_id, team_id, document_path, document_name, 
        submission_data, submitted_at, 
        teams (team_name),
        missions (name)
      `
            )
            .order("submitted_at", { ascending: false });

        if (error) throw error;
        return { success: true, submissions: submissions || [] };
    } catch (err) {
        return { success: false, error: formatError(err) };
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Hash password using bcrypt via Supabase (backend-only in production)
 * For now, we'll use a simple stub - actual hashing happens in Supabase functions
 */
async function hashPassword(password: string): Promise<string> {
    // Always hash server-side so DB functions using crypt(...) can validate passwords.
    const { data, error } = await db.rpc("crypt_generate", {
        p_password: password,
    });

    if (error) throw error;

    const hashed = Array.isArray(data) ? data[0]?.hashed_password : data?.hashed_password;
    if (!hashed) {
        throw new Error("Failed to hash password");
    }

    return hashed;
}

/**
 * Get mission completion leaderboard
 */
export async function getMissionLeaderboard(mission_id: string) {
    try {
        const { data: completions, error } = await db
            .from("mission_completions")
            .select(
                `
        completion_position, completed_at,
        teams (name, created_at)
      `
            )
            .eq("mission_id", mission_id)
            .order("completion_position", { ascending: true });

        if (error) throw error;
        return { success: true, leaderboard: completions || [] };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

/**
 * Admin: Get detailed mission analytics
 */
export async function getMissionAnalytics(mission_id: string) {
    try {
        // Get completions
        const { data: completions, error: compError } = await db
            .from("mission_completions")
            .select("count", { count: "exact" })
            .eq("mission_id", mission_id);

        // Get rewards distributed
        const { data: rewards, error: rewError } = await db
            .from("mission_rewards")
            .select("count", { count: "exact" })
            .eq("mission_id", mission_id);

        if (compError || rewError) throw compError || rewError;

        return {
            success: true,
            analytics: {
                completions_count: completions?.length || 0,
                rewards_distributed: rewards?.length || 0,
            },
        };
    } catch (err) {
        return { success: false, error: String(err) };
    }
}

export default {
    supabase: db,
    // Mission Configuration
    configureMission,
    createZone,
    getZonesForMission,
    deleteZone,
    setTeamMissionPassword,

    // Participant Missions
    getAvailableMissions,
    getTeamMissionProgress,
    joinMission,
    getStaticMissionsForTeam,
    joinStaticMission,
    completeStaticMission,

    // Zone Entry/Exit
    requestZoneEntry,
    getZoneEntriesForTeam,
    requestZoneExit,

    // Zone Handler
    getZoneHandlerView,
    approveZoneEntry,
    denyZoneEntry,
    approveZoneExit,

    // Mission Completion
    completeMission,
    getTeamMissionRewards,

    // Final Submission
    getFinalMission,
    submitFinalMission,
    getFinalSubmissions,

    // Static admin
    setStaticMissionPassword,
    setStaticMissionResource,
    getStaticMissionResourcesAdmin,
    identifyZoneHandlerAccess,

    // Analytics
    getMissionLeaderboard,
    getMissionAnalytics,
};


