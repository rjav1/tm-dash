"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
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
  Settings,
  Plus,
  Send,
  Eye,
  EyeOff,
  History,
  Zap,
  Download,
  Upload,
  FileText,
  CreditCard,
  Activity,
  X,
  Check,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Types
interface CheckoutJob {
  id: string;
  discordMsgId: string | null;
  targetUrl: string;
  status: string;
  workerId: string | null;
  attemptCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: number | null;
  eventName: string | null;
  tmEventId: string | null;
  venue: string | null;
  eventDate: string | null;
  section: string | null;
  row: string | null;
  seats: string | null;
  quantity: number;
  priceEach: number | null;
  totalPrice: number | null;
  currency: string | null;
  accountId: string | null;
  cardId: string | null;
  accountEmail: string | null;
  cardLast4: string | null;
  finalUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  tmOrderNumber: string | null;
  imported: boolean;
  importedAt: string | null;
  purchaseId: string | null;
  runId: string | null;
  account?: { id: string; email: string; status: string } | null;
  card?: { id: string; cardNumber: string; cardType: string; billingName: string } | null;
}

interface CheckoutRun {
  id: string;
  workerId: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  jobsQueued: number;
  jobsSuccess: number;
  jobsFailed: number;
  jobsReview: number;
  _count?: { jobs: number };
}

interface WorkerRun {
  id: string;
  workerId: string;
  startedAt: string;
  lastHeartbeat?: string | null;
  jobsProcessed: number;
  jobsSuccess: number;
  jobsFailed: number;
  isStale?: boolean;
  currentJob?: {
    eventName?: string;
    section?: string;
    row?: string;
    cardLast4?: string;
    status?: string;
    startedAt?: string;
  } | null;
}

interface CheckoutStats {
  period: string;
  overview: {
    total: number;
    queued: number;
    running: number;
    success: number;
    failed: number;
    needsReview: number;
    cancelled: number;
    successRate: number;
  };
  imports: {
    imported: number;
    pendingImport: number;
  };
  workers: {
    active: number;
    runs: WorkerRun[];
    runningJobs?: number;
  };
  cards: {
    available: number;
    used: number;
    declined: number;
  };
  revenue: {
    totalValue: number;
    successfulCheckouts: number;
  };
  topEvents: Array<{
    eventName: string;
    tmEventId: string;
    count: number;
  }>;
}

interface CheckoutConfig {
  discord_token?: string;
  discord_watch_channel_ids?: string[];
  discord_allowed_author_ids?: string[];
  navigation_timeout?: number;
  redirect_timeout?: number;
  success_timeout?: number;
  max_retries?: number;
  auto_link_cards?: boolean;
  worker_parallelism?: number;
  discord_webhook_success?: string;
  discord_webhook_error?: string;
  discord_webhook_misc?: string;
  headless_mode?: boolean;
  browser_proxy?: string;
}

// Format exact local time with hours, minutes, and seconds
function formatExactTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

// Status badge helper
function getStatusBadge(status: string) {
  switch (status) {
    case "QUEUED":
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><Clock className="w-3 h-3 mr-1" />Queued</Badge>;
    case "RUNNING":
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running</Badge>;
    case "SUCCESS":
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" />Success</Badge>;
    case "FAILED":
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    case "NEEDS_REVIEW":
      return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200"><AlertTriangle className="w-3 h-3 mr-1" />Review</Badge>;
    case "CANCELLED":
      return <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200"><X className="w-3 h-3 mr-1" />Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function CheckoutPage() {
  const { toast } = useToast();
  
  // Tab state
  const [activeTab, setActiveTab] = useState("monitor");
  
  // Data state
  const [jobs, setJobs] = useState<CheckoutJob[]>([]);
  const [runs, setRuns] = useState<CheckoutRun[]>([]);
  const [stats, setStats] = useState<CheckoutStats | null>(null);
  const [config, setConfig] = useState<CheckoutConfig>({});
  const [loading, setLoading] = useState(true);
  
  // UI state
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({});
  const [failedExpanded, setFailedExpanded] = useState(true);
  
  // Control state
  const [isPaused, setIsPaused] = useState(false);
  const [isControlLoading, setIsControlLoading] = useState<string | null>(null);
  const [activeWorkerCount, setActiveWorkerCount] = useState(0);
  
  // Realtime state
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  
  // Auto-save debounce refs
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingConfigRef = useRef<CheckoutConfig | null>(null);
  
  // Fetch functions
  const fetchJobs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      
      const res = await fetch(`/api/checkout/jobs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch jobs");
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch (error) {
      console.error("Error fetching jobs:", error);
    }
  }, [statusFilter]);
  
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/checkout/stats?period=today");
      if (!res.ok) throw new Error("Failed to fetch stats");
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  }, []);
  
  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/checkout/runs?limit=20");
      if (!res.ok) throw new Error("Failed to fetch runs");
      const data = await res.json();
      setRuns(data.runs || []);
    } catch (error) {
      console.error("Error fetching runs:", error);
    }
  }, []);
  
  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/checkout/config");
      if (!res.ok) throw new Error("Failed to fetch config");
      const data = await res.json();
      setConfig(data.config || {});
    } catch (error) {
      console.error("Error fetching config:", error);
    }
  }, []);
  
  // Fetch control state
  const fetchControlState = useCallback(async () => {
    try {
      const res = await fetch("/api/checkout/control");
      if (!res.ok) return;
      const data = await res.json();
      setIsPaused(data.paused || false);
      setActiveWorkerCount(data.activeWorkers || 0);
    } catch (error) {
      console.error("Error fetching control state:", error);
    }
  }, []);
  
  // Initial data fetch
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      await Promise.all([fetchJobs(), fetchStats(), fetchRuns(), fetchConfig(), fetchControlState()]);
      setLoading(false);
    };
    fetchAll();
  }, [fetchJobs, fetchStats, fetchRuns, fetchConfig, fetchControlState]);
  
  // Refetch jobs when filter changes
  useEffect(() => {
    fetchJobs();
  }, [statusFilter, fetchJobs]);
  
  // Setup Supabase Realtime
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }
    
    const supabase = getSupabase();
    if (!supabase) return;
    
    const channel = supabase
      .channel("checkout-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "checkout_jobs",
        },
        () => {
          // Refetch jobs and stats on any change
          fetchJobs();
          fetchStats();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "checkout_runs",
        },
        () => {
          // Refetch stats and runs when worker status changes (heartbeat, start, stop)
          fetchStats();
          fetchRuns();
        }
      )
      .subscribe((status) => {
        setIsRealtimeConnected(status === "SUBSCRIBED");
      });
    
    channelRef.current = channel;
    
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchJobs, fetchStats, fetchRuns]);
  
  // Import handlers
  const handleImportSelected = async () => {
    if (selectedJobs.size === 0) return;
    
    setIsImporting(true);
    try {
      const res = await fetch("/api/checkout/jobs/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds: Array.from(selectedJobs) }),
      });
      
      if (!res.ok) throw new Error("Import failed");
      
      const data = await res.json();
      toast({
        title: "Import Complete",
        description: `Imported ${data.imported} of ${data.imported + data.failed} jobs`,
      });
      
      setSelectedJobs(new Set());
      fetchJobs();
      fetchStats();
    } catch (error) {
      toast({
        title: "Import Failed",
        description: "Failed to import selected jobs",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };
  
  const handleImportAll = async () => {
    setIsImporting(true);
    try {
      const res = await fetch("/api/checkout/jobs/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importAll: true }),
      });
      
      if (!res.ok) throw new Error("Import failed");
      
      const data = await res.json();
      toast({
        title: "Import Complete",
        description: `Imported ${data.imported} jobs (${data.failed} failed)`,
      });
      
      fetchJobs();
      fetchStats();
    } catch (error) {
      toast({
        title: "Import Failed",
        description: "Failed to import jobs",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };
  
  // Cancel job
  const handleCancelJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/checkout/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      
      if (!res.ok) throw new Error("Cancel failed");
      
      toast({ title: "Job Cancelled" });
      fetchJobs();
      fetchStats();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to cancel job",
        variant: "destructive",
      });
    }
  };
  
  // Delete job
  const handleDeleteJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/checkout/jobs/${jobId}`, {
        method: "DELETE",
      });
      
      if (!res.ok) throw new Error("Delete failed");
      
      toast({ title: "Job Deleted" });
      fetchJobs();
      fetchStats();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete job",
        variant: "destructive",
      });
    }
  };
  
  // Auto-save config with debounce
  const saveConfig = useCallback(async (configToSave: CheckoutConfig) => {
    setIsSavingConfig(true);
    try {
      const res = await fetch("/api/checkout/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configToSave),
      });
      
      if (!res.ok) throw new Error("Save failed");
      
      // Silent save - no toast for auto-save
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save configuration",
        variant: "destructive",
      });
    } finally {
      setIsSavingConfig(false);
    }
  }, [toast]);
  
  // Update config with auto-save (debounced)
  const updateConfig = useCallback((updates: Partial<CheckoutConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    pendingConfigRef.current = newConfig;
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Set new debounced save (save after 500ms of no changes)
    saveTimeoutRef.current = setTimeout(() => {
      if (pendingConfigRef.current) {
        saveConfig(pendingConfigRef.current);
        pendingConfigRef.current = null;
      }
    }, 500);
  }, [config, saveConfig]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        // Save any pending changes on unmount
        if (pendingConfigRef.current) {
          saveConfig(pendingConfigRef.current);
        }
      }
    };
  }, [saveConfig]);
  
  // Test webhook
  const handleTestWebhook = async (webhookKey: string) => {
    const url = config[webhookKey as keyof CheckoutConfig] as string;
    if (!url) {
      toast({
        title: "No URL",
        description: "Enter a webhook URL first",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const type = webhookKey.includes("success") ? "success" : webhookKey.includes("error") ? "error" : "misc";
      const res = await fetch("/api/checkout/config/test-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: url, type }),
      });
      
      if (!res.ok) throw new Error("Test failed");
      
      toast({ title: "Test message sent!" });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send test message",
        variant: "destructive",
      });
    }
  };
  
  // Control actions
  const handleControl = async (action: string, extra?: Record<string, unknown>) => {
    setIsControlLoading(action);
    try {
      const res = await fetch("/api/checkout/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      
      if (!res.ok) throw new Error("Control action failed");
      
      const data = await res.json();
      
      // Update local state based on action
      if (action === "pause") setIsPaused(true);
      if (action === "resume") setIsPaused(false);
      
      // Update worker count optimistically when scaling
      if (action === "scale_workers" && extra?.workerCount !== undefined) {
        setConfig(prev => ({ ...prev, worker_parallelism: extra.workerCount as number }));
      }
      
      toast({ title: data.message || "Action completed" });
      
      // Refresh data
      fetchJobs();
      fetchStats();
      fetchRuns();
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${action}`,
        variant: "destructive",
      });
    } finally {
      setIsControlLoading(null);
    }
  };
  
  const handleExport = () => {
    // Open export URL in new tab to trigger download
    window.open("/api/checkout/export", "_blank");
    toast({ title: "Export started" });
  };
  
  // Toggles for selection
  const toggleJobSelection = (jobId: string) => {
    const newSelection = new Set(selectedJobs);
    if (newSelection.has(jobId)) {
      newSelection.delete(jobId);
    } else {
      newSelection.add(jobId);
    }
    setSelectedJobs(newSelection);
  };
  
  const selectAllSuccessNotImported = () => {
    const eligibleJobs = jobs.filter(j => j.status === "SUCCESS" && !j.imported);
    setSelectedJobs(new Set(eligibleJobs.map(j => j.id)));
  };
  
  // Jobs ready for import
  const importableJobs = jobs.filter(j => j.status === "SUCCESS" && !j.imported);
  
  // Compute if any workers are truly online (connected and not stale)
  const hasActiveWorkers = useMemo(() => {
    if (!stats?.workers?.runs) return false;
    return stats.workers.runs.some(w => !w.isStale);
  }, [stats?.workers?.runs]);
  
  // Controls are disabled only if NO workers are active
  // (Realtime connection is just for live updates, not worker availability)
  const isOffline = !hasActiveWorkers;
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Checkout</h1>
          <p className="text-muted-foreground">Monitor and manage automated checkouts</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Worker status - primary indicator */}
          {hasActiveWorkers ? (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <Activity className="w-3 h-3 mr-1" />
              Workers Online ({stats?.workers?.runs?.filter(w => !w.isStale).length || 0})
            </Badge>
          ) : stats?.workers?.runs && stats.workers.runs.length > 0 ? (
            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
              <WifiOff className="w-3 h-3 mr-1" />Workers Stale
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-gray-50 text-gray-500">
              <WifiOff className="w-3 h-3 mr-1" />No Workers
            </Badge>
          )}
          {/* Supabase realtime connection - secondary indicator */}
          <span className={`w-2 h-2 rounded-full ${isRealtimeConnected ? "bg-green-500" : "bg-gray-300"}`} title={isRealtimeConnected ? "Realtime connected" : "Realtime disconnected"} />
        </div>
      </div>
      
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.overview.queued}</div>
              <div className="text-sm text-muted-foreground">Queued</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-yellow-600">{stats.overview.running}</div>
              <div className="text-sm text-muted-foreground">Running</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">{stats.overview.success}</div>
              <div className="text-sm text-muted-foreground">Success</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-red-600">{stats.overview.failed}</div>
              <div className="text-sm text-muted-foreground">Failed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.overview.successRate}%</div>
              <div className="text-sm text-muted-foreground">Success Rate</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-purple-600">{stats.imports.pendingImport}</div>
              <div className="text-sm text-muted-foreground">Ready to Import</div>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="monitor"><Activity className="w-4 h-4 mr-2" />Monitor</TabsTrigger>
          <TabsTrigger value="import"><Download className="w-4 h-4 mr-2" />Import</TabsTrigger>
          <TabsTrigger value="history"><History className="w-4 h-4 mr-2" />History</TabsTrigger>
          <TabsTrigger value="config"><Settings className="w-4 h-4 mr-2" />Configuration</TabsTrigger>
        </TabsList>
        
        {/* Monitor Tab */}
        <TabsContent value="monitor">
          {/* Failed Jobs Section */}
          {jobs.filter(j => j.status === "FAILED" || j.status === "NEEDS_REVIEW").length > 0 && (
            <Card className="mb-4 border-red-200">
              <CardHeader 
                className="cursor-pointer select-none" 
                onClick={() => setFailedExpanded(!failedExpanded)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-red-600 flex items-center gap-2">
                      <AlertCircle className="w-5 h-5" />
                      Failed Jobs ({jobs.filter(j => j.status === "FAILED" || j.status === "NEEDS_REVIEW").length})
                    </CardTitle>
                  </div>
                  <ChevronDown className={`w-5 h-5 transition-transform ${failedExpanded ? "rotate-180" : ""}`} />
                </div>
              </CardHeader>
              {failedExpanded && (
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead>Card</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Failed At</TableHead>
                        <TableHead className="w-24">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.filter(j => j.status === "FAILED" || j.status === "NEEDS_REVIEW").map((job) => (
                        <TableRow key={job.id}>
                          <TableCell>
                            <div className="font-medium">{job.eventName || "Unknown Event"}</div>
                            <div className="text-xs text-muted-foreground">{job.section && job.row ? `${job.section} / ${job.row}` : ""}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-red-600 text-sm font-medium">{job.errorCode || "Unknown"}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={job.errorMessage || ""}>{job.errorMessage || ""}</div>
                          </TableCell>
                          <TableCell>
                            {job.cardLast4 ? `****${job.cardLast4}` : "-"}
                          </TableCell>
                          <TableCell>{getStatusBadge(job.status)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{job.completedAt ? formatDate(job.completedAt) : "-"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleControl("priority_retry", { jobId: job.id })}
                                disabled={isControlLoading !== null}
                              >
                                <RefreshCw className="w-3 h-3 mr-1" />
                                Retry
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                title="Delete" 
                                onClick={() => handleDeleteJob(job.id)}
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              )}
            </Card>
          )}
          
          {/* Active Workers Panel */}
          {stats?.workers?.runs && stats.workers.runs.length > 0 && (
            <Card className={`mb-4 ${hasActiveWorkers ? "border-green-200" : "border-yellow-200"}`}>
              <CardHeader className="pb-2">
                <CardTitle className={`flex items-center gap-2 ${hasActiveWorkers ? "text-green-700" : "text-yellow-700"}`}>
                  <Activity className="w-5 h-5" />
                  {hasActiveWorkers ? `Active Workers (${stats.workers.runs.filter(w => !w.isStale).length})` : "Workers (Stale)"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {stats.workers.runs.map((worker: WorkerRun) => (
                    <div key={worker.id} className={`flex items-center justify-between p-3 rounded-lg ${worker.isStale ? "bg-yellow-50 border border-yellow-200" : "bg-muted/50"}`}>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          {worker.isStale ? (
                            <div className="w-2 h-2 bg-yellow-500 rounded-full" title="Worker may be disconnected" />
                          ) : (
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                          )}
                          <span className="font-mono text-sm font-medium">{worker.workerId}</span>
                          {worker.isStale && (
                            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Stale
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm">
                          {worker.currentJob ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="w-3 h-3 animate-spin text-yellow-600" />
                              <span className="font-medium">{worker.currentJob.eventName || "Processing..."}</span>
                              {worker.currentJob.section && (
                                <span className="text-muted-foreground">({worker.currentJob.section}/{worker.currentJob.row})</span>
                              )}
                              {worker.currentJob.cardLast4 && (
                                <Badge variant="outline" className="text-xs">****{worker.currentJob.cardLast4}</Badge>
                              )}
                              {worker.currentJob.status && (
                                <span className="text-xs text-muted-foreground italic">{worker.currentJob.status}</span>
                              )}
                            </div>
                          ) : worker.isStale ? (
                            <span className="text-yellow-600">
                              No heartbeat {worker.lastHeartbeat ? `since ${formatExactTime(worker.lastHeartbeat)}` : "- never connected"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Idle - waiting for jobs</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-green-600" />
                          <span className="text-green-600">{worker.jobsSuccess}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <XCircle className="w-3 h-3 text-red-600" />
                          <span className="text-red-600">{worker.jobsFailed}</span>
                        </div>
                        <span className="text-muted-foreground text-xs">
                          since {formatExactTime(worker.startedAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Control Panel */}
          <Card className={`mb-4 ${isOffline ? "opacity-60" : ""}`}>
            <CardContent className="pt-4">
              {isOffline && (
                <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2 text-yellow-700 text-sm">
                  <WifiOff className="w-4 h-4" />
                  <span>Workers offline - controls disabled. Start the checkout daemon on your VPS.</span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {/* Pause/Resume */}
                {isPaused ? (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleControl("resume")}
                    disabled={isControlLoading !== null || isOffline}
                    title={isOffline ? "Workers offline" : "Resume workers"}
                  >
                    {isControlLoading === "resume" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
                    Resume
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleControl("pause")}
                    disabled={isControlLoading !== null || isOffline}
                  >
                    {isControlLoading === "pause" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Square className="w-4 h-4 mr-1" />}
                    Pause
                  </Button>
                )}
                
                {/* Skip Running */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleControl("skip")}
                  disabled={isControlLoading !== null || isOffline || (stats?.overview.running || 0) === 0}
                >
                  {isControlLoading === "skip" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <X className="w-4 h-4 mr-1" />}
                  Skip Running
                </Button>
                
                {/* Retry Failed - keep enabled even offline since it just modifies DB */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleControl("retry_all")}
                  disabled={isControlLoading !== null || (stats?.overview.failed || 0) === 0}
                >
                  {isControlLoading === "retry_all" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                  Retry All Failed
                </Button>
                
                {/* Clear Queue - keep enabled even offline */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (confirm("Clear all non-imported jobs from queue?")) {
                      handleControl("clear");
                    }
                  }}
                  disabled={isControlLoading !== null}
                >
                  {isControlLoading === "clear" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                  Clear Queue
                </Button>
                
                {/* Export */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                >
                  <FileText className="w-4 h-4 mr-1" />
                  Export CSV
                </Button>
                
                {/* Spacer */}
                <div className="flex-1" />
                
                {/* Worker Count */}
                <div className={`flex items-center gap-2 ${isOffline ? "opacity-50" : ""}`}>
                  <span className="text-sm text-muted-foreground">Workers:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleControl("scale_workers", { workerCount: Math.max(1, (config.worker_parallelism || 1) - 1) })}
                    disabled={isControlLoading !== null || isOffline || (config.worker_parallelism || 1) <= 1}
                  >
                    -
                  </Button>
                  <span className="font-mono w-6 text-center">{config.worker_parallelism || 1}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleControl("scale_workers", { workerCount: Math.min(10, (config.worker_parallelism || 1) + 1) })}
                    disabled={isControlLoading !== null || isOffline || (config.worker_parallelism || 1) >= 10}
                  >
                    +
                  </Button>
                </div>
                
                {/* Status indicator */}
                {isPaused && (
                  <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                    <Square className="w-3 h-3 mr-1" />
                    Paused
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Job Queue</CardTitle>
                  <CardDescription>Live view of checkout jobs</CardDescription>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="QUEUED">Queued</SelectItem>
                    <SelectItem value="RUNNING">Running</SelectItem>
                    <SelectItem value="SUCCESS">Success</SelectItem>
                    <SelectItem value="FAILED">Failed</SelectItem>
                    <SelectItem value="NEEDS_REVIEW">Needs Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No checkout jobs found</p>
                  <p className="text-sm">Jobs will appear here when Discord messages are processed</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Section/Row</TableHead>
                      <TableHead>Card</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-20">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((job) => (
                      <React.Fragment key={job.id}>
                        <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}>
                          <TableCell>
                            {expandedJobId === job.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{job.eventName || "Unknown Event"}</div>
                            <div className="text-xs text-muted-foreground">{job.venue}</div>
                          </TableCell>
                          <TableCell>
                            {job.section && job.row ? `${job.section} / ${job.row}` : job.section || "-"}
                            {job.quantity > 1 && <span className="text-xs text-muted-foreground ml-1">×{job.quantity}</span>}
                          </TableCell>
                          <TableCell>
                            {job.cardLast4 ? (
                              <div className="flex items-center gap-1">
                                <CreditCard className="w-3 h-3" />
                                ****{job.cardLast4}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>{getStatusBadge(job.status)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(job.createdAt)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {(job.status === "FAILED" || job.status === "NEEDS_REVIEW" || job.status === "CANCELLED") && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  title="Priority Retry"
                                  onClick={(e) => { e.stopPropagation(); handleControl("priority_retry", { jobId: job.id }); }}
                                >
                                  <RefreshCw className="w-4 h-4 text-blue-500" />
                                </Button>
                              )}
                              {job.status === "QUEUED" && (
                                <Button variant="ghost" size="icon" title="Cancel" onClick={(e) => { e.stopPropagation(); handleCancelJob(job.id); }}>
                                  <X className="w-4 h-4" />
                                </Button>
                              )}
                              {!job.imported && job.status !== "RUNNING" && (
                                <Button variant="ghost" size="icon" title="Delete" onClick={(e) => { e.stopPropagation(); handleDeleteJob(job.id); }}>
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedJobId === job.id && (
                          <TableRow>
                            <TableCell colSpan={7} className="bg-muted/30">
                              <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                <div>
                                  <Label className="text-xs text-muted-foreground">Account Email</Label>
                                  <div>{job.accountEmail || "-"}</div>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Total Price</Label>
                                  <div>{job.totalPrice ? `$${job.totalPrice}` : "-"}</div>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Order Number</Label>
                                  <div>{job.tmOrderNumber || "-"}</div>
                                </div>
                                {job.errorCode && (
                                  <div className="col-span-3">
                                    <Label className="text-xs text-muted-foreground">Error</Label>
                                    <div className="text-red-600">{job.errorCode}: {job.errorMessage}</div>
                                  </div>
                                )}
                                {job.finalUrl && (
                                  <div className="col-span-3">
                                    <Label className="text-xs text-muted-foreground">Final URL</Label>
                                    <div className="truncate">
                                      <a href={job.finalUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{job.finalUrl}</a>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Import Tab */}
        <TabsContent value="import">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Import Successful Checkouts</CardTitle>
                  <CardDescription>{importableJobs.length} checkout(s) ready to import as purchases</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={selectAllSuccessNotImported} disabled={importableJobs.length === 0}>
                    Select All ({importableJobs.length})
                  </Button>
                  <Button variant="outline" onClick={handleImportSelected} disabled={selectedJobs.size === 0 || isImporting}>
                    {isImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                    Import Selected ({selectedJobs.size})
                  </Button>
                  <Button onClick={handleImportAll} disabled={importableJobs.length === 0 || isImporting}>
                    {isImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                    Import All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {importableJobs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No checkouts pending import</p>
                  <p className="text-sm">Successful checkouts will appear here for review</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedJobs.size === importableJobs.length && importableJobs.length > 0}
                          onCheckedChange={(checked) => {
                            if (checked) selectAllSuccessNotImported();
                            else setSelectedJobs(new Set());
                          }}
                        />
                      </TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Section/Row</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Card</TableHead>
                      <TableHead>Completed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importableJobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedJobs.has(job.id)}
                            onCheckedChange={() => toggleJobSelection(job.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{job.eventName || "Unknown"}</div>
                          <div className="text-xs text-muted-foreground">{job.venue}</div>
                        </TableCell>
                        <TableCell>{job.section && job.row ? `${job.section} / ${job.row}` : "-"}</TableCell>
                        <TableCell>{job.quantity}</TableCell>
                        <TableCell>{job.totalPrice ? `$${job.totalPrice}` : "-"}</TableCell>
                        <TableCell>****{job.cardLast4 || "????"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{job.completedAt ? formatDate(job.completedAt) : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Worker Runs</CardTitle>
              <CardDescription>History of checkout worker sessions</CardDescription>
            </CardHeader>
            <CardContent>
              {runs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No worker runs yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Worker ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Ended</TableHead>
                      <TableHead>Success</TableHead>
                      <TableHead>Failed</TableHead>
                      <TableHead>Review</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell className="font-mono text-sm">{run.workerId}</TableCell>
                        <TableCell>
                          {run.status === "RUNNING" ? (
                            <Badge variant="outline" className="bg-yellow-50 text-yellow-700"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running</Badge>
                          ) : run.status === "COMPLETED" ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700"><Check className="w-3 h-3 mr-1" />Completed</Badge>
                          ) : (
                            <Badge variant="outline">{run.status}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(run.startedAt)}</TableCell>
                        <TableCell className="text-sm">{run.endedAt ? formatDate(run.endedAt) : "-"}</TableCell>
                        <TableCell className="text-green-600">{run.jobsSuccess}</TableCell>
                        <TableCell className="text-red-600">{run.jobsFailed}</TableCell>
                        <TableCell className="text-orange-600">{run.jobsReview}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Config Tab */}
        <TabsContent value="config">
          <div className="grid gap-6">
            {/* Discord Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Discord Settings</CardTitle>
                <CardDescription>Configure Discord bot and channel settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Discord Bot Token</Label>
                  <div className="flex gap-2">
                    <Input
                      type={showApiKeys.discord_token ? "text" : "password"}
                      value={config.discord_token || ""}
                      onChange={(e) => updateConfig({ discord_token: e.target.value })}
                      placeholder="Bot token..."
                    />
                    <Button variant="outline" size="icon" onClick={() => setShowApiKeys({ ...showApiKeys, discord_token: !showApiKeys.discord_token })}>
                      {showApiKeys.discord_token ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Changes auto-save</p>
                </div>
                <div className="space-y-2">
                  <Label>Watch Channel IDs (comma-separated)</Label>
                  <Input
                    value={(config.discord_watch_channel_ids || []).join(", ")}
                    onChange={(e) => updateConfig({
                      discord_watch_channel_ids: e.target.value.split(",").map(s => s.trim()).filter(Boolean),
                    })}
                    placeholder="123456789, 987654321"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Allowed Author IDs (comma-separated, empty = all)</Label>
                  <Input
                    value={(config.discord_allowed_author_ids || []).join(", ")}
                    onChange={(e) => updateConfig({
                      discord_allowed_author_ids: e.target.value.split(",").map(s => s.trim()).filter(Boolean),
                    })}
                    placeholder="Leave empty to allow all"
                  />
                </div>
              </CardContent>
            </Card>
            
            {/* Worker Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Worker Settings</CardTitle>
                <CardDescription>Configure checkout worker behavior</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Max Retries</Label>
                    <Input
                      type="number"
                      value={config.max_retries || 3}
                      onChange={(e) => updateConfig({ max_retries: parseInt(e.target.value) || 3 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Worker Parallelism</Label>
                    <Input
                      type="number"
                      value={config.worker_parallelism || 1}
                      onChange={(e) => updateConfig({ worker_parallelism: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Navigation Timeout (ms)</Label>
                    <Input
                      type="number"
                      value={config.navigation_timeout || 30000}
                      onChange={(e) => updateConfig({ navigation_timeout: parseInt(e.target.value) || 30000 })}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Auto-Link Cards</Label>
                    <p className="text-xs text-muted-foreground">Automatically link unlinked cards to accounts</p>
                  </div>
                  <Switch
                    checked={config.auto_link_cards !== false}
                    onCheckedChange={(checked) => updateConfig({ auto_link_cards: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Headless Mode</Label>
                    <p className="text-xs text-muted-foreground">Run browser without visible window</p>
                  </div>
                  <Switch
                    checked={config.headless_mode === true}
                    onCheckedChange={(checked) => updateConfig({ headless_mode: checked })}
                  />
                </div>
              </CardContent>
            </Card>
            
            {/* Discord Webhooks */}
            <Card>
              <CardHeader>
                <CardTitle>Discord Webhooks</CardTitle>
                <CardDescription>Configure notification webhooks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { key: "discord_webhook_success", label: "Success Webhook" },
                  { key: "discord_webhook_error", label: "Error Webhook" },
                  { key: "discord_webhook_misc", label: "Misc Webhook" },
                ].map(({ key, label }) => (
                  <div key={key} className="space-y-2">
                    <Label>{label}</Label>
                    <div className="flex gap-2">
                      <Input
                        type={showApiKeys[key] ? "text" : "password"}
                        value={(config as Record<string, unknown>)[key] as string || ""}
                        onChange={(e) => updateConfig({ [key]: e.target.value } as Partial<CheckoutConfig>)}
                        placeholder="https://discord.com/api/webhooks/..."
                      />
                      <Button variant="outline" size="icon" onClick={() => setShowApiKeys({ ...showApiKeys, [key]: !showApiKeys[key] })}>
                        {showApiKeys[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => handleTestWebhook(key)}>
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            
            {/* Save Status */}
            <div className="flex justify-end items-center gap-2 text-sm text-muted-foreground">
              {isSavingConfig ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-green-600" />
                  All changes auto-saved
                </>
              )}
            </div>
            
            {/* Danger Zone */}
            <Card className="border-red-200 mt-6">
              <CardHeader>
                <CardTitle className="text-red-600">Danger Zone</CardTitle>
                <CardDescription>These actions cannot be undone</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Clear All Checkout Data</p>
                    <p className="text-sm text-muted-foreground">Delete all jobs and worker runs from the database</p>
                  </div>
                  <Button 
                    variant="destructive" 
                    onClick={() => {
                      if (confirm("Are you sure you want to delete ALL checkout jobs and worker runs? This cannot be undone.")) {
                        handleControl("clear_all_data");
                      }
                    }}
                    disabled={isControlLoading !== null}
                  >
                    {isControlLoading === "clear_all_data" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                    Clear All Data
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
