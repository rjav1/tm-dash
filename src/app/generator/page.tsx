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
}

interface GeneratorEmail {
  id: string;
  email: string;
  status: string;
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

interface GeneratorConfig {
  daisy_sms_api_key?: string;
  daisy_sms_country?: string;
  daisy_sms_min_balance?: number;
  aycd_inbox_api_key?: string;
  aycd_inbox_enabled?: boolean;
  discord_webhook_success?: string;
  discord_webhook_error?: string;
  discord_webhook_misc?: string;
}

const statusColors: Record<string, "default" | "success" | "destructive" | "warning" | "secondary"> = {
  PENDING: "secondary",
  RUNNING: "warning",
  COMPLETED: "success",
  FAILED: "destructive",
  CANCELLED: "default",
  SUCCESS: "success",
  AVAILABLE: "success",
  IN_USE: "warning",
  USED: "secondary",
  BAD: "destructive",
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
  const [activeTab, setActiveTab] = useState("new-job");
  const [loading, setLoading] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

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

  // Proxy pool state
  const [proxies, setProxies] = useState<GeneratorProxy[]>([]);
  const [proxyStats, setProxyStats] = useState<PoolStats>({ AVAILABLE: 0, IN_USE: 0, BAD: 0 });
  const [badProxies, setBadProxies] = useState<BadProxy[]>([]);
  const [newProxies, setNewProxies] = useState("");
  const [addingProxies, setAddingProxies] = useState(false);

  // Tags state
  const [tags, setTags] = useState<AccountTag[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<string>("");
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");
  const [creatingTag, setCreatingTag] = useState(false);

  // New job form state
  const [emailCount, setEmailCount] = useState("10");
  const [imapProvider, setImapProvider] = useState("aycd");
  const [autoImport, setAutoImport] = useState(false);
  const [threadCount, setThreadCount] = useState("3");
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Config state
  const [config, setConfig] = useState<GeneratorConfig>({});
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({});
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);

  // Import/Retry state
  const [importing, setImporting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const { toast } = useToast();
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Fetch functions
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
      const response = await fetch("/api/tags");
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

  // Initial data fetch
  useEffect(() => {
    fetchJobs();
    fetchEmails();
    fetchProxies();
    fetchTags();
    fetchConfig();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscription
  useEffect(() => {
    const supabaseClient = getSupabase();
    if (!isSupabaseConfigured() || !supabaseClient) return;

    const channel = supabaseClient
      .channel("generator-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "generator_jobs" }, () => fetchJobs())
      .on("postgres_changes", { event: "*", schema: "public", table: "generator_tasks" }, () => {
        fetchJobs();
        if (expandedJobId) {
          fetch(`/api/generator/jobs/${expandedJobId}`)
            .then((res) => res.json())
            .then((data) => data.job?.tasks && setExpandedJobTasks(data.job.tasks))
            .catch(console.error);
        }
      })
      .subscribe((status) => setRealtimeConnected(status === "SUBSCRIBED"));

    channelRef.current = channel;
    return () => { if (channelRef.current && supabaseClient) supabaseClient.removeChannel(channelRef.current); };
  }, [expandedJobId, fetchJobs]);

  // Handlers
  const handleAddEmails = async () => {
    if (!newEmails.trim()) return;
    setAddingEmails(true);
    try {
      const response = await fetch("/api/generator/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: newEmails }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast({ title: "Emails Added", description: data.message });
      setNewEmails("");
      fetchEmails();
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
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to delete", variant: "destructive" });
    }
  };

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
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to restore", variant: "destructive" });
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    setCreatingTag(true);
    try {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
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
          threadCount: parseInt(threadCount, 10),
          tagId: selectedTagId || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast({ title: "Job Created", description: data.message });
      fetchJobs();
      fetchEmails();
      fetchProxies();
      setActiveTab("history");
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
      fetchJobs();
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
      // Refresh tasks
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

  const refreshAll = () => { fetchJobs(); fetchEmails(); fetchProxies(); fetchTags(); fetchConfig(); };

  // Computed values
  const selectedTag = tags.find((t) => t.id === selectedTagId);
  const requestedCount = parseInt(emailCount, 10) || 0;
  const canSubmit = requestedCount > 0 && requestedCount <= emailStats.AVAILABLE;

  // Task selection helpers
  const successfulTasks = expandedJobTasks.filter((t) => t.status === "SUCCESS" && !t.imported);
  const failedTasks = expandedJobTasks.filter((t) => t.status === "FAILED");
  const importedTasks = expandedJobTasks.filter((t) => t.imported);
  const selectedSuccessTasks = [...selectedTaskIds].filter((id) => successfulTasks.some((t) => t.id === id));
  const selectedFailedTasks = [...selectedTaskIds].filter((id) => failedTasks.some((t) => t.id === id));

  return (
    <div className="flex-1 space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Account Generator</h1>
          <p className="text-muted-foreground">Generate TicketMaster accounts using your email and proxy pools</p>
        </div>
        <div className="flex items-center gap-2">
          {isSupabaseConfigured() && (
            <Badge variant={realtimeConnected ? "success" : "secondary"} className="gap-1">
              {realtimeConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {realtimeConnected ? "Live" : "Connecting..."}
            </Badge>
          )}
          <Button variant="outline" onClick={refreshAll} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 max-w-2xl">
          <TabsTrigger value="new-job" className="gap-2"><Zap className="h-4 w-4" />New Job</TabsTrigger>
          <TabsTrigger value="emails" className="gap-2"><Mail className="h-4 w-4" />Emails</TabsTrigger>
          <TabsTrigger value="proxies" className="gap-2"><Server className="h-4 w-4" />Proxies</TabsTrigger>
          <TabsTrigger value="history" className="gap-2"><History className="h-4 w-4" />History</TabsTrigger>
          <TabsTrigger value="config" className="gap-2"><Settings className="h-4 w-4" />Config</TabsTrigger>
        </TabsList>

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
                    <div className="text-2xl font-bold text-green-600">{emailStats.AVAILABLE}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Available Proxies</div>
                    <div className="text-2xl font-bold text-blue-600">{proxyStats.AVAILABLE}</div>
                  </div>
                </div>

                {/* Email Count */}
                <div className="space-y-2">
                  <Label>Number of Accounts to Generate</Label>
                  <Input
                    type="number"
                    min="1"
                    max={emailStats.AVAILABLE}
                    value={emailCount}
                    onChange={(e) => setEmailCount(e.target.value)}
                    placeholder="Enter count..."
                  />
                  {requestedCount > emailStats.AVAILABLE && (
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
                    </SelectContent>
                  </Select>
                </div>

                {/* Thread Count */}
                <div className="space-y-2">
                  <Label>Thread Count</Label>
                  <Select value={threadCount} onValueChange={setThreadCount}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <SelectItem key={n} value={n.toString()}>{n} {n === 1 ? "thread" : "threads"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Tag Selection */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Tag className="h-4 w-4" />Tag (optional)</Label>
                  <Select value={selectedTagId || "none"} onValueChange={(v) => setSelectedTagId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select tag..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No tag</SelectItem>
                      {tags.map((tag) => (
                        <SelectItem key={tag.id} value={tag.id}>
                          <span className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color || "#6b7280" }} />
                            {tag.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Input placeholder="New tag..." value={newTagName} onChange={(e) => setNewTagName(e.target.value)} className="flex-1" />
                    <input type="color" value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)} className="w-10 h-10 rounded border cursor-pointer" />
                    <Button variant="outline" size="icon" onClick={handleCreateTag} disabled={!newTagName.trim() || creatingTag}>
                      {creatingTag ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {/* Auto Import Toggle */}
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <Label>Auto-Import on Success</Label>
                    <p className="text-xs text-muted-foreground">Automatically import accounts when generated</p>
                  </div>
                  <Switch checked={autoImport} onCheckedChange={setAutoImport} />
                </div>

                <Button className="w-full" onClick={() => setShowConfirmModal(true)} disabled={submitting || !canSubmit}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                  Start Generation ({requestedCount} accounts)
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Worker Status</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 p-4 rounded-lg border bg-muted/50">
                  <AlertCircle className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="font-medium">VPS Worker Required</p>
                    <p className="text-sm text-muted-foreground">Run <code className="bg-muted px-1 rounded">worker_daemon.py</code> on your VPS</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Active Jobs</span><span className="font-medium">{jobs.filter((j) => j.status === "RUNNING").length}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Pending Jobs</span><span className="font-medium">{jobs.filter((j) => j.status === "PENDING").length}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Completed Today</span><span className="font-medium">{jobs.filter((j) => j.status === "COMPLETED" && new Date(j.completedAt || j.createdAt).toDateString() === new Date().toDateString()).length}</span></div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* EMAILS TAB */}
        <TabsContent value="emails" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle>Add Emails</CardTitle>
                <CardDescription>One email per line. Emails that already exist as accounts will be automatically skipped.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea placeholder="email1@example.com&#10;email2@example.com&#10;..." className="min-h-[200px] font-mono text-sm" value={newEmails} onChange={(e) => setNewEmails(e.target.value)} />
                <Button className="w-full" onClick={handleAddEmails} disabled={addingEmails || !newEmails.trim()}>
                  {addingEmails ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Add Emails
                </Button>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Email Pool</CardTitle>
                  <div className="flex gap-2">
                    <Badge variant="success">{emailStats.AVAILABLE} Available</Badge>
                    {emailStats.IN_USE > 0 && <Badge variant="warning">{emailStats.IN_USE} In Use</Badge>}
                  </div>
                </div>
                <CardDescription>Emails are automatically removed from the pool once successfully generated into accounts.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-4">
                  <Button variant="outline" size="sm" onClick={() => handleDeleteEmails([], true, "AVAILABLE")}>Clear All</Button>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Status</TableHead><TableHead>Added</TableHead><TableHead></TableHead></TableRow></TableHeader>
                    <TableBody>
                      {emails.map((email) => (
                        <TableRow key={email.id}>
                          <TableCell className="font-mono text-sm">{email.email}</TableCell>
                          <TableCell><Badge variant={statusColors[email.status]}>{email.status}</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(email.createdAt)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteEmails([email.id])} disabled={email.status === "IN_USE"}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {emails.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No emails in pool. Add emails above to start generating accounts.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* PROXIES TAB */}
        <TabsContent value="proxies" className="space-y-6">
          {/* Add Proxies and Proxy Pool */}
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle>Add Proxies</CardTitle>
                <CardDescription>One proxy per line. Proxies are reused across jobs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea placeholder="ip:port:user:pass&#10;ip:port:user:pass&#10;..." className="min-h-[200px] font-mono text-sm" value={newProxies} onChange={(e) => setNewProxies(e.target.value)} />
                <Button className="w-full" onClick={handleAddProxies} disabled={addingProxies || !newProxies.trim()}>
                  {addingProxies ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Add Proxies
                </Button>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Proxy Pool</CardTitle>
                  <Badge variant="success">{proxyStats.AVAILABLE} Available</Badge>
                </div>
                <CardDescription>Proxies are selected using round-robin and can be reused across multiple jobs.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-4">
                  <Button variant="outline" size="sm" onClick={() => handleDeleteProxies([], true, "AVAILABLE")}>Clear All</Button>
                </div>
                <div className="max-h-[350px] overflow-y-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Proxy</TableHead><TableHead>Status</TableHead><TableHead>Uses</TableHead><TableHead></TableHead></TableRow></TableHeader>
                    <TableBody>
                      {proxies.map((proxy) => (
                        <TableRow key={proxy.id}>
                          <TableCell className="font-mono text-xs">{proxy.proxy}</TableCell>
                          <TableCell><Badge variant={statusColors[proxy.status]}>{proxy.status}</Badge></TableCell>
                          <TableCell>{proxy.useCount}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteProxies([proxy.id])} disabled={proxy.status === "IN_USE"}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {proxies.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No proxies in pool. Add proxies above.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bad Proxies - Separate Section */}
          <Card className="border-destructive/50">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-5 w-5" />
                    Bad Proxies
                  </CardTitle>
                  <CardDescription>Proxies that failed during generation are moved here. You can restore them to try again.</CardDescription>
                </div>
                <Badge variant="destructive">{badProxies.length} Bad</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {badProxies.length > 0 ? (
                <>
                  <div className="flex gap-2 mb-4">
                    <Button variant="outline" size="sm" onClick={() => handleRestoreBadProxies([], true)}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Restore All to Pool
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => {
                      fetch("/api/generator/bad-proxies", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ all: true }),
                      }).then(() => fetchProxies());
                    }}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete All
                    </Button>
                  </div>
                  <div className="max-h-[250px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Proxy</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Detected</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {badProxies.map((bp) => (
                          <TableRow key={bp.id}>
                            <TableCell className="font-mono text-xs">{bp.proxy}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{bp.reason || "Unknown error"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatDate(bp.detectedAt)}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" onClick={() => handleRestoreBadProxies([bp.id])} title="Restore to pool">
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => {
                                  fetch("/api/generator/bad-proxies", {
                                    method: "DELETE",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ ids: [bp.id] }),
                                  }).then(() => fetchProxies());
                                }} title="Delete permanently">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No bad proxies detected. Proxies that fail during generation will appear here.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history">
          <Card>
            <CardHeader><CardTitle>Job History</CardTitle><CardDescription>View jobs and import/retry accounts</CardDescription></CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No jobs yet</div>
              ) : (
                <div className="space-y-3">
                  {jobs.map((job) => (
                    <div key={job.id} className="border rounded-lg">
                      <div className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/50" onClick={() => toggleExpandJob(job.id)}>
                        <div className="flex-shrink-0">
                          {expandedJobId === job.id ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={statusColors[job.status]}><span className="mr-1">{statusIcons[job.status]}</span>{job.status}</Badge>
                            <span className="text-sm text-muted-foreground">{job.totalTasks} tasks</span>
                            <span className="text-sm text-muted-foreground">&bull; {job.imapProvider.toUpperCase()}</span>
                            {job.autoImport && <Badge variant="outline" className="text-xs">Auto-Import</Badge>}
                            {job.tag && <Badge variant="outline" className="gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: job.tag.color || "#6b7280" }} />{job.tag.name}</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">Created {formatDate(job.createdAt)}</div>
                        </div>
                        {(job.status === "RUNNING" || job.completed > 0) && (
                          <div className="flex-shrink-0 w-48">
                            <Progress value={(job.completed / job.totalTasks) * 100} className="h-2" />
                            <div className="flex justify-between text-xs text-muted-foreground mt-1">
                              <span>{job.completed}/{job.totalTasks}</span>
                              <span className="text-green-600">{job.succeeded} ok</span>
                              {job.failed > 0 && <span className="text-red-600">{job.failed} fail</span>}
                            </div>
                          </div>
                        )}
                        <div className="flex-shrink-0 flex gap-2" onClick={(e) => e.stopPropagation()}>
                          {(job.status === "PENDING" || job.status === "RUNNING") && <Button size="sm" variant="outline" onClick={() => handleCancelJob(job.id)}><Square className="h-4 w-4" /></Button>}
                          {job.status !== "RUNNING" && <Button size="sm" variant="outline" onClick={() => handleDeleteJob(job.id)}><Trash2 className="h-4 w-4" /></Button>}
                        </div>
                      </div>

                      {expandedJobId === job.id && (
                        <div className="border-t bg-muted/30 p-4">
                          {loadingTasks ? (
                            <div className="flex items-center justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                          ) : (
                            <div className="space-y-4">
                              {/* Successful Tasks (not imported) */}
                              {successfulTasks.length > 0 && (
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-medium text-green-600">Ready to Import ({successfulTasks.length})</h4>
                                    <div className="flex gap-2">
                                      <Button size="sm" variant="outline" onClick={() => handleImportTasks(job.id, selectedSuccessTasks)} disabled={importing || selectedSuccessTasks.length === 0}>
                                        {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                        Import Selected ({selectedSuccessTasks.length})
                                      </Button>
                                      <Button size="sm" onClick={() => handleImportTasks(job.id, undefined, true)} disabled={importing}>
                                        {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                        Import All
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="max-h-48 overflow-y-auto space-y-1">
                                    {successfulTasks.map((task) => (
                                      <div key={task.id} className="flex items-center gap-3 p-2 rounded bg-background border text-sm">
                                        <Checkbox checked={selectedTaskIds.has(task.id)} onCheckedChange={(c) => { const n = new Set(selectedTaskIds); c ? n.add(task.id) : n.delete(task.id); setSelectedTaskIds(n); }} />
                                        <Badge variant="success" className="w-20 justify-center">SUCCESS</Badge>
                                        <span className="font-mono text-xs flex-1 truncate">{task.email}</span>
                                        <span className="text-xs text-green-600">pw: {task.password}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Failed Tasks */}
                              {failedTasks.length > 0 && (
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-medium text-red-600">Failed ({failedTasks.length})</h4>
                                    <div className="flex gap-2">
                                      <Button size="sm" variant="outline" onClick={() => handleRetryTasks(job.id, selectedFailedTasks)} disabled={retrying || selectedFailedTasks.length === 0}>
                                        {retrying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                                        Retry Selected ({selectedFailedTasks.length})
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={() => handleRetryTasks(job.id, undefined, true)} disabled={retrying}>
                                        {retrying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                                        Retry All
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="max-h-48 overflow-y-auto space-y-1">
                                    {failedTasks.map((task) => (
                                      <div key={task.id} className="flex items-center gap-3 p-2 rounded bg-background border text-sm">
                                        <Checkbox checked={selectedTaskIds.has(task.id)} onCheckedChange={(c) => { const n = new Set(selectedTaskIds); c ? n.add(task.id) : n.delete(task.id); setSelectedTaskIds(n); }} />
                                        <Badge variant="destructive" className="w-20 justify-center">FAILED</Badge>
                                        <span className="font-mono text-xs flex-1 truncate">{task.email}</span>
                                        <span className="text-xs text-red-600 truncate max-w-48">{task.errorMessage}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Already Imported */}
                              {importedTasks.length > 0 && (
                                <div>
                                  <h4 className="font-medium text-muted-foreground mb-2">Already Imported ({importedTasks.length})</h4>
                                  <div className="max-h-32 overflow-y-auto space-y-1">
                                    {importedTasks.map((task) => (
                                      <div key={task.id} className="flex items-center gap-3 p-2 rounded bg-muted/50 text-sm opacity-60">
                                        <Badge variant="secondary" className="w-20 justify-center">IMPORTED</Badge>
                                        <span className="font-mono text-xs flex-1 truncate">{task.email}</span>
                                        <span className="text-xs text-muted-foreground">{task.importedAt ? formatDate(task.importedAt) : ""}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {expandedJobTasks.length === 0 && <div className="text-center py-4 text-muted-foreground text-sm">No tasks found</div>}
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
        </TabsContent>

        {/* CONFIG TAB */}
        <TabsContent value="config" className="space-y-6">
          {configLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>API Credentials</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  {/* Daisy SMS */}
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">Daisy SMS</h4>
                    <div className="space-y-2">
                      <Label>API Key</Label>
                      <div className="flex gap-2">
                        <Input type={showApiKeys.daisy ? "text" : "password"} placeholder="API key..." value={config.daisy_sms_api_key || ""} onChange={(e) => setConfig({ ...config, daisy_sms_api_key: e.target.value })} />
                        <Button variant="outline" size="icon" onClick={() => setShowApiKeys({ ...showApiKeys, daisy: !showApiKeys.daisy })}>
                          {showApiKeys.daisy ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Country</Label>
                        <Select value={config.daisy_sms_country || "US"} onValueChange={(v) => setConfig({ ...config, daisy_sms_country: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="US">United States</SelectItem>
                            <SelectItem value="CA">Canada</SelectItem>
                            <SelectItem value="UK">United Kingdom</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Min Balance ($)</Label>
                        <Input type="number" step="0.01" value={config.daisy_sms_min_balance || 0.5} onChange={(e) => setConfig({ ...config, daisy_sms_min_balance: parseFloat(e.target.value) })} />
                      </div>
                    </div>
                  </div>

                  {/* AYCD Inbox */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm">AYCD Inbox</h4>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Enabled</Label>
                        <Switch checked={config.aycd_inbox_enabled !== false} onCheckedChange={(c) => setConfig({ ...config, aycd_inbox_enabled: c })} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>API Key</Label>
                      <div className="flex gap-2">
                        <Input type={showApiKeys.aycd ? "text" : "password"} placeholder="API key..." value={config.aycd_inbox_api_key || ""} onChange={(e) => setConfig({ ...config, aycd_inbox_api_key: e.target.value })} />
                        <Button variant="outline" size="icon" onClick={() => setShowApiKeys({ ...showApiKeys, aycd: !showApiKeys.aycd })}>
                          {showApiKeys.aycd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Discord Webhooks</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {(["success", "error", "misc"] as const).map((type) => (
                    <div key={type} className="space-y-2">
                      <Label className="flex items-center gap-2 capitalize">
                        <span className={`w-3 h-3 rounded-full ${type === "success" ? "bg-green-500" : type === "error" ? "bg-red-500" : "bg-blue-500"}`} />
                        {type} Webhook
                      </Label>
                      <div className="flex gap-2">
                        <Input placeholder="https://discord.com/api/webhooks/..." value={(config[`discord_webhook_${type}` as keyof GeneratorConfig] as string) || ""} onChange={(e) => setConfig({ ...config, [`discord_webhook_${type}`]: e.target.value })} />
                        <Button variant="outline" size="icon" onClick={() => handleTestWebhook(type)} disabled={testingWebhook === type}>
                          {testingWebhook === type ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button className="w-full mt-4" onClick={handleSaveConfig} disabled={configSaving}>
                    {configSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Configuration
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Generation</DialogTitle>
            <DialogDescription>Review your job settings</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-between"><span className="text-muted-foreground">Accounts to generate</span><span className="font-medium">{requestedCount}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Available proxies</span><span className="font-medium">{proxyStats.AVAILABLE}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">IMAP Provider</span><span className="font-medium">{imapProvider.toUpperCase()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Thread count</span><span className="font-medium">{threadCount}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tag</span><span className="font-medium flex items-center gap-2">{selectedTag ? <><span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedTag.color || "#6b7280" }} />{selectedTag.name}</> : "None"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Auto-Import</span><span className="font-medium">{autoImport ? "Yes" : "No (Manual)"}</span></div>
            {proxyStats.AVAILABLE === 0 && <div className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/50 p-3 rounded-lg">Warning: No proxies available. Jobs will run without proxies.</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmModal(false)}>Cancel</Button>
            <Button onClick={handleSubmitJob} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Start Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
