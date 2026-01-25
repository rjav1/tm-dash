"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Play,
  Square,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface GeneratorTask {
  id: string;
  email: string;
  imapSource: string;
  proxy: string | null;
  status: string;
  errorMessage: string | null;
  password: string | null;
  phoneNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  postalCode: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface GeneratorJob {
  id: string;
  status: string;
  threadCount: number;
  totalTasks: number;
  completed: number;
  succeeded: number;
  failed: number;
  workerId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  tasks?: GeneratorTask[];
  _count?: { tasks: number };
}

const statusColors: Record<string, "default" | "success" | "destructive" | "warning" | "secondary"> = {
  PENDING: "secondary",
  RUNNING: "warning",
  COMPLETED: "success",
  FAILED: "destructive",
  CANCELLED: "default",
  SUCCESS: "success",
};

const statusIcons: Record<string, React.ReactNode> = {
  PENDING: <Clock className="h-4 w-4" />,
  RUNNING: <Loader2 className="h-4 w-4 animate-spin" />,
  COMPLETED: <CheckCircle2 className="h-4 w-4" />,
  FAILED: <XCircle className="h-4 w-4" />,
  CANCELLED: <Square className="h-4 w-4" />,
  SUCCESS: <CheckCircle2 className="h-4 w-4" />,
};

export default function GeneratorPage() {
  const [jobs, setJobs] = useState<GeneratorJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [expandedJobTasks, setExpandedJobTasks] = useState<GeneratorTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  // Form state
  const [emails, setEmails] = useState("");
  const [proxies, setProxies] = useState("");
  const [threadCount, setThreadCount] = useState("3");

  const { toast } = useToast();
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Fetch jobs
  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/generator/jobs?limit=50");
      if (!response.ok) throw new Error("Failed to fetch jobs");
      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      toast({
        title: "Error",
        description: "Failed to fetch jobs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchJobs();

    // Set up Supabase Realtime subscription for live updates
    const supabaseClient = getSupabase();
    if (isSupabaseConfigured() && supabaseClient) {
      const channel = supabaseClient
        .channel("generator-updates")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "generator_jobs",
          },
          (payload) => {
            console.log("[Realtime] Job update:", payload);
            // Refresh jobs on any change
            fetchJobs();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "generator_tasks",
          },
          (payload) => {
            console.log("[Realtime] Task update:", payload);
            // If we're viewing tasks for this job, refresh them
            if (expandedJobId && payload.new && typeof payload.new === "object" && "job_id" in payload.new) {
              const taskJobId = (payload.new as { job_id: string }).job_id;
              if (taskJobId === expandedJobId) {
                // Refresh expanded job tasks
                fetch(`/api/generator/jobs/${expandedJobId}`)
                  .then((res) => res.json())
                  .then((data) => {
                    if (data.job?.tasks) {
                      setExpandedJobTasks(data.job.tasks);
                    }
                  })
                  .catch(console.error);
              }
            }
            // Also refresh jobs to update progress counts
            fetchJobs();
          }
        )
        .subscribe((status) => {
          console.log("[Realtime] Subscription status:", status);
          setRealtimeConnected(status === "SUBSCRIBED");
        });

      channelRef.current = channel;

      return () => {
        if (channelRef.current && supabaseClient) {
          supabaseClient.removeChannel(channelRef.current);
        }
      };
    } else {
      // Fallback: Poll every 5 seconds for running jobs if Supabase not configured
      const interval = setInterval(() => {
        if (jobs.some((j) => j.status === "RUNNING" || j.status === "PENDING")) {
          fetchJobs();
        }
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [fetchJobs, expandedJobId, jobs]);

  // Submit new job
  const handleSubmit = async () => {
    if (!emails.trim()) {
      toast({
        title: "Error",
        description: "Please enter at least one email",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/generator/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails,
          proxies,
          threadCount: parseInt(threadCount, 10),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create job");
      }

      const data = await response.json();
      toast({
        title: "Job Created",
        description: data.message,
      });

      // Clear form and refresh
      setEmails("");
      setProxies("");
      fetchJobs();
    } catch (error) {
      console.error("Error creating job:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create job",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel job
  const handleCancel = async (jobId: string) => {
    try {
      const response = await fetch(`/api/generator/jobs/${jobId}/cancel`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to cancel job");
      }

      toast({
        title: "Job Cancelled",
        description: "The job has been cancelled",
      });
      fetchJobs();
    } catch (error) {
      console.error("Error cancelling job:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to cancel job",
        variant: "destructive",
      });
    }
  };

  // Delete job
  const handleDelete = async (jobId: string) => {
    try {
      const response = await fetch(`/api/generator/jobs/${jobId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete job");
      }

      toast({
        title: "Job Deleted",
        description: "The job has been deleted",
      });
      
      if (expandedJobId === jobId) {
        setExpandedJobId(null);
        setExpandedJobTasks([]);
      }
      fetchJobs();
    } catch (error) {
      console.error("Error deleting job:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete job",
        variant: "destructive",
      });
    }
  };

  // Toggle job expansion
  const toggleExpand = async (jobId: string) => {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
      setExpandedJobTasks([]);
      return;
    }

    setExpandedJobId(jobId);
    setLoadingTasks(true);

    try {
      const response = await fetch(`/api/generator/jobs/${jobId}`);
      if (!response.ok) throw new Error("Failed to fetch job details");
      const data = await response.json();
      setExpandedJobTasks(data.job.tasks || []);
    } catch (error) {
      console.error("Error fetching job tasks:", error);
      toast({
        title: "Error",
        description: "Failed to load tasks",
        variant: "destructive",
      });
    } finally {
      setLoadingTasks(false);
    }
  };

  // Count emails in textarea
  const emailCount = emails
    .split("\n")
    .filter((line) => line.trim().length > 0).length;

  const proxyCount = proxies
    .split("\n")
    .filter((line) => line.trim().length > 0).length;

  return (
    <div className="flex-1 space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Account Generator</h1>
          <p className="text-muted-foreground">
            Generate TicketMaster accounts remotely on your VPS
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSupabaseConfigured() && (
            <Badge variant={realtimeConnected ? "success" : "secondary"} className="gap-1">
              {realtimeConnected ? (
                <Wifi className="h-3 w-3" />
              ) : (
                <WifiOff className="h-3 w-3" />
              )}
              {realtimeConnected ? "Live" : "Connecting..."}
            </Badge>
          )}
          <Button variant="outline" onClick={fetchJobs} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Input Form */}
        <Card>
          <CardHeader>
            <CardTitle>New Generation Job</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="emails">
                Emails ({emailCount} emails)
              </Label>
              <Textarea
                id="emails"
                placeholder="email@example.com,aycd&#10;another@gmail.com,imap@gmail.com&#10;..."
                className="min-h-[200px] font-mono text-sm"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Format: email,imap (one per line). Use &quot;aycd&quot; for AYCD Inbox.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="proxies">
                Proxies ({proxyCount} proxies)
              </Label>
              <Textarea
                id="proxies"
                placeholder="ip:port:user:pass&#10;ip:port:user:pass&#10;..."
                className="min-h-[100px] font-mono text-sm"
                value={proxies}
                onChange={(e) => setProxies(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                One proxy per line. Will be assigned round-robin to tasks.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="threads">Thread Count</Label>
              <Select value={threadCount} onValueChange={setThreadCount}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <SelectItem key={n} value={n.toString()}>
                      {n} {n === 1 ? "thread" : "threads"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={submitting || emailCount === 0}
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Start Generation ({emailCount} accounts)
            </Button>
          </CardContent>
        </Card>

        {/* Worker Status */}
        <Card>
          <CardHeader>
            <CardTitle>Worker Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 p-4 rounded-lg border bg-muted/50">
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">VPS Worker Required</p>
                <p className="text-sm text-muted-foreground">
                  Jobs are queued in the database. Run <code className="bg-muted px-1 rounded">worker_daemon.py</code> on your VPS to process them.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Active Jobs</span>
                <span className="font-medium">
                  {jobs.filter((j) => j.status === "RUNNING").length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pending Jobs</span>
                <span className="font-medium">
                  {jobs.filter((j) => j.status === "PENDING").length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Completed Today</span>
                <span className="font-medium">
                  {jobs.filter((j) => {
                    if (j.status !== "COMPLETED") return false;
                    const today = new Date().toDateString();
                    return new Date(j.completedAt || j.createdAt).toDateString() === today;
                  }).length}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Jobs List */}
      <Card>
        <CardHeader>
          <CardTitle>Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No jobs yet. Create one above to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div key={job.id} className="border rounded-lg">
                  {/* Job Header */}
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleExpand(job.id)}
                  >
                    <div className="flex-shrink-0">
                      {expandedJobId === job.id ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={statusColors[job.status] || "default"}>
                          <span className="mr-1">{statusIcons[job.status]}</span>
                          {job.status}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {job.totalTasks} tasks
                        </span>
                        <span className="text-sm text-muted-foreground">
                          &bull; {job.threadCount} threads
                        </span>
                        {job.workerId && (
                          <span className="text-xs text-muted-foreground">
                            &bull; Worker: {job.workerId}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Created {formatDate(job.createdAt)}
                        {job.completedAt && ` • Completed ${formatDate(job.completedAt)}`}
                      </div>
                    </div>

                    {/* Progress */}
                    {(job.status === "RUNNING" || job.completed > 0) && (
                      <div className="flex-shrink-0 w-48">
                        <Progress
                          value={(job.completed / job.totalTasks) * 100}
                          className="h-2"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span>{job.completed}/{job.totalTasks}</span>
                          <span className="text-green-600">{job.succeeded} ok</span>
                          {job.failed > 0 && (
                            <span className="text-red-600">{job.failed} fail</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex-shrink-0 flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {(job.status === "PENDING" || job.status === "RUNNING") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCancel(job.id)}
                        >
                          <Square className="h-4 w-4" />
                        </Button>
                      )}
                      {job.status !== "RUNNING" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(job.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Tasks */}
                  {expandedJobId === job.id && (
                    <div className="border-t bg-muted/30 p-4">
                      {loadingTasks ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : expandedJobTasks.length === 0 ? (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          No tasks found
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {expandedJobTasks.map((task) => (
                            <div
                              key={task.id}
                              className="flex items-center gap-3 p-2 rounded bg-background border text-sm"
                            >
                              <Badge
                                variant={statusColors[task.status] || "default"}
                                className="w-20 justify-center"
                              >
                                {task.status}
                              </Badge>
                              <span className="font-mono text-xs flex-1 truncate">
                                {task.email}
                              </span>
                              {task.status === "SUCCESS" && task.password && (
                                <span className="text-xs text-green-600">
                                  pw: {task.password}
                                </span>
                              )}
                              {task.status === "FAILED" && task.errorMessage && (
                                <span className="text-xs text-red-600 truncate max-w-48">
                                  {task.errorMessage}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {task.imapSource}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
