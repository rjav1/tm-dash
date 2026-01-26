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
  Radio,
  X,
  Check,
  AlertTriangle,
  StopCircle,
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
  activeWorkerCount?: number;
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

interface WorkerThread {
  id: string;
  runId: string;
  workerName: string;
  deviceName: string;
  status: string; // IDLE, PROCESSING, PAUSED, STOPPED
  currentJobId?: string | null;
  currentEvent?: string | null;
  lastHeartbeat: string;
  startedAt: string;
  jobsCompleted: number;
  jobsFailed: number;
  isStale?: boolean;
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
    totalThreads?: number;
    runs: WorkerRun[];
    threads?: WorkerThread[];
    runningJobs?: number;
  };
  listener: {
    online: boolean;
    lastSeen: string | null;
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
  amex_only?: boolean;
  worker_parallelism?: number;
  discord_webhook_success?: string;
  discord_webhook_error?: string;
  discord_webhook_misc?: string;
  headless_mode?: boolean;
  browser_proxy?: string;
  dashboard_api_url?: string;
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

// Format expiration countdown from Unix timestamp
function formatExpiration(expiresAt: number | null): { text: string; isExpired: boolean; isUrgent: boolean; secondsLeft: number } {
  if (!expiresAt) {
    return { text: "-", isExpired: false, isUrgent: false, secondsLeft: 0 };
  }
  
  const now = Math.floor(Date.now() / 1000);
  const secondsLeft = expiresAt - now;
  
  if (secondsLeft <= 0) {
    return { text: "Expired", isExpired: true, isUrgent: false, secondsLeft: 0 };
  }
  
  // Less than 2 minutes is urgent
  const isUrgent = secondsLeft < 120;
  
  // Format as countdown
  if (secondsLeft < 60) {
    return { text: `${secondsLeft}s`, isExpired: false, isUrgent, secondsLeft };
  } else if (secondsLeft < 3600) {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    return { text: `${mins}m ${secs}s`, isExpired: false, isUrgent, secondsLeft };
  } else {
    const hours = Math.floor(secondsLeft / 3600);
    const mins = Math.floor((secondsLeft % 3600) / 60);
    return { text: `${hours}h ${mins}m`, isExpired: false, isUrgent: false, secondsLeft };
  }
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
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set()); // For import tab
  const [selectedQueueJobs, setSelectedQueueJobs] = useState<Set<string>>(new Set()); // For job queue multi-select
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [expandedFailedJobId, setExpandedFailedJobId] = useState<string | null>(null);
  const [expandedSuccessJobId, setExpandedSuccessJobId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  
  // Timer for expiration countdowns (forces re-render every second when jobs have expiration times)
  const [, setCountdownTick] = useState(0);
  
  // Effect to tick countdown every second when there are active jobs with expiresAt
  useEffect(() => {
    const hasActiveExpiration = jobs.some(
      job => job.expiresAt && (job.status === "QUEUED" || job.status === "RUNNING")
    );
    
    if (!hasActiveExpiration) return;
    
    const interval = setInterval(() => {
      setCountdownTick(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [jobs]);
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({});
  const [failedExpanded, setFailedExpanded] = useState(true);
  const [successExpanded, setSuccessExpanded] = useState(true);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "checkout_workers",
        },
        () => {
          // Refetch stats when individual worker status changes
          fetchStats();
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
  
  // Fallback polling when realtime is not connected
  // This ensures dashboard updates even if Supabase Realtime isn't working
  useEffect(() => {
    // Skip polling if realtime is connected
    if (isRealtimeConnected) return;
    
    // Poll every 5 seconds as fallback
    const interval = setInterval(() => {
      fetchJobs();
      fetchStats();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isRealtimeConnected, fetchJobs, fetchStats]);
  
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
  
  // Bulk retry selected jobs
  const handleBulkRetry = async () => {
    if (selectedQueueJobs.size === 0) return;
    
    setIsControlLoading("bulk_retry");
    try {
      const jobIds = Array.from(selectedQueueJobs);
      let retried = 0;
      
      for (const jobId of jobIds) {
        const res = await fetch("/api/checkout/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "priority_retry", jobId }),
        });
        if (res.ok) retried++;
      }
      
      toast({ title: `Retried ${retried} job(s)` });
      setSelectedQueueJobs(new Set());
      fetchJobs();
      fetchStats();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to retry jobs",
        variant: "destructive",
      });
    } finally {
      setIsControlLoading(null);
    }
  };
  
  // Bulk cancel/skip selected jobs
  const handleBulkCancel = async () => {
    if (selectedQueueJobs.size === 0) return;
    
    setIsControlLoading("bulk_cancel");
    try {
      const jobIds = Array.from(selectedQueueJobs);
      let cancelled = 0;
      
      for (const jobId of jobIds) {
        const res = await fetch(`/api/checkout/jobs/${jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CANCELLED" }),
        });
        if (res.ok) cancelled++;
      }
      
      toast({ title: `Cancelled ${cancelled} job(s)` });
      setSelectedQueueJobs(new Set());
      fetchJobs();
      fetchStats();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to cancel jobs",
        variant: "destructive",
      });
    } finally {
      setIsControlLoading(null);
    }
  };
  
  // Select all jobs matching current filter
  const selectAllQueueJobs = () => {
    setSelectedQueueJobs(new Set(jobs.map(j => j.id)));
  };
  
  // Clear queue selection
  const clearQueueSelection = () => {
    setSelectedQueueJobs(new Set());
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
  
  // Computed job lists for different sections
  const failedJobs = useMemo(() => 
    jobs.filter(j => j.status === "FAILED" || j.status === "NEEDS_REVIEW"), 
    [jobs]
  );
  const successfulJobs = useMemo(() => 
    jobs.filter(j => j.status === "SUCCESS"), 
    [jobs]
  );
  const queuedJobs = useMemo(() => 
    jobs.filter(j => j.status === "QUEUED" || j.status === "RUNNING"), 
    [jobs]
  );
  
  // Compute if any workers are truly online (connected and not stale)
  const hasActiveWorkers = useMemo(() => {
    // Prefer threads if available
    if (stats?.workers?.threads && stats.workers.threads.length > 0) {
      return stats.workers.threads.some((t: WorkerThread) => !t.isStale);
    }
    // Fallback to runs
    if (!stats?.workers?.runs) return false;
    return stats.workers.runs.some((w: WorkerRun) => !w.isStale);
  }, [stats?.workers?.threads, stats?.workers?.runs]);
  
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
          {/* Discord Listener status */}
          {stats?.listener?.online ? (
            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
              <Radio className="w-3 h-3 mr-1" />
              Listener
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-gray-50 text-gray-500" title={stats?.listener?.lastSeen ? `Last seen: ${formatExactTime(stats.listener.lastSeen)}` : "Never connected"}>
              <Radio className="w-3 h-3 mr-1" />
              Listener Offline
            </Badge>
          )}
          {/* Worker status - primary indicator (show total threads, not just daemons) */}
          {hasActiveWorkers ? (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <Activity className="w-3 h-3 mr-1" />
              Workers ({stats?.workers?.threads?.filter((t: WorkerThread) => !t.isStale).length || stats?.workers?.runs?.filter((w: WorkerRun) => !w.isStale).reduce((sum: number, w: WorkerRun) => sum + (w.activeWorkerCount || 1), 0) || 0})
            </Badge>
          ) : (stats?.workers?.runs && stats.workers.runs.length > 0) || (stats?.workers?.threads && stats.workers.threads.length > 0) ? (
            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
              <WifiOff className="w-3 h-3 mr-1" />Workers Stale
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-gray-50 text-gray-500">
              <WifiOff className="w-3 h-3 mr-1" />No Workers
            </Badge>
          )}
          {/* Supabase realtime connection indicator */}
          {isRealtimeConnected ? (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />
              Live
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200 text-xs" title="Realtime not connected, polling every 5s">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 mr-1.5" />
              Polling
            </Badge>
          )}
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
          {failedJobs.length > 0 && (
            <Card className="mb-4 border-red-200">
              <CardHeader 
                className="cursor-pointer select-none" 
                onClick={() => setFailedExpanded(!failedExpanded)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-red-600 flex items-center gap-2">
                      <AlertCircle className="w-5 h-5" />
                      Failed Jobs ({failedJobs.length})
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
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Card</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Failed At</TableHead>
                        <TableHead className="w-24">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {failedJobs.map((job) => (
                        <React.Fragment key={job.id}>
                          <TableRow 
                            className="cursor-pointer hover:bg-muted/50" 
                            onClick={() => setExpandedFailedJobId(expandedFailedJobId === job.id ? null : job.id)}
                          >
                            <TableCell>
                              {expandedFailedJobId === job.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{job.eventName || "Unknown Event"}</div>
                              <div className="text-xs text-muted-foreground">{job.section && job.row ? `${job.section} / ${job.row}` : ""}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-red-600 text-sm font-medium">{job.errorCode || "Unknown"}</div>
                              <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={job.errorMessage || ""}>{job.errorMessage || ""}</div>
                            </TableCell>
                            <TableCell className="text-center">{job.quantity || 1}</TableCell>
                            <TableCell>
                              {job.cardLast4 ? `****${job.cardLast4}` : "-"}
                            </TableCell>
                            <TableCell>{getStatusBadge(job.status)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{job.completedAt ? formatDate(job.completedAt) : "-"}</TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
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
                          {expandedFailedJobId === job.id && (
                            <TableRow>
                              <TableCell colSpan={8} className="bg-muted/30">
                                <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                  <div>
                                    <Label className="text-xs text-muted-foreground">TM Event ID</Label>
                                    <div className="font-mono text-xs">{job.tmEventId || "-"}</div>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Event Date</Label>
                                    <div>{job.eventDate || "-"}</div>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Account Email</Label>
                                    <div>{job.accountEmail || "-"}</div>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Total Price</Label>
                                    <div>{job.totalPrice ? `$${job.totalPrice}` : "-"}</div>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Venue</Label>
                                    <div>{job.venue || "-"}</div>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Seats</Label>
                                    <div>{job.seats || "-"}</div>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Attempts</Label>
                                    <div>{job.attemptCount}</div>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Worker</Label>
                                    <div className="font-mono text-xs">{job.workerId || "-"}</div>
                                  </div>
                                  <div className="col-span-4">
                                    <Label className="text-xs text-muted-foreground">Full Error</Label>
                                    <div className="text-red-600">{job.errorCode}: {job.errorMessage}</div>
                                  </div>
                                  {job.targetUrl && (
                                    <div className="col-span-4">
                                      <Label className="text-xs text-muted-foreground">Target URL</Label>
                                      <div className="truncate">
                                        <a href={job.targetUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{job.targetUrl}</a>
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
                </CardContent>
              )}
            </Card>
          )}
          {/* Active Workers Panel - Individual Threads */}
          {(() => {
            const threads = stats?.workers?.threads || [];
            const activeThreads = threads.filter((t: WorkerThread) => !t.isStale);
            const hasThreads = threads.length > 0;
            
            // Group threads by device name
            const groupedThreads: Record<string, WorkerThread[]> = {};
            threads.forEach((t: WorkerThread) => {
              if (!groupedThreads[t.deviceName]) {
                groupedThreads[t.deviceName] = [];
              }
              groupedThreads[t.deviceName].push(t);
            });
            
            // Fallback to old run-based display if no threads data
            if (!hasThreads && stats?.workers?.runs && stats.workers.runs.length > 0) {
              const totalThreads = stats.workers.runs
                .filter((w: WorkerRun) => !w.isStale)
                .reduce((sum: number, w: WorkerRun) => sum + (w.activeWorkerCount || 1), 0);
              
              return (
                <Card className={`mb-4 ${hasActiveWorkers ? "border-green-200" : "border-yellow-200"}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className={`flex items-center gap-2 ${hasActiveWorkers ? "text-green-700" : "text-yellow-700"}`}>
                      <Activity className="w-5 h-5" />
                      {hasActiveWorkers ? `Active Workers (${totalThreads})` : "Workers (Stale)"}
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
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                                {worker.activeWorkerCount || 1} thread{(worker.activeWorkerCount || 1) > 1 ? "s" : ""}
                              </Badge>
                            </div>
                            <span className="text-muted-foreground text-sm">
                              {worker.currentJob?.eventName || "Idle - waiting for jobs"}
                            </span>
                          </div>
                          <span className="text-muted-foreground text-xs">
                            last seen {worker.lastHeartbeat ? formatExactTime(worker.lastHeartbeat) : "never"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            }
            
            if (!hasThreads) return null;
            
            return (
              <Card className={`mb-4 ${activeThreads.length > 0 ? "border-green-200" : "border-yellow-200"}`}>
                <CardHeader className="pb-2">
                  <CardTitle className={`flex items-center gap-2 ${activeThreads.length > 0 ? "text-green-700" : "text-yellow-700"}`}>
                    <Activity className="w-5 h-5" />
                    Active Workers ({activeThreads.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(groupedThreads).map(([deviceName, deviceThreads]) => (
                      <div key={deviceName} className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="font-mono font-medium text-foreground">{deviceName}</span>
                          <span>({deviceThreads.length} thread{deviceThreads.length !== 1 ? "s" : ""})</span>
                        </div>
                        <div className="grid gap-2 pl-2 border-l-2 border-muted">
                          {deviceThreads.map((thread: WorkerThread) => (
                            <div 
                              key={thread.id} 
                              className={`flex items-center justify-between p-2 rounded-lg ${
                                thread.isStale ? "bg-yellow-50 border border-yellow-200" : 
                                thread.status === "PROCESSING" ? "bg-blue-50 border border-blue-200" :
                                thread.status === "PAUSED" ? "bg-orange-50 border border-orange-200" :
                                "bg-muted/50"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                {/* Status indicator */}
                                {thread.isStale ? (
                                  <div className="w-2 h-2 bg-yellow-500 rounded-full" title="Stale" />
                                ) : thread.status === "PROCESSING" ? (
                                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                                ) : thread.status === "PAUSED" ? (
                                  <div className="w-2 h-2 bg-orange-500 rounded-full" />
                                ) : (
                                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                                )}
                                
                                {/* Worker name */}
                                <span className="font-mono text-sm">{thread.workerName}</span>
                                
                                {/* Status badge */}
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs ${
                                    thread.status === "PROCESSING" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                    thread.status === "PAUSED" ? "bg-orange-50 text-orange-700 border-orange-200" :
                                    thread.status === "IDLE" ? "bg-gray-50 text-gray-600 border-gray-200" :
                                    "bg-yellow-50 text-yellow-700 border-yellow-200"
                                  }`}
                                >
                                  {thread.status === "PROCESSING" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                                  {thread.status}
                                </Badge>
                                
                                {/* Current event if processing */}
                                {thread.currentEvent && (
                                  <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                                    {thread.currentEvent}
                                  </span>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-3 text-sm">
                                {/* Job stats */}
                                <div className="flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-green-600" />
                                  <span className="text-green-600">{thread.jobsCompleted}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <XCircle className="w-3 h-3 text-red-600" />
                                  <span className="text-red-600">{thread.jobsFailed}</span>
                                </div>
                                
                                {/* Last heartbeat */}
                                <span className="text-muted-foreground text-xs" title={`Started: ${formatExactTime(thread.startedAt)}`}>
                                  {formatExactTime(thread.lastHeartbeat)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })()}
          
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
                
                {/* Stop Button - Ends the run */}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm("Stop all workers and end the current run? Running jobs will be cancelled.")) {
                      handleControl("stop");
                    }
                  }}
                  disabled={isControlLoading !== null || isOffline}
                  title="Stop all workers and listener, end the run"
                >
                  {isControlLoading === "stop" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <StopCircle className="w-4 h-4 mr-1" />}
                  Stop Run
                </Button>
                
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
                  <CardTitle>Job Queue ({queuedJobs.length})</CardTitle>
                  <CardDescription>Queued and running checkout jobs</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {/* Bulk actions when jobs are selected */}
                  {selectedQueueJobs.size > 0 && (
                    <>
                      <Badge variant="outline">{selectedQueueJobs.size} selected</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleBulkRetry}
                        disabled={isControlLoading !== null}
                      >
                        {isControlLoading === "bulk_retry" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                        Retry Selected
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleBulkCancel}
                        disabled={isControlLoading !== null}
                      >
                        {isControlLoading === "bulk_cancel" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <X className="w-4 h-4 mr-1" />}
                        Cancel Selected
                      </Button>
                      <Button variant="ghost" size="sm" onClick={clearQueueSelection}>
                        Clear
                      </Button>
                    </>
                  )}
                  {selectedQueueJobs.size === 0 && queuedJobs.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={selectAllQueueJobs}>
                      Select All
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {queuedJobs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No jobs in queue</p>
                  <p className="text-sm">Queued and running jobs will appear here</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300"
                          checked={selectedQueueJobs.size === jobs.length && jobs.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              selectAllQueueJobs();
                            } else {
                              clearQueueSelection();
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Section/Row</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Card</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-20">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queuedJobs.map((job) => (
                      <React.Fragment key={job.id}>
                        <TableRow className={`cursor-pointer hover:bg-muted/50 ${selectedQueueJobs.has(job.id) ? "bg-blue-50" : ""}`} onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="rounded border-gray-300"
                              checked={selectedQueueJobs.has(job.id)}
                              onChange={() => {
                                setSelectedQueueJobs(prev => {
                                  const newSet = new Set(prev);
                                  if (newSet.has(job.id)) {
                                    newSet.delete(job.id);
                                  } else {
                                    newSet.add(job.id);
                                  }
                                  return newSet;
                                });
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            {expandedJobId === job.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{job.eventName || "Unknown Event"}</div>
                            <div className="text-xs text-muted-foreground">{job.venue}</div>
                          </TableCell>
                          <TableCell>
                            {job.section && job.row ? `${job.section} / ${job.row}` : job.section || "-"}
                          </TableCell>
                          <TableCell className="text-center font-medium">{job.quantity || 1}</TableCell>
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
                          <TableCell>
                            {(() => {
                              const exp = formatExpiration(job.expiresAt);
                              if (exp.isExpired) {
                                return <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-300">Expired</Badge>;
                              }
                              if (exp.isUrgent) {
                                return <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 animate-pulse">{exp.text}</Badge>;
                              }
                              if (exp.secondsLeft > 0) {
                                return <span className="text-sm font-mono">{exp.text}</span>;
                              }
                              return <span className="text-muted-foreground">-</span>;
                            })()}
                          </TableCell>
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
                              {(job.status === "QUEUED" || job.status === "RUNNING") && (
                                <Button variant="ghost" size="icon" title={job.status === "RUNNING" ? "Skip" : "Cancel"} onClick={(e) => { e.stopPropagation(); handleCancelJob(job.id); }}>
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
                            <TableCell colSpan={10} className="bg-muted/30">
                              <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <Label className="text-xs text-muted-foreground">TM Event ID</Label>
                                  <div className="font-mono text-xs">{job.tmEventId || "-"}</div>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Event Date</Label>
                                  <div>{job.eventDate || "-"}</div>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Account Email</Label>
                                  <div>{job.accountEmail || "-"}</div>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Total Price</Label>
                                  <div>{job.totalPrice ? `$${job.totalPrice}` : "-"}</div>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Seats</Label>
                                  <div>{job.seats || "-"}</div>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Order Number</Label>
                                  <div>{job.tmOrderNumber || "-"}</div>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Expiration</Label>
                                  <div>
                                    {job.expiresAt ? (
                                      <>
                                        <span className="font-mono">{formatExpiration(job.expiresAt).text}</span>
                                        <span className="text-xs text-muted-foreground ml-2">
                                          ({new Date(job.expiresAt * 1000).toLocaleTimeString()})
                                        </span>
                                      </>
                                    ) : "-"}
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Attempts</Label>
                                  <div>{job.attemptCount}</div>
                                </div>
                                {job.errorCode && (
                                  <div className="col-span-4">
                                    <Label className="text-xs text-muted-foreground">Error</Label>
                                    <div className="text-red-600">{job.errorCode}: {job.errorMessage}</div>
                                  </div>
                                )}
                                {job.finalUrl && (
                                  <div className="col-span-4">
                                    <Label className="text-xs text-muted-foreground">Final URL</Label>
                                    <div className="truncate">
                                      <a href={job.finalUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{job.finalUrl}</a>
                                    </div>
                                  </div>
                                )}
                                {job.targetUrl && (
                                  <div className="col-span-4">
                                    <Label className="text-xs text-muted-foreground">Target URL</Label>
                                    <div className="truncate">
                                      <a href={job.targetUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{job.targetUrl}</a>
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
          
          {/* Successful Jobs Panel - Always visible at bottom */}
          <Card className="mb-4 border-green-200">
            <CardHeader className="cursor-pointer py-3" onClick={() => setSuccessExpanded(!successExpanded)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <CardTitle className="text-green-700">
                    Successful ({successfulJobs.length})
                  </CardTitle>
                </div>
                <ChevronDown className={`w-5 h-5 transition-transform ${successExpanded ? "rotate-180" : ""}`} />
              </div>
            </CardHeader>
            {successExpanded && successfulJobs.length > 0 && (
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Section/Row</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Card</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Order #</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {successfulJobs.map((job) => (
                      <React.Fragment key={job.id}>
                        <TableRow 
                          className="cursor-pointer hover:bg-muted/50" 
                          onClick={() => setExpandedSuccessJobId(expandedSuccessJobId === job.id ? null : job.id)}
                        >
                          <TableCell>
                            {expandedSuccessJobId === job.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{job.eventName || "Unknown Event"}</div>
                            <div className="text-xs text-muted-foreground">{job.venue}</div>
                          </TableCell>
                          <TableCell>{job.section && job.row ? `${job.section} / ${job.row}` : "-"}</TableCell>
                          <TableCell className="text-center font-medium">{job.quantity || 1}</TableCell>
                          <TableCell>{job.totalPrice ? `$${job.totalPrice}` : "-"}</TableCell>
                          <TableCell>****{job.cardLast4 || "????"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{job.completedAt ? formatDate(job.completedAt) : "-"}</TableCell>
                          <TableCell>
                            {job.tmOrderNumber ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-mono">
                                {job.tmOrderNumber}
                              </Badge>
                            ) : "-"}
                          </TableCell>
                        </TableRow>
                        {expandedSuccessJobId === job.id && (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-green-50/30">
                              <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <Label className="text-xs text-muted-foreground">TM Event ID</Label>
                                  <div className="font-mono text-xs">{job.tmEventId || "-"}</div>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Event Date</Label>
                                  <div>{job.eventDate || "-"}</div>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Account Email</Label>
                                  <div>{job.accountEmail || "-"}</div>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Price Each</Label>
                                  <div>{job.priceEach ? `$${job.priceEach}` : "-"}</div>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Seats</Label>
                                  <div>{job.seats || "-"}</div>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Attempts</Label>
                                  <div>{job.attemptCount}</div>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Worker</Label>
                                  <div className="font-mono text-xs">{job.workerId || "-"}</div>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Imported</Label>
                                  <div>{job.imported ? "Yes" : "No"}</div>
                                </div>
                                {job.finalUrl && (
                                  <div className="col-span-4">
                                    <Label className="text-xs text-muted-foreground">Confirmation URL</Label>
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
              </CardContent>
            )}
            {successExpanded && successfulJobs.length === 0 && (
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No successful checkouts yet</p>
                </div>
              </CardContent>
            )}
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
              <CardDescription>History of checkout worker sessions - Click a run to see its jobs</CardDescription>
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
                      <TableHead className="w-8"></TableHead>
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
                      <React.Fragment key={run.id}>
                        <TableRow 
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                        >
                          <TableCell>
                            {expandedRunId === run.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </TableCell>
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
                          <TableCell className="text-green-600 font-medium">{run.jobsSuccess}</TableCell>
                          <TableCell className="text-red-600 font-medium">{run.jobsFailed}</TableCell>
                          <TableCell className="text-orange-600 font-medium">{run.jobsReview}</TableCell>
                        </TableRow>
                        {expandedRunId === run.id && (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-muted/30 p-0">
                              <div className="p-4">
                                <h4 className="text-sm font-medium mb-3">Jobs in this run</h4>
                                {jobs.filter(j => j.runId === run.id).length === 0 ? (
                                  <div className="text-center py-4 text-muted-foreground text-sm">
                                    No jobs found for this run (jobs may have been processed in a different run or not linked)
                                  </div>
                                ) : (
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Event</TableHead>
                                        <TableHead>Section/Row</TableHead>
                                        <TableHead>Qty</TableHead>
                                        <TableHead>Total</TableHead>
                                        <TableHead>Card</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Order #</TableHead>
                                        <TableHead>Error</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {jobs.filter(j => j.runId === run.id).map((job) => (
                                        <TableRow key={job.id}>
                                          <TableCell>
                                            <div className="font-medium">{job.eventName || "Unknown"}</div>
                                            <div className="text-xs text-muted-foreground">{job.venue}</div>
                                          </TableCell>
                                          <TableCell>{job.section && job.row ? `${job.section} / ${job.row}` : "-"}</TableCell>
                                          <TableCell className="text-center">{job.quantity || 1}</TableCell>
                                          <TableCell>{job.totalPrice ? `$${job.totalPrice}` : "-"}</TableCell>
                                          <TableCell>****{job.cardLast4 || "????"}</TableCell>
                                          <TableCell>{getStatusBadge(job.status)}</TableCell>
                                          <TableCell>
                                            {job.tmOrderNumber ? (
                                              <span className="font-mono text-xs text-green-700">{job.tmOrderNumber}</span>
                                            ) : "-"}
                                          </TableCell>
                                          <TableCell>
                                            {job.errorCode ? (
                                              <span className="text-red-600 text-xs" title={job.errorMessage || ""}>
                                                {job.errorCode}
                                              </span>
                                            ) : "-"}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
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
                    <Label>Amex Only</Label>
                    <p className="text-xs text-muted-foreground">Only use cards tagged as &quot;amex&quot; for checkouts</p>
                  </div>
                  <Switch
                    checked={config.amex_only === true}
                    onCheckedChange={(checked) => updateConfig({ amex_only: checked })}
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
                <div className="space-y-2 pt-4 border-t">
                  <Label>Dashboard API URL</Label>
                  <Input
                    placeholder="https://your-app.vercel.app"
                    value={config.dashboard_api_url || ""}
                    onChange={(e) => updateConfig({ dashboard_api_url: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    URL for VPS workers and Discord listener to call back to the dashboard.
                    Required for the Discord listener to create jobs with proper account/card linking.
                  </p>
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
