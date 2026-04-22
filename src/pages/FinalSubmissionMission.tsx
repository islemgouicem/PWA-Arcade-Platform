/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef } from "react";
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
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import missionsAPI from "@/integrations/supabase/missions";
import { useAuth } from "@/contexts/useAuth";
import { Upload, CheckCircle, Lock } from "lucide-react";

export function FinalSubmissionMission() {
    const { toast } = useToast();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [submissionData, setSubmissionData] = useState("");
    const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);

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

    // Get team progress
    const { data: progression } = useQuery({
        queryKey: ["team-progression", teamId],
        queryFn: async () => {
            if (!teamId) return [];
            const result = await missionsAPI.getTeamMissionProgress(teamId);
            if (!result.success) return [];
            return result.progress || [];
        },
        enabled: !!teamId,
    });

    // Check if can access final mission
    const canAccessFinal = progression?.every((p: any) =>
        ["completed"].includes(p.status)
    );

    // Get final mission
    const { data: finalMission, isLoading } = useQuery({
        queryKey: ["final-mission"],
        queryFn: async () => {
            const result = await missionsAPI.getFinalMission();
            if (!result.success) throw new Error(result.error);
            return result.mission;
        },
    });

    // Get existing submission
    const { data: existingSubmission } = useQuery({
        queryKey: ["final-submission", teamId],
        queryFn: async () => {
            if (!teamId) return null;
            const { data } = await missionsAPI.supabase
                .from("mission_submissions")
                .select("*")
                .eq("team_id", teamId)
                .eq("mission_id", finalMission?.id || "")
                .single();
            return data;
        },
        enabled: !!teamId && !!finalMission?.id,
    });

    // Submit final mission
    const submitMission = useMutation({
        mutationFn: async () => {
            if (!finalMission || !teamId) throw new Error("Mission not found");

            // In a real app, upload file to storage first
            const documentPath = `submissions/${teamId}/${selectedFile?.name || "document"}`;

            const result = await missionsAPI.submitFinalMission(
                finalMission.id,
                documentPath,
                selectedFile?.name || "submission",
                {
                    notes: submissionData,
                    submitted_by: user?.email,
                    file_size: selectedFile?.size,
                }
            );

            if (!result.success) throw new Error(result.error);
            return result;
        },
        onSuccess: () => {
            toast({
                title: "Submission received!",
                description:
                    "Your final submission has been recorded. Congratulations on completing all missions!",
            });
            queryClient.invalidateQueries({
                queryKey: ["final-submission", teamId],
            });
            setSelectedFile(null);
            setSubmissionData("");
            setIsConfirmDialogOpen(false);
        },
        onError: (err) => {
            toast({
                title: "Submission failed",
                description: String(err),
                variant: "destructive",
            });
        },
    });

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-muted-foreground">Loading final mission...</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!finalMission) {
        return (
            <div className="space-y-6">
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-muted-foreground">
                            No final submission mission available
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!canAccessFinal) {
        return (
            <div className="space-y-6">
                <Card className="border-yellow-500 bg-yellow-50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Lock className="w-5 h-5" />
                            Final Submission Locked
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Alert>
                            <AlertDescription>
                                Complete all previous missions to unlock the final submission.
                                You must complete all missions sequentially before you can
                                submit your final documentation.
                            </AlertDescription>
                        </Alert>
                        {progression && (
                            <div className="mt-4 space-y-2">
                                {progression.map((p: any) => (
                                    <div key={p.id} className="flex items-center gap-2 text-sm">
                                        <Badge variant="outline">
                                            {p.missions?.name || "Unknown"}
                                        </Badge>
                                        <span className="text-muted-foreground">
                                            {p.status === "completed" ? "✓ Completed" : "○ " + p.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (existingSubmission) {
        return (
            <div className="space-y-6">
                <Card className="border-green-500 bg-green-50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                            Submission Complete
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm">
                            Your final submission has been recorded on{" "}
                            <strong>
                                {new Date(existingSubmission.submitted_at).toLocaleDateString()}
                            </strong>
                        </p>
                        <div className="bg-white p-3 rounded border text-xs text-muted-foreground">
                            Document: <strong>{existingSubmission.document_name}</strong>
                        </div>
                        {existingSubmission.submission_data?.notes && (
                            <div className="bg-white p-3 rounded border">
                                <p className="text-xs font-semibold mb-1">Your Notes:</p>
                                <p className="text-xs text-muted-foreground">
                                    {existingSubmission.submission_data.notes}
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold">{finalMission.name}</h2>
                <p className="text-muted-foreground mt-1">
                    You have completed all missions. Submit your final documentation now.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Final Submission</CardTitle>
                    <CardDescription>
                        Upload your completed work and any additional notes
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {finalMission.description && (
                        <Alert>
                            <AlertDescription className="text-sm">
                                {finalMission.description}
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* File Upload */}
                    <div>
                        <Label htmlFor="document" className="mb-2 block">
                            Upload Document
                        </Label>
                        <div
                            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-accent transition"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                id="document"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        setSelectedFile(file);
                                    }
                                }}
                            />
                            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                            <p className="text-sm font-medium">
                                {selectedFile ? selectedFile.name : "Click to upload document"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                PDF, DOC, DOCX, or ZIP files (max 50MB)
                            </p>
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <Label htmlFor="notes" className="mb-2 block">
                            Additional Notes (Optional)
                        </Label>
                        <Textarea
                            id="notes"
                            value={submissionData}
                            onChange={(e) => setSubmissionData(e.target.value)}
                            placeholder="Add any comments or context about your submission..."
                            rows={4}
                        />
                    </div>

                    {/* Submit Button */}
                    <div className="flex gap-2 justify-end pt-4">
                        <AlertDialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
                            <Button
                                onClick={() => {
                                    if (!selectedFile) {
                                        toast({
                                            title: "Error",
                                            description: "Please upload a document",
                                            variant: "destructive",
                                        });
                                        return;
                                    }
                                    setIsConfirmDialogOpen(true);
                                }}
                            >
                                Submit Final Work
                            </Button>

                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Confirm Final Submission?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This is your final submission. Once submitted, you cannot
                                        change it unless an admin grants permission. Please review
                                        your work carefully before confirming.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <div className="flex gap-2 justify-end">
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={() => submitMission.mutate()}
                                        disabled={submitMission.isPending}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                        {submitMission.isPending ? "Submitting..." : "Confirm Submission"}
                                    </AlertDialogAction>
                                </div>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// ============================================
// ADMIN VIEW OF SUBMISSIONS
// ============================================

export function AdminSubmissionsView() {
    const queryClient = useQueryClient();

    // Get all final submissions
    const { data: submissions, isLoading } = useQuery({
        queryKey: ["admin-submissions"],
        queryFn: async () => {
            const result = await missionsAPI.getFinalSubmissions();
            if (!result.success) throw new Error(result.error);
            return result.submissions || [];
        },
    });

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold">Final Submissions</h2>
                <p className="text-muted-foreground mt-1">
                    Review and manage team final submissions
                </p>
            </div>

            {isLoading ? (
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-muted-foreground">Loading submissions...</p>
                    </CardContent>
                </Card>
            ) : !submissions?.length ? (
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-muted-foreground">No submissions yet</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {submissions.map((sub: any) => (
                        <Card key={sub.id}>
                            <CardContent className="pt-6">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className="font-semibold">{sub.teams?.team_name}</h4>
                                            <p className="text-xs text-muted-foreground">
                                                Mission: {sub.missions?.name}
                                            </p>
                                        </div>
                                        <Badge variant="default">
                                            {new Date(sub.submitted_at).toLocaleDateString()}
                                        </Badge>
                                    </div>

                                    <div className="bg-secondary p-3 rounded text-xs">
                                        <p className="font-medium">Document:</p>
                                        <p className="text-muted-foreground">
                                            {sub.document_name}
                                        </p>
                                    </div>

                                    {sub.submission_data?.notes && (
                                        <div className="bg-secondary p-3 rounded text-xs">
                                            <p className="font-medium">Notes:</p>
                                            <p className="text-muted-foreground">
                                                {sub.submission_data.notes}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}

export default FinalSubmissionMission;
