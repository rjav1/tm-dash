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
  Settings,
  Plus,
  Send,
  Eye,
  EyeOff,
  Tag,
  History,
  Zap,
  Mail,
  Server,
  Download,
  RotateCcw,
  Upload,
  Activity,
  Pause,
  SkipForward,
  MinusCircle,
  PlusCircle,
  StopCircle,
  PlayCircle,
  Users,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Types
interface GeneratorTask {
  id: string;
  email: string;
  imapSource: string;
  proxy: string | null;
  status: string;
  errorMessage: string | null;
  password: string | null;
  phoneNumber: string | null;
  imported: boolean;
  importedAt: string | null;
  createdAt: string;
  workerName: string | null;
  currentStep: string | null;
  stepDetail: string | null;
  stepProgress: number | null;
  retryCount: number;
  lastError: string | null;
  durationMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface AccountTag {
  id: string;
  name: string;
  color: string | null;
}

interface GeneratorJob {
  id: string;
  status: string;
  threadCount: number;
  imapProvider: string;
  autoImport: boolean;
  totalTasks: number;
  completed: number;
  succeeded: number;
  failed: number;
  workerId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  tagId: string | null;
  tag: AccountTag | null;
  tasks?: GeneratorTask[];
  _count?: { tasks: number };
  runId: string | null;
  priority: number;
}

interface GeneratorEmail {
  id: string;
  email: string;
  status: string;
  imapProvider: string | null;
  usedAt: string | null;
  createdAt: string;
}

interface GeneratorProxy {
  id: string;
  proxy: string;
  status: string;
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}

interface BadProxy {
  id: string;
  proxy: string;
  reason: string | null;
  jobId: string | null;
  detectedAt: string;
}

interface PoolStats {
  AVAILABLE: number;
  IN_USE: number;
  USED?: number;
  BAD?: number;
}

interface WorkerThread {
  id: string;
  runId: string;
  workerName: string;
  deviceName: string;
  status: string;
  currentTaskId: string | null;
  currentEmail: string | null;
  currentStep: string | null;
  currentProgress: number | null;
  lastHeartbeat: string;
  startedAt: string;
  tasksCompleted: number;
  tasksFailed: number;
  isStale: boolean;
  currentTask?: {
    email: string;
    step: string;
    stepDetail: string;
    progress: number;
    startedAt: string;
    proxy: string | null;
    imapSource: string;
  } | null;
}

interface WorkerRun {
  id: string;
  workerId: string;
  startedAt: string;
  lastHeartbeat: string | null;
  activeWorkerCount: number;
  jobsSuccess: number;
  jobsFailed: number;
  tasksSuccess: number;
  tasksFailed: number;
  isStale: boolean;
}

interface GeneratorStats {
  period: string;
  overview: {
    totalTasks: number;
    totalJobs: number;
    pending: number;
    running: number;
    success: number;
    failed: number;
    successRate: number;
  };
  jobs: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
  pools: {
    emailsAvailable: number;
    emailsInUse: number;
    emailsUsed: number;
    proxiesAvailable: number;
    proxiesInUse: number;
    proxiesBad: number;
  };
  workers: {
    active: number;
    totalThreads: number;
    targetWorkerCount: number;
    isPaused: boolean;
    runs: WorkerRun[];
    threads: WorkerThread[];
    runningTasks: number;
  };
  tasks: {
    pending: number;
    running: number;
    completed: number;
    success: number;
    failed: number;
  };
  topProviders: Array<{ name: string; count: number; successRate: number }>;
}

interface GeneratorConfig {
  daisy_sms_api_key?: string;
  daisy_sms_country?: string;
  daisy_sms_min_balance?: number;
  aycd_inbox_api_key?: string;
  aycd_inbox_enabled?: boolean;
  discord_webhook_success?: string;
  discord_webhook_error?: string;
  discord_webhook_misc?: string;
  worker_parallelism?: number;
  task_timeout_ms?: number;
  paused?: boolean;
}

interface ImapProvider {
  id: string;
  name: string;
  displayName: string;
  isEnabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// Status badge helper
function getStatusBadge(status: string) {
  switch (status) {
    case "PENDING":
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    case "RUNNING":
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running</Badge>;
    case "SUCCESS":
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" />Success</Badge>;
    case "COMPLETED":
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
    case "FAILED":
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    case "CANCELLED":
      return <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200"><Square className="w-3 h-3 mr-1" />Cancelled</Badge>;
    case "IDLE":
      return <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">Idle</Badge>;
    case "PROCESSING":
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing</Badge>;
    case "PAUSED":
      return <Badge variant="outline" className="bg-orange-50 text-orange-600 border-orange-200"><Pause className="w-3 h-3 mr-1" />Paused</Badge>;
    case "STOPPED":
      return <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200"><StopCircle className="w-3 h-3 mr-1" />Stopped</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// Format duration in ms to readable string
function formatDuration(ms: number | null): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

// Format relative time
function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffS = Math.floor(diffMs / 1000);
  
  if (diffS < 10) return "just now";
  if (diffS < 60) return `${diffS}s ago`;
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
  if (diffS < 86400) return `${Math.floor(diffS / 3600)}h ago`;
  return formatDate(dateString);
}

export default function GeneratorPage() {
  const [activeTab, setActiveTab] = useState("monitor");
  const [loading, setLoading] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  // Stats state
  const [stats, setStats] = useState<GeneratorStats | null>(null);

  // Jobs state
  const [jobs, setJobs] = useState<GeneratorJob[]>([]);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [expandedJobTasks, setExpandedJobTasks] = useState<GeneratorTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Email pool state
  const [emails, setEmails] = useState<GeneratorEmail[]>([]);
  const [emailStats, setEmailStats] = useState<PoolStats>({ AVAILABLE: 0, IN_USE: 0, USED: 0 });
  const [newEmails, setNewEmails] = useState("");
  const [addingEmails, setAddingEmails] = useState(false);
  const [selectedEmailProvider, setSelectedEmailProvider] = useState<string>("__auto__");

  // Proxy pool state
  const [proxies, setProxies] = useState<GeneratorProxy[]>([]);
  const [proxyStats, setProxyStats] = useState<PoolStats>({ AVAILABLE: 0, IN_USE: 0, BAD: 0 });
  const [badProxies, setBadProxies] = useState<BadProxy[]>([]);
  const [newProxies, setNewProxies] = useState("");
  const [addingProxies, setAddingProxies] = useState(false);

  // Tags state
  const [tags, setTags] = useState<AccountTag[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<string>("__none__");
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");
  const [creatingTag, setCreatingTag] = useState(false);

  // IMAP Providers state
  const [imapProviders, setImapProviders] = useState<ImapProvider[]>([]);
  const [newProviderName, setNewProviderName] = useState("");
  const [newProviderDisplayName, setNewProviderDisplayName] = useState("");
  const [addingProvider, setAddingProvider] = useState(false);

  // New job form state
  const [emailCount, setEmailCount] = useState("10");
  const [imapProvider, setImapProvider] = useState("aycd");
  const [autoImport, setAutoImport] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Config state
  const [config, setConfig] = useState<GeneratorConfig>({});
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({});
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);

  // Control state
  const [isPaused, setIsPaused] = useState(false);
  const [workerCount, setWorkerCount] = useState(3);
  const [isControlLoading, setIsControlLoading] = useState<string | null>(null);

  // Import/Retry state
  const [importing, setImporting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const { toast } = useToast();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch functions
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch("/api/generator/stats");
      if (!response.ok) throw new Error("Failed to fetch stats");
      const data = await response.json();
      setStats(data);
      setIsPaused(data.workers?.isPaused || false);
      setWorkerCount(data.workers?.targetWorkerCount || 3);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/generator/jobs?limit=50");
      if (!response.ok) throw new Error("Failed to fetch jobs");
      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEmails = useCallback(async () => {
    try {
      const response = await fetch("/api/generator/emails?limit=200");
      if (!response.ok) throw new Error("Failed to fetch emails");
      const data = await response.json();
      setEmails(data.emails || []);
      setEmailStats(data.stats || { AVAILABLE: 0, IN_USE: 0, USED: 0 });
    } catch (error) {
      console.error("Error fetching emails:", error);
    }
  }, []);

  const fetchProxies = useCallback(async () => {
    try {
      const [proxiesRes, badProxiesRes] = await Promise.all([
        fetch("/api/generator/proxies?limit=200"),
        fetch("/api/generator/bad-proxies?limit=100"),
      ]);
      
      if (proxiesRes.ok) {
        const data = await proxiesRes.json();
        setProxies(data.proxies || []);
        setProxyStats(data.stats || { AVAILABLE: 0, IN_USE: 0, BAD: 0 });
      }
      
      if (badProxiesRes.ok) {
        const data = await badProxiesRes.json();
        setBadProxies(data.badProxies || []);
      }
    } catch (error) {
      console.error("Error fetching proxies:", error);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const response = await fetch("/api/tags?type=account");
      if (!response.ok) throw new Error("Failed to fetch tags");
      const data = await response.json();
      setTags(data.tags || []);
    } catch (error) {
      console.error("Error fetching tags:", error);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const response = await fetch("/api/generator/config");
      if (!response.ok) throw new Error("Failed to fetch config");
      const data = await response.json();
      setConfig(data.config || {});
    } catch (error) {
      console.error("Error fetching config:", error);
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const fetchImapProviders = useCallback(async () => {
    try {
      const response = await fetch("/api/generator/imap-providers");
      if (!response.ok) throw new Error("Failed to fetch IMAP providers");
      const data = await response.json();
      setImapProviders(data.providers || []);
    } catch (error) {
      console.error("Error fetching IMAP providers:", error);
    }
  }, []);

  const refreshAll = () => {
    fetchStats();
    fetchJobs();
    fetchEmails();
    fetchProxies();
    fetchTags();
    fetchConfig();
    fetchImapProviders();
  };

  // Initial data fetch
  useEffect(() => {
    refreshAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Always use polling for reliability (3s interval)
  // Realtime is kept as an enhancement but we don't depend on it
  useEffect(() => {
    // Always start polling immediately - this is more reliable than Realtime
    pollIntervalRef.current = setInterval(() => {
      fetchStats();
      fetchJobs();
    }, 3000);
    
    // Try to set up Realtime as an enhancement (triggers immediate updates)
    const supabaseClient = getSupabase();
    
    if (isSupabaseConfigured() && supabaseClient) {
      const channel = supabaseClient
        .channel("generator-updates")
        .on("postgres_changes", { event: "*", schema: "public", table: "generator_jobs" }, () => {
          fetchJobs();
          fetchStats();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "generator_tasks" }, () => {
          fetchStats();
          if (expandedJobId) {
            fetch(`/api/generator/jobs/${expandedJobId}`)
              .then((res) => res.json())
              .then((data) => data.job?.tasks && setExpandedJobTasks(data.job.tasks))
              .catch(console.error);
          }
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "generator_runs" }, () => fetchStats())
        .on("postgres_changes", { event: "*", schema: "public", table: "generator_workers" }, () => fetchStats())
        .subscribe((status) => {
          const connected = status === "SUBSCRIBED";
          setRealtimeConnected(connected);
        });

      channelRef.current = channel;
    }
    
    return () => {
      if (channelRef.current) {
        const supabaseClient = getSupabase();
        if (supabaseClient) {
          supabaseClient.removeChannel(channelRef.current);
        }
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [expandedJobId, fetchJobs, fetchStats]);

  // Control handlers
  const handleControl = async (action: string, extra?: Record<string, unknown>) => {
    setIsControlLoading(action);
    try {
      const response = await fetch("/api/generator/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      // Update local state
      if (action === "pause") setIsPaused(true);
      if (action === "resume") setIsPaused(false);
      if (action === "scale_workers" && extra?.workerCount !== undefined) {
        setWorkerCount(extra.workerCount as number);
      }
      
      toast({ title: data.message || "Action completed" });
      
      // Actions that affect email pool need to refresh emails too
      const emailAffectingActions = ["stop", "skip", "clear", "cancel_job", "cancel_task", "release_orphaned_emails", "clear_all_data"];
      if (emailAffectingActions.includes(action)) {
        await Promise.all([fetchStats(), fetchJobs(), fetchEmails()]);
      } else {
        await Promise.all([fetchStats(), fetchJobs()]);
      }
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed", variant: "destructive" });
    } finally {
      setIsControlLoading(null);
    }
  };

  // Email handlers
  const handleAddEmails = async () => {
    if (!newEmails.trim()) return;
    setAddingEmails(true);
    try {
      const response = await fetch("/api/generator/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: newEmails, imapProvider: selectedEmailProvider === "__auto__" ? null : selectedEmailProvider }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast({ title: "Emails Added", description: data.message });
      setNewEmails("");
      fetchEmails();
      fetchStats();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to add emails", variant: "destructive" });
    } finally {
      setAddingEmails(false);
    }
  };

  const handleDeleteEmails = async (ids: string[], all?: boolean, status?: string) => {
    try {
      const response = await fetch("/api/generator/emails", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(all ? { all: true, status } : { ids }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast({ title: "Deleted", description: data.message });
      fetchEmails();
      fetchStats();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to delete", variant: "destructive" });
    }
  };

  // Proxy handlers
  const handleAddProxies = async () => {
    if (!newProxies.trim()) return;
    setAddingProxies(true);
    try {
      const response = await fetch("/api/generator/proxies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxies: newProxies }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast({ title: "Proxies Added", description: data.message });
      setNewProxies("");
      fetchProxies();
      fetchStats();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to add proxies", variant: "destructive" });
    } finally {
      setAddingProxies(false);
    }
  };

  const handleDeleteProxies = async (ids: string[], all?: boolean, status?: string) => {
    try {
      const response = await fetch("/api/generator/proxies", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(all ? { all: true, status } : { ids }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast({ title: "Deleted", description: data.message });
      fetchProxies();
      fetchStats();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to delete", variant: "destructive" });
    }
  };

  const handleRestoreBadProxies = async (ids: string[], all?: boolean) => {
    try {
      const response = await fetch("/api/generator/bad-proxies/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(all ? { all: true } : { ids }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast({ title: "Restored", description: data.message });
      fetchProxies();
      fetchStats();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to restore", variant: "destructive" });
    }
  };

  // Tag handlers
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    setCreatingTag(true);
    try {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "account", name: newTagName.trim(), color: newTagColor }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setTags([...tags, data.tag]);
      setSelectedTagId(data.tag.id);
      setNewTagName("");
      toast({ title: "Tag Created", description: `Tag "${data.tag.name}" created` });
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to create tag", variant: "destructive" });
    } finally {
      setCreatingTag(false);
    }
  };

  // Job handlers
  const handleSubmitJob = async () => {
    setShowConfirmModal(false);
    setSubmitting(true);
    try {
      const response = await fetch("/api/generator/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailCount: parseInt(emailCount, 10),
          imapProvider,
          autoImport,
          tagId: selectedTagId === "__none__" ? null : selectedTagId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast({ title: "Job Created", description: data.message });
      
      // Refresh all data and wait for it to complete
      await Promise.all([
        fetchJobs(),
        fetchEmails(),
        fetchProxies(),
        fetchStats(),
      ]);
      
      // Reset form
      setEmailCount("10");
      setActiveTab("monitor");
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to create job", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/generator/jobs/${jobId}/cancel`, { method: "POST" });
      if (!response.ok) throw new Error((await response.json()).error);
      toast({ title: "Job Cancelled" });
      // Refresh all data including emails (cancelling releases emails back to pool)
      await Promise.all([fetchJobs(), fetchEmails(), fetchStats()]);
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to cancel", variant: "destructive" });
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/generator/jobs/${jobId}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error);
      toast({ title: "Job Deleted" });
      if (expandedJobId === jobId) { setExpandedJobId(null); setExpandedJobTasks([]); }
      fetchJobs();
      fetchStats();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to delete", variant: "destructive" });
    }
  };

  const handleImportTasks = async (jobId: string, taskIds?: string[], all?: boolean) => {
    setImporting(true);
    try {
      const response = await fetch(`/api/generator/jobs/${jobId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(all ? { all: true } : { taskIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast({ title: "Imported", description: data.message });
      setSelectedTaskIds(new Set());
      const tasksRes = await fetch(`/api/generator/jobs/${jobId}`);
      const tasksData = await tasksRes.json();
      if (tasksData.job?.tasks) setExpandedJobTasks(tasksData.job.tasks);
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to import", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const handleRetryTasks = async (jobId: string, taskIds?: string[], allFailed?: boolean) => {
    setRetrying(true);
    try {
      const response = await fetch(`/api/generator/jobs/${jobId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(allFailed ? { allFailed: true } : { taskIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast({ title: "Retry Job Created", description: data.message });
      setSelectedTaskIds(new Set());
      fetchJobs();
      fetchStats();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to retry", variant: "destructive" });
    } finally {
      setRetrying(false);
    }
  };

  const toggleExpandJob = async (jobId: string) => {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
      setExpandedJobTasks([]);
      setSelectedTaskIds(new Set());
      return;
    }
    setExpandedJobId(jobId);
    setLoadingTasks(true);
    setSelectedTaskIds(new Set());
    try {
      const response = await fetch(`/api/generator/jobs/${jobId}`);
      const data = await response.json();
      setExpandedJobTasks(data.job?.tasks || []);
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoadingTasks(false);
    }
  };

  // Config handlers
  const handleSaveConfig = async () => {
    setConfigSaving(true);
    try {
      const response = await fetch("/api/generator/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      toast({ title: "Configuration Saved" });
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to save", variant: "destructive" });
    } finally {
      setConfigSaving(false);
    }
  };

  const handleTestWebhook = async (type: "success" | "error" | "misc") => {
    const webhookUrl = config[`discord_webhook_${type}` as keyof GeneratorConfig] as string;
    if (!webhookUrl) { toast({ title: "Error", description: "Enter a webhook URL first", variant: "destructive" }); return; }
    setTestingWebhook(type);
    try {
      const response = await fetch("/api/generator/config/test-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl, type }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error);
      toast({ title: "Success", description: "Test message sent!" });
    } catch (error) {
      toast({ title: "Webhook Test Failed", description: error instanceof Error ? error.message : "Failed", variant: "destructive" });
    } finally {
      setTestingWebhook(null);
    }
  };

  // IMAP Provider handlers
  const handleAddImapProvider = async () => {
    if (!newProviderName.trim() || !newProviderDisplayName.trim()) return;
    setAddingProvider(true);
    try {
      const response = await fetch("/api/generator/imap-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProviderName.toLowerCase().replace(/\s+/g, "_"),
          displayName: newProviderDisplayName,
          config: {},
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast({ title: "Provider Added", description: `${newProviderDisplayName} added` });
      setNewProviderName("");
      setNewProviderDisplayName("");
      fetchImapProviders();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to add provider", variant: "destructive" });
    } finally {
      setAddingProvider(false);
    }
  };

  const handleDeleteImapProvider = async (id: string) => {
    try {
      const response = await fetch(`/api/generator/imap-providers?id=${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast({ title: "Provider Deleted" });
      fetchImapProviders();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to delete", variant: "destructive" });
    }
  };

  // Computed values
  const requestedCount = parseInt(emailCount, 10) || 0;
  const canSubmit = requestedCount > 0 && requestedCount <= (stats?.pools.emailsAvailable || 0);
  const successfulTasks = expandedJobTasks.filter((t) => t.status === "SUCCESS" && !t.imported);
  const failedTasks = expandedJobTasks.filter((t) => t.status === "FAILED");
  const runningTasks = stats?.workers.threads.filter(w => w.status === "PROCESSING") || [];

  return (
    <div className="flex-1 space-y-6 p-8">
      {/* Header with badges */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Account Generator</h1>
          <p className="text-muted-foreground">Generate TicketMaster accounts with real-time monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Status badges */}
          {isSupabaseConfigured() && (
            <Badge variant={realtimeConnected ? "success" : "secondary"} className="gap-1">
              {realtimeConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {realtimeConnected ? "Live" : "Polling"}
            </Badge>
          )}
          {stats?.workers.active ? (
            <Badge variant="success" className="gap-1">
              <Radio className="h-3 w-3" />
              {stats.workers.totalThreads} Workers
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <StopCircle className="h-3 w-3" />
              No Workers
            </Badge>
          )}
          {isPaused && (
            <Badge variant="warning" className="gap-1">
              <Pause className="h-3 w-3" />
              Paused
            </Badge>
          )}
          <Button variant="outline" onClick={refreshAll} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.overview.pending || 0}</div>
            <p className="text-xs text-muted-foreground">tasks waiting</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Running</CardTitle>
            <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats?.overview.running || 0}</div>
            <p className="text-xs text-muted-foreground">in progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.overview.success || 0}</div>
            <p className="text-xs text-muted-foreground">accounts created</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.overview.failed || 0}</div>
            <p className="text-xs text-muted-foreground">errors</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.overview.successRate || 0}%</div>
            <p className="text-xs text-muted-foreground">today</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Emails</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats?.pools.emailsAvailable || 0}</div>
            <p className="text-xs text-muted-foreground">available</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6 max-w-3xl">
          <TabsTrigger value="monitor" className="gap-2"><Activity className="h-4 w-4" />Monitor</TabsTrigger>
          <TabsTrigger value="new-job" className="gap-2"><Zap className="h-4 w-4" />New Job</TabsTrigger>
          <TabsTrigger value="emails" className="gap-2"><Mail className="h-4 w-4" />Emails</TabsTrigger>
          <TabsTrigger value="proxies" className="gap-2"><Server className="h-4 w-4" />Proxies</TabsTrigger>
          <TabsTrigger value="history" className="gap-2"><History className="h-4 w-4" />History</TabsTrigger>
          <TabsTrigger value="config" className="gap-2"><Settings className="h-4 w-4" />Config</TabsTrigger>
        </TabsList>

        {/* MONITOR TAB */}
        <TabsContent value="monitor" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Control Panel */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Control Panel
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Start/Stop Run */}
                <div className="flex gap-2">
                  {(stats?.workers.active ?? 0) > 0 || (stats?.workers.totalThreads ?? 0) > 0 ? (
                    <Button 
                      variant="destructive" 
                      className="flex-1"
                      onClick={() => handleControl("stop")}
                      disabled={isControlLoading === "stop"}
                    >
                      {isControlLoading === "stop" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <StopCircle className="mr-2 h-4 w-4" />}
                      Stop Run
                    </Button>
                  ) : (
                    <Button 
                      className="flex-1"
                      onClick={() => handleControl("start")}
                      disabled={isControlLoading === "start"}
                    >
                      {isControlLoading === "start" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                      Start Run
                    </Button>
                  )}
                </div>

                {/* Pause/Resume - only enabled when workers are active */}
                <div className="flex gap-2">
                  <Button 
                    variant={isPaused ? "default" : "secondary"}
                    className="flex-1"
                    onClick={() => handleControl(isPaused ? "resume" : "pause")}
                    disabled={
                      isControlLoading === "pause" || 
                      isControlLoading === "resume" ||
                      ((stats?.workers.totalThreads ?? 0) === 0 && !isPaused)
                    }
                  >
                    {isPaused ? (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Resume
                      </>
                    ) : (
                      <>
                        <Pause className="mr-2 h-4 w-4" />
                        Pause
                      </>
                    )}
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => handleControl("skip")}
                    disabled={isControlLoading === "skip" || (stats?.tasks.running ?? 0) === 0}
                  >
                    <SkipForward className="mr-2 h-4 w-4" />
                    Skip
                  </Button>
                </div>

                {/* Worker Scaling */}
                <div className="space-y-2">
                  <Label>Workers</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        const newCount = workerCount - 1;
                        if (newCount >= 1) handleControl("scale_workers", { workerCount: newCount });
                      }}
                      disabled={workerCount <= 1 || isControlLoading === "scale_workers"}
                    >
                      <MinusCircle className="h-4 w-4" />
                    </Button>
                    <div className="flex-1 text-center text-2xl font-bold">{workerCount}</div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        const newCount = workerCount + 1;
                        if (newCount <= 10) handleControl("scale_workers", { workerCount: newCount });
                      }}
                      disabled={workerCount >= 10 || isControlLoading === "scale_workers"}
                    >
                      <PlusCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleControl("retry_all")}
                    disabled={isControlLoading === "retry_all" || (stats?.tasks.failed ?? 0) === 0}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Retry Failed
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleControl("clear")}
                    disabled={isControlLoading === "clear" || (stats?.jobs.pending ?? 0) === 0}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Clear Queue
                  </Button>
                </div>

                {/* Maintenance Actions */}
                <div className="pt-2 border-t">
                  <Label className="text-xs text-muted-foreground">Maintenance</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleControl("reset_counters")}
                      disabled={isControlLoading === "reset_counters"}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Reset Counters
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleControl("release_orphaned_emails")}
                      disabled={isControlLoading === "release_orphaned_emails"}
                    >
                      <Mail className="mr-2 h-4 w-4" />
                      Fix Emails
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Active Workers Panel */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Active Workers
                  {stats?.workers.totalThreads ? (
                    <Badge variant="success">{stats.workers.totalThreads} active</Badge>
                  ) : (
                    <Badge variant="secondary">none</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats?.workers.threads && stats.workers.threads.length > 0 ? (
                  <div className="space-y-3">
                    {stats.workers.threads.map((worker) => (
                      <div 
                        key={worker.id} 
                        className={`p-3 border rounded-lg ${worker.isStale ? "border-red-200 bg-red-50" : "border-gray-200"}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{worker.workerName}</span>
                            {getStatusBadge(worker.status)}
                            {worker.isStale && <Badge variant="destructive">Stale</Badge>}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {worker.tasksCompleted} / {worker.tasksFailed} (success/fail)
                          </div>
                        </div>
                        {worker.currentEmail && (
                          <div className="space-y-2">
                            <div className="text-sm">
                              <span className="text-muted-foreground">Email: </span>
                              <span className="font-mono">{worker.currentEmail}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Progress value={worker.currentProgress || 0} className="flex-1" />
                              <span className="text-sm text-muted-foreground w-20 text-right">
                                {worker.currentStep || "..."}
                              </span>
                            </div>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-2">
                          Last heartbeat: {formatRelativeTime(worker.lastHeartbeat)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No active workers</p>
                    <p className="text-sm">Start a run from the control panel</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Live Task Queue */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Task Queue
                <Badge variant="secondary">{stats?.tasks.pending || 0} pending</Badge>
                <Badge variant="warning">{stats?.tasks.running || 0} running</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {jobs.filter(j => j.status === "RUNNING" || j.status === "PENDING").length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.filter(j => j.status === "RUNNING" || j.status === "PENDING").slice(0, 10).map((job) => (
                      <TableRow key={job.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{job.totalTasks} accounts</span>
                            <Badge variant="outline" className="text-xs">{job.imapProvider}</Badge>
                            {job.tag && (
                              <Badge 
                                variant="outline"
                                className="text-xs"
                                style={{ 
                                  backgroundColor: `${job.tag.color}20`,
                                  borderColor: job.tag.color || undefined,
                                }}
                              >
                                {job.tag.name}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(job.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress 
                              value={job.totalTasks > 0 ? (job.completed / job.totalTasks) * 100 : 0} 
                              className="w-24"
                            />
                            <span className="text-sm text-muted-foreground">
                              {job.completed}/{job.totalTasks}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <span className="text-green-600">{job.succeeded} success</span>
                            {job.failed > 0 && <span className="text-red-500 ml-2">{job.failed} failed</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatRelativeTime(job.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancelJob(job.id)}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No pending or running jobs</p>
                  <p className="text-sm">Create a new job from the New Job tab</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* NEW JOB TAB */}
        <TabsContent value="new-job" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Create Generation Job</CardTitle>
                <CardDescription>Select how many accounts to generate from your pools</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Pool Stats */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div>
                    <div className="text-sm text-muted-foreground">Available Emails</div>
                    <div className="text-2xl font-bold text-green-600">{stats?.pools.emailsAvailable || 0}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Available Proxies</div>
                    <div className="text-2xl font-bold text-blue-600">{stats?.pools.proxiesAvailable || 0}</div>
                  </div>
                </div>

                {/* Email Count */}
                <div className="space-y-2">
                  <Label>Number of Accounts to Generate</Label>
                  <Input
                    type="number"
                    min="1"
                    max={stats?.pools.emailsAvailable || 0}
                    value={emailCount}
                    onChange={(e) => setEmailCount(e.target.value)}
                    placeholder="Enter count..."
                  />
                  {requestedCount > (stats?.pools.emailsAvailable || 0) && (
                    <p className="text-sm text-destructive">Not enough emails available</p>
                  )}
                </div>

                {/* IMAP Provider */}
                <div className="space-y-2">
                  <Label>IMAP Provider</Label>
                  <Select value={imapProvider} onValueChange={setImapProvider}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aycd">AYCD Inbox</SelectItem>
                      <SelectItem value="gmail">Gmail IMAP</SelectItem>
                      {imapProviders.filter(p => p.isEnabled).map(p => (
                        <SelectItem key={p.id} value={p.name}>{p.displayName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Tag Selection */}
                <div className="space-y-2">
                  <Label>Tag (Optional)</Label>
                  <div className="flex gap-2">
                    <Select value={selectedTagId} onValueChange={setSelectedTagId}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Select tag..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No tag</SelectItem>
                        {tags.map((tag) => (
                          <SelectItem key={tag.id} value={tag.id}>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: tag.color || "#3b82f6" }} 
                              />
                              {tag.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Quick create tag */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="New tag name..."
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      type="color"
                      value={newTagColor}
                      onChange={(e) => setNewTagColor(e.target.value)}
                      className="w-12"
                    />
                    <Button 
                      variant="outline" 
                      onClick={handleCreateTag}
                      disabled={creatingTag || !newTagName.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Auto Import */}
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">Auto Import Accounts</div>
                    <div className="text-sm text-muted-foreground">Automatically import successful accounts to dashboard</div>
                  </div>
                  <Switch checked={autoImport} onCheckedChange={setAutoImport} />
                </div>

                {/* Submit */}
                <Button 
                  className="w-full" 
                  size="lg"
                  disabled={!canSubmit || submitting}
                  onClick={() => setShowConfirmModal(true)}
                >
                  {submitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="mr-2 h-4 w-4" />
                  )}
                  Start Generation
                </Button>
              </CardContent>
            </Card>

            {/* Info Card */}
            <Card>
              <CardHeader>
                <CardTitle>How It Works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="bg-blue-100 text-blue-700 rounded-full w-8 h-8 flex items-center justify-center font-bold">1</div>
                    <div>
                      <div className="font-medium">Job Created</div>
                      <div className="text-sm text-muted-foreground">Emails and proxies are reserved from pools</div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="bg-blue-100 text-blue-700 rounded-full w-8 h-8 flex items-center justify-center font-bold">2</div>
                    <div>
                      <div className="font-medium">Worker Processes</div>
                      <div className="text-sm text-muted-foreground">VPS workers claim and process tasks</div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="bg-blue-100 text-blue-700 rounded-full w-8 h-8 flex items-center justify-center font-bold">3</div>
                    <div>
                      <div className="font-medium">Live Progress</div>
                      <div className="text-sm text-muted-foreground">Monitor each task in real-time</div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="bg-green-100 text-green-700 rounded-full w-8 h-8 flex items-center justify-center font-bold">4</div>
                    <div>
                      <div className="font-medium">Accounts Ready</div>
                      <div className="text-sm text-muted-foreground">Import or auto-import to dashboard</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* EMAILS TAB */}
        <TabsContent value="emails" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Add Emails Card */}
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle>Add Emails</CardTitle>
                <CardDescription>Add emails to the pool (one per line)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="email1@example.com&#10;email2@example.com&#10;..."
                  value={newEmails}
                  onChange={(e) => setNewEmails(e.target.value)}
                  rows={8}
                />
                <div className="space-y-2">
                  <Label>IMAP Provider (Optional)</Label>
                  <Select value={selectedEmailProvider} onValueChange={setSelectedEmailProvider}>
                    <SelectTrigger><SelectValue placeholder="Auto-detect" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">Auto-detect</SelectItem>
                      <SelectItem value="aycd">AYCD Inbox</SelectItem>
                      <SelectItem value="gmail">Gmail IMAP</SelectItem>
                      {imapProviders.filter(p => p.isEnabled).map(p => (
                        <SelectItem key={p.id} value={p.name}>{p.displayName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  className="w-full" 
                  onClick={handleAddEmails}
                  disabled={addingEmails || !newEmails.trim()}
                >
                  {addingEmails ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Add Emails
                </Button>
              </CardContent>
            </Card>

            {/* Email Pool Card */}
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Email Pool</CardTitle>
                    <CardDescription>
                      {emailStats.AVAILABLE} available · {emailStats.IN_USE} in use · {emailStats.USED || 0} used
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleDeleteEmails([], true, "USED")}>
                      <Trash2 className="mr-2 h-4 w-4" />Clear Used
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>IMAP</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Added</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emails.slice(0, 100).map((email) => (
                        <TableRow key={email.id}>
                          <TableCell className="font-mono text-sm">{email.email}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{email.imapProvider || "auto"}</Badge>
                          </TableCell>
                          <TableCell>{getStatusBadge(email.status)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(email.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteEmails([email.id])}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {emails.length > 100 && (
                    <p className="text-center text-sm text-muted-foreground py-2">
                      Showing 100 of {emails.length} emails
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* PROXIES TAB */}
        <TabsContent value="proxies" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Add Proxies Card */}
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle>Add Proxies</CardTitle>
                <CardDescription>Add proxies to the pool (one per line)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="ip:port:user:pass&#10;ip:port:user:pass&#10;..."
                  value={newProxies}
                  onChange={(e) => setNewProxies(e.target.value)}
                  rows={8}
                />
                <Button 
                  className="w-full" 
                  onClick={handleAddProxies}
                  disabled={addingProxies || !newProxies.trim()}
                >
                  {addingProxies ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Add Proxies
                </Button>
              </CardContent>
            </Card>

            {/* Proxy Pool Card */}
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Proxy Pool</CardTitle>
                    <CardDescription>
                      {proxyStats.AVAILABLE} available · {proxyStats.IN_USE} in use · {proxyStats.BAD || 0} bad
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleRestoreBadProxies([], true)}>
                      <RotateCcw className="mr-2 h-4 w-4" />Restore All Bad
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDeleteProxies([], true, "BAD")}>
                      <Trash2 className="mr-2 h-4 w-4" />Clear Bad
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Proxy</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Uses</TableHead>
                        <TableHead>Last Used</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {proxies.slice(0, 100).map((proxy) => (
                        <TableRow key={proxy.id}>
                          <TableCell className="font-mono text-sm max-w-xs truncate">{proxy.proxy}</TableCell>
                          <TableCell>{getStatusBadge(proxy.status)}</TableCell>
                          <TableCell>{proxy.useCount}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {proxy.lastUsedAt ? formatRelativeTime(proxy.lastUsedAt) : "-"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteProxies([proxy.id])}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Job History</CardTitle>
              <CardDescription>View and manage all generation jobs</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead></TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Tag</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <React.Fragment key={job.id}>
                      <TableRow 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleExpandJob(job.id)}
                      >
                        <TableCell>
                          {expandedJobId === job.id ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(job.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress 
                              value={job.totalTasks > 0 ? (job.completed / job.totalTasks) * 100 : 0} 
                              className="w-20"
                            />
                            <span className="text-sm">
                              {job.succeeded}/{job.totalTasks}
                              {job.failed > 0 && <span className="text-red-500"> ({job.failed} failed)</span>}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {job.tag ? (
                            <Badge 
                              variant="outline"
                              style={{ 
                                backgroundColor: `${job.tag.color}20`,
                                borderColor: job.tag.color || undefined,
                              }}
                            >
                              {job.tag.name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(job.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {job.status === "PENDING" || job.status === "RUNNING" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleCancelJob(job.id); }}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleDeleteJob(job.id); }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedJobId === job.id && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/50 p-4">
                            {loadingTasks ? (
                              <div className="flex justify-center py-4">
                                <Loader2 className="h-6 w-6 animate-spin" />
                              </div>
                            ) : (
                              <div className="space-y-6">
                                {/* Successful Tasks Section */}
                                {successfulTasks.length > 0 && (
                                  <div className="border rounded-lg p-4 bg-green-50/50">
                                    <div className="flex items-center justify-between mb-3">
                                      <div className="flex items-center gap-2">
                                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                                        <span className="font-medium text-green-800">
                                          Successful Tasks ({successfulTasks.length})
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Checkbox
                                          id="select-all-success"
                                          checked={successfulTasks.every(t => selectedTaskIds.has(t.id))}
                                          onCheckedChange={(checked) => {
                                            const newSelected = new Set(selectedTaskIds);
                                            successfulTasks.forEach(t => {
                                              if (checked) newSelected.add(t.id);
                                              else newSelected.delete(t.id);
                                            });
                                            setSelectedTaskIds(newSelected);
                                          }}
                                        />
                                        <Label htmlFor="select-all-success" className="text-sm">Select All</Label>
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            const selected = successfulTasks.filter(t => selectedTaskIds.has(t.id));
                                            if (selected.length > 0) {
                                              handleImportTasks(job.id, selected.map(t => t.id));
                                            } else {
                                              handleImportTasks(job.id, undefined, true);
                                            }
                                          }}
                                          disabled={importing}
                                        >
                                          {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                          Import {successfulTasks.filter(t => selectedTaskIds.has(t.id)).length > 0 
                                            ? `Selected (${successfulTasks.filter(t => selectedTaskIds.has(t.id)).length})`
                                            : `All (${successfulTasks.length})`}
                                        </Button>
                                      </div>
                                    </div>
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="w-8"></TableHead>
                                          <TableHead>Email</TableHead>
                                          <TableHead>Password</TableHead>
                                          <TableHead>Duration</TableHead>
                                          <TableHead>Status</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {successfulTasks.map((task) => (
                                          <TableRow key={task.id}>
                                            <TableCell>
                                              <Checkbox
                                                checked={selectedTaskIds.has(task.id)}
                                                onCheckedChange={(checked) => {
                                                  const newSelected = new Set(selectedTaskIds);
                                                  if (checked) newSelected.add(task.id);
                                                  else newSelected.delete(task.id);
                                                  setSelectedTaskIds(newSelected);
                                                }}
                                              />
                                            </TableCell>
                                            <TableCell className="font-mono text-sm">{task.email}</TableCell>
                                            <TableCell>
                                              <code className="text-xs bg-muted px-1 py-0.5 rounded">{task.password || "-"}</code>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                              {formatDuration(task.durationMs)}
                                            </TableCell>
                                            <TableCell>
                                              {task.imported ? (
                                                <Badge variant="outline" className="bg-blue-50 text-blue-700">Imported</Badge>
                                              ) : (
                                                <Badge variant="outline" className="bg-green-50 text-green-700">Ready</Badge>
                                              )}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                )}

                                {/* Failed Tasks Section */}
                                {failedTasks.length > 0 && (
                                  <div className="border rounded-lg p-4 bg-red-50/50">
                                    <div className="flex items-center justify-between mb-3">
                                      <div className="flex items-center gap-2">
                                        <XCircle className="h-5 w-5 text-red-600" />
                                        <span className="font-medium text-red-800">
                                          Failed Tasks ({failedTasks.length})
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Checkbox
                                          id="select-all-failed"
                                          checked={failedTasks.every(t => selectedTaskIds.has(t.id))}
                                          onCheckedChange={(checked) => {
                                            const newSelected = new Set(selectedTaskIds);
                                            failedTasks.forEach(t => {
                                              if (checked) newSelected.add(t.id);
                                              else newSelected.delete(t.id);
                                            });
                                            setSelectedTaskIds(newSelected);
                                          }}
                                        />
                                        <Label htmlFor="select-all-failed" className="text-sm">Select All</Label>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => {
                                            const selected = failedTasks.filter(t => selectedTaskIds.has(t.id));
                                            if (selected.length > 0) {
                                              handleRetryTasks(job.id, selected.map(t => t.id));
                                            } else {
                                              handleRetryTasks(job.id, undefined, true);
                                            }
                                          }}
                                          disabled={retrying}
                                        >
                                          {retrying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                                          Retry {failedTasks.filter(t => selectedTaskIds.has(t.id)).length > 0 
                                            ? `Selected (${failedTasks.filter(t => selectedTaskIds.has(t.id)).length})`
                                            : `All (${failedTasks.length})`}
                                        </Button>
                                      </div>
                                    </div>
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="w-8"></TableHead>
                                          <TableHead>Email</TableHead>
                                          <TableHead>Error</TableHead>
                                          <TableHead>Duration</TableHead>
                                          <TableHead>Retries</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {failedTasks.map((task) => (
                                          <TableRow key={task.id}>
                                            <TableCell>
                                              <Checkbox
                                                checked={selectedTaskIds.has(task.id)}
                                                onCheckedChange={(checked) => {
                                                  const newSelected = new Set(selectedTaskIds);
                                                  if (checked) newSelected.add(task.id);
                                                  else newSelected.delete(task.id);
                                                  setSelectedTaskIds(newSelected);
                                                }}
                                              />
                                            </TableCell>
                                            <TableCell className="font-mono text-sm">{task.email}</TableCell>
                                            <TableCell className="text-sm text-red-600 max-w-xs truncate">
                                              {task.errorMessage || task.lastError || "Unknown error"}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                              {formatDuration(task.durationMs)}
                                            </TableCell>
                                            <TableCell>
                                              <Badge variant="outline">{task.retryCount}</Badge>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                )}

                                {/* Pending/Running Tasks Section */}
                                {expandedJobTasks.filter(t => t.status === "PENDING" || t.status === "RUNNING").length > 0 && (
                                  <div className="border rounded-lg p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                      <Loader2 className="h-5 w-5 text-yellow-600" />
                                      <span className="font-medium">
                                        In Progress ({expandedJobTasks.filter(t => t.status === "PENDING" || t.status === "RUNNING").length})
                                      </span>
                                    </div>
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Email</TableHead>
                                          <TableHead>Status</TableHead>
                                          <TableHead>Progress</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {expandedJobTasks.filter(t => t.status === "PENDING" || t.status === "RUNNING").map((task) => (
                                          <TableRow key={task.id}>
                                            <TableCell className="font-mono text-sm">{task.email}</TableCell>
                                            <TableCell>{getStatusBadge(task.status)}</TableCell>
                                            <TableCell>
                                              {task.status === "RUNNING" ? (
                                                <div className="flex items-center gap-2">
                                                  <Progress value={task.stepProgress || 0} className="w-24" />
                                                  <span className="text-xs text-muted-foreground">{task.currentStep}</span>
                                                </div>
                                              ) : (
                                                <span className="text-xs text-muted-foreground">Waiting...</span>
                                              )}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                )}

                                {/* Empty state */}
                                {expandedJobTasks.length === 0 && (
                                  <div className="text-center py-8 text-muted-foreground">
                                    <p>No tasks in this job</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
              {jobs.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No jobs yet</p>
                  <p className="text-sm">Create a job from the New Job tab</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CONFIG TAB */}
        <TabsContent value="config" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* IMAP Providers */}
            <Card>
              <CardHeader>
                <CardTitle>IMAP Providers</CardTitle>
                <CardDescription>Manage IMAP providers for email verification</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Add new provider */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Provider name (e.g., outlook)"
                    value={newProviderName}
                    onChange={(e) => setNewProviderName(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Display name"
                    value={newProviderDisplayName}
                    onChange={(e) => setNewProviderDisplayName(e.target.value)}
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleAddImapProvider}
                    disabled={addingProvider || !newProviderName.trim() || !newProviderDisplayName.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                
                {/* Provider list */}
                <div className="space-y-2">
                  {/* Built-in providers */}
                  <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                    <div>
                      <div className="font-medium">AYCD Inbox</div>
                      <div className="text-sm text-muted-foreground">Built-in</div>
                    </div>
                    <Badge variant="success">Enabled</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                    <div>
                      <div className="font-medium">Gmail IMAP</div>
                      <div className="text-sm text-muted-foreground">Built-in</div>
                    </div>
                    <Badge variant="success">Enabled</Badge>
                  </div>
                  
                  {/* Custom providers */}
                  {imapProviders.map((provider) => (
                    <div key={provider.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{provider.displayName}</div>
                        <div className="text-sm text-muted-foreground">{provider.name}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={provider.isEnabled ? "success" : "secondary"}>
                          {provider.isEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteImapProvider(provider.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* API Keys */}
            <Card>
              <CardHeader>
                <CardTitle>API Keys</CardTitle>
                <CardDescription>Configure external service API keys</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Daisy SMS */}
                <div className="space-y-2">
                  <Label>Daisy SMS API Key</Label>
                  <div className="flex gap-2">
                    <Input
                      type={showApiKeys.daisy ? "text" : "password"}
                      placeholder="Enter API key..."
                      value={config.daisy_sms_api_key || ""}
                      onChange={(e) => setConfig({ ...config, daisy_sms_api_key: e.target.value })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowApiKeys({ ...showApiKeys, daisy: !showApiKeys.daisy })}
                    >
                      {showApiKeys.daisy ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {/* AYCD Inbox */}
                <div className="space-y-2">
                  <Label>AYCD Inbox API Key</Label>
                  <div className="flex gap-2">
                    <Input
                      type={showApiKeys.aycd ? "text" : "password"}
                      placeholder="Enter API key..."
                      value={config.aycd_inbox_api_key || ""}
                      onChange={(e) => setConfig({ ...config, aycd_inbox_api_key: e.target.value })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowApiKeys({ ...showApiKeys, aycd: !showApiKeys.aycd })}
                    >
                      {showApiKeys.aycd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <Button onClick={handleSaveConfig} disabled={configSaving}>
                  {configSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Save API Keys
                </Button>
              </CardContent>
            </Card>

            {/* Discord Webhooks */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Discord Webhooks</CardTitle>
                <CardDescription>Configure Discord notifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  {/* Success Webhook */}
                  <div className="space-y-2">
                    <Label>Success Webhook</Label>
                    <Input
                      placeholder="https://discord.com/api/webhooks/..."
                      value={config.discord_webhook_success || ""}
                      onChange={(e) => setConfig({ ...config, discord_webhook_success: e.target.value })}
                    />
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleTestWebhook("success")}
                      disabled={testingWebhook === "success"}
                    >
                      {testingWebhook === "success" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      Test
                    </Button>
                  </div>

                  {/* Error Webhook */}
                  <div className="space-y-2">
                    <Label>Error Webhook</Label>
                    <Input
                      placeholder="https://discord.com/api/webhooks/..."
                      value={config.discord_webhook_error || ""}
                      onChange={(e) => setConfig({ ...config, discord_webhook_error: e.target.value })}
                    />
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleTestWebhook("error")}
                      disabled={testingWebhook === "error"}
                    >
                      {testingWebhook === "error" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      Test
                    </Button>
                  </div>

                  {/* Misc Webhook */}
                  <div className="space-y-2">
                    <Label>Misc Webhook</Label>
                    <Input
                      placeholder="https://discord.com/api/webhooks/..."
                      value={config.discord_webhook_misc || ""}
                      onChange={(e) => setConfig({ ...config, discord_webhook_misc: e.target.value })}
                    />
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleTestWebhook("misc")}
                      disabled={testingWebhook === "misc"}
                    >
                      {testingWebhook === "misc" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      Test
                    </Button>
                  </div>
                </div>

                <Button onClick={handleSaveConfig} disabled={configSaving}>
                  {configSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Save Webhooks
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Generation Job</DialogTitle>
            <DialogDescription>
              This will create a job to generate {emailCount} accounts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Accounts:</span>
              <span className="font-medium">{emailCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IMAP Provider:</span>
              <span className="font-medium">{imapProvider}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Auto Import:</span>
              <span className="font-medium">{autoImport ? "Yes" : "No"}</span>
            </div>
            {selectedTagId && selectedTagId !== "__none__" && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tag:</span>
                <span className="font-medium">{tags.find(t => t.id === selectedTagId)?.name}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmModal(false)}>Cancel</Button>
            <Button onClick={handleSubmitJob}>
              <Zap className="mr-2 h-4 w-4" />
              Start Generation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
