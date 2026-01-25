"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Search, Download, ArrowUpDown, Pencil, X, ChevronDown, ChevronRight, Loader2, Upload, RefreshCw, Check, CloudUpload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { PaginationControls } from "@/components/pagination-controls";
import { AccountEditDialog } from "@/components/account-edit-dialog";

interface AccountTag {
  id: string;
  name: string;
  color: string | null;
}

interface Account {
  id: string;
  email: string;
  password: string | null;
  status: string;
  hasPassword: boolean;
  imapProvider: string | null;
  createdAt: string;
  // POS import status
  posAccountId: number | null;
  posImportedAt: string | null;
  // Generation metadata
  generatedAt: string | null;
  generatorJobId: string | null;
  isGenerated: boolean;
  // Tags
  tags: AccountTag[];
  cards: {
    id: string;
    type: string;
    last4: string;
    profileName: string;
  }[];
  stats: {
    purchases: number;
    queueTests: number;
    successRate: number | null;
  };
  latestQueue: {
    position: number;
    event: string;
    testedAt: string;
  } | null;
}

interface ExpandedPurchase {
  id: string;
  status: string;
  quantity: number;
  totalPrice: number | null;
  section: string | null;
  row: string | null;
  createdAt: string;
  event: { 
    id: string;
    tmEventId: string;
    eventName: string; 
    artistName: string | null;
    venue: string | null;
    eventDate: string | null;
    eventDateRaw: string | null;
  } | null;
}

interface ExpandedQueue {
  id: string;
  position: number;
  percentile: number | null;
  totalParticipants: number;
  testedAt: string;
  excluded: boolean;
  event: { 
    id: string;
    tmEventId: string;
    eventName: string; 
    artistName: string | null;
    venue: string | null;
    eventDate: string | null;
    eventDateRaw: string | null;
  };
}

interface ExpandedAccountData {
  purchases: ExpandedPurchase[];
  queuePositions: ExpandedQueue[];
}

const statusColors: Record<string, "default" | "success" | "destructive" | "warning" | "secondary"> = {
  ACTIVE: "success",
  BANNED: "destructive",
  SUSPENDED: "warning",
  INACTIVE: "secondary",
  PENDING: "default",
};

type SortField = "email" | "status" | "createdAt" | "purchases" | "successRate";
type SortOrder = "asc" | "desc";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cardFilter, setCardFilter] = useState<string>("all");
  const [purchaseFilter, setPurchaseFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Edit dialog state
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  // Expanded rows state
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandedData, setExpandedData] = useState<Record<string, ExpandedAccountData>>({});
  const [loadingExpanded, setLoadingExpanded] = useState<Set<string>>(new Set());
  const [expandedTab, setExpandedTab] = useState<Record<string, "purchases" | "queues">>({});
  
  // Show passwords toggle
  const [showPasswords, setShowPasswords] = useState(false);
  
  // POS import state
  const [posImportedFilter, setPosImportedFilter] = useState<string>("all");
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  const [syncingFromPos, setSyncingFromPos] = useState(false);
  
  // Tag filter state
  const [tags, setTags] = useState<AccountTag[]>([]);
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [generatedFilter, setGeneratedFilter] = useState<string>("all");

  const { toast } = useToast();

  // Copy to clipboard helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: "Copied",
        description: `${label} copied to clipboard`,
      });
    }).catch(() => {
      toast({
        title: "Copy Failed",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    });
  };
  
  const toggleExpanded = async (accountId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (expandedIds.has(accountId)) {
      // Collapse
      const newExpanded = new Set(expandedIds);
      newExpanded.delete(accountId);
      setExpandedIds(newExpanded);
    } else {
      // Expand
      const newExpanded = new Set(expandedIds);
      newExpanded.add(accountId);
      setExpandedIds(newExpanded);
      
      // Set default tab to queues
      setExpandedTab(prev => ({ ...prev, [accountId]: "queues" }));
      
      // Fetch data if not already loaded
      if (!expandedData[accountId]) {
        const newLoading = new Set(loadingExpanded);
        newLoading.add(accountId);
        setLoadingExpanded(newLoading);
        
        try {
          const response = await fetch(`/api/accounts/${accountId}`);
          const data = await response.json();
          
          if (data.account) {
            setExpandedData(prev => ({
              ...prev,
              [accountId]: {
                purchases: data.account.purchases || [],
                queuePositions: data.account.queuePositions || [],
              },
            }));
          }
        } catch (error) {
          console.error("Failed to fetch account details:", error);
        } finally {
          const removeLoading = new Set(loadingExpanded);
          removeLoading.delete(accountId);
          setLoadingExpanded(removeLoading);
        }
      }
    }
  };

  // Fetch tags for filter dropdown
  const fetchTags = useCallback(async () => {
    try {
      const response = await fetch("/api/tags");
      const data = await response.json();
      setTags(data.tags || []);
    } catch (error) {
      console.error("Failed to fetch tags:", error);
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
        sortBy,
        sortOrder,
      });

      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (cardFilter !== "all") params.set("hasCard", cardFilter);
      if (purchaseFilter !== "all") params.set("hasPurchases", purchaseFilter);
      if (posImportedFilter !== "all") params.set("posImported", posImportedFilter);
      if (tagFilter !== "all") params.set("tagId", tagFilter);
      if (generatedFilter !== "all") params.set("generated", generatedFilter);

      const response = await fetch(`/api/accounts?${params}`);
      const data = await response.json();

      setAccounts(data.accounts || []);
      setTotalPages(data.pagination?.pages || 1);
      setTotalItems(data.pagination?.total || 0);
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, cardFilter, purchaseFilter, posImportedFilter, tagFilter, generatedFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(accounts.map((a) => a.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const handleExport = (exportAll: boolean) => {
    const toExport = exportAll
      ? accounts
      : accounts.filter((a) => selectedIds.has(a.id));

    if (toExport.length === 0) {
      toast({
        title: "No accounts to export",
        description: exportAll ? "No accounts found" : "Select accounts to export",
        variant: "destructive",
      });
      return;
    }

    // Build CSV
    const headers = [
      "Email",
      "Password",
      "Status",
      "IMAP Provider",
      "Card Profile",
      "Card Type",
      "Card Last 4",
      "Purchases",
      "Queue Tests",
      "Success Rate",
      "Created At",
    ];

    const rows = toExport.map((account) => [
      account.email,
      account.password || "",
      account.status,
      account.imapProvider || "",
      account.cards[0]?.profileName || "",
      account.cards[0]?.type || "",
      account.cards[0]?.last4 || "",
      account.stats.purchases.toString(),
      account.stats.queueTests.toString(),
      account.stats.successRate !== null ? `${account.stats.successRate}%` : "",
      formatDate(account.createdAt),
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((r) => r.map((v) => `"${v}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `accounts_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    toast({
      title: "Export Successful",
      description: `Exported ${toExport.length} accounts`,
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchAccounts();
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  // Import a single account to POS
  const handleImportToPos = async (accountId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    
    setImportingIds(prev => new Set(prev).add(accountId));
    
    try {
      const response = await fetch("/api/accounts/pos-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Account Imported",
          description: `${data.email} has been imported to TicketVault POS`,
        });
        fetchAccounts(); // Refresh to show updated status
      } else {
        toast({
          title: "Import Failed",
          description: data.error || "Failed to import account",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Import Error",
        description: "Failed to import account to POS",
        variant: "destructive",
      });
    } finally {
      setImportingIds(prev => {
        const next = new Set(prev);
        next.delete(accountId);
        return next;
      });
    }
  };

  // Import selected accounts to POS
  const handleBulkImportToPos = async () => {
    const toImport = accounts
      .filter(a => selectedIds.has(a.id) && !a.posAccountId && a.hasPassword)
      .map(a => a.id);
    
    if (toImport.length === 0) {
      toast({
        title: "No Accounts to Import",
        description: "Select accounts that have passwords and are not yet imported",
        variant: "destructive",
      });
      return;
    }

    for (const id of toImport) {
      setImportingIds(prev => new Set(prev).add(id));
    }

    try {
      const response = await fetch("/api/accounts/pos-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: toImport }),
      });
      
      const data = await response.json();
      
      toast({
        title: "Bulk Import Complete",
        description: `Imported ${data.imported} accounts, ${data.failed} failed`,
        variant: data.failed > 0 ? "destructive" : "default",
      });
      
      fetchAccounts();
    } catch (error) {
      toast({
        title: "Import Error",
        description: "Failed to import accounts to POS",
        variant: "destructive",
      });
    } finally {
      setImportingIds(new Set());
    }
  };

  // Sync import status from POS
  const handleSyncFromPos = async () => {
    setSyncingFromPos(true);
    
    try {
      const response = await fetch("/api/accounts/pos-sync", {
        method: "POST",
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Sync Complete",
          description: `Updated ${data.synced} accounts from POS`,
        });
        fetchAccounts();
      } else {
        toast({
          title: "Sync Failed",
          description: data.error || "Failed to sync from POS",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Sync Error",
        description: "Failed to sync accounts from POS",
        variant: "destructive",
      });
    } finally {
      setSyncingFromPos(false);
    }
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer hover:bg-muted/50"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={`h-3 w-3 ${sortBy === field ? "opacity-100" : "opacity-30"}`} />
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Accounts</h1>
          <p className="text-muted-foreground">
            Manage your Ticketmaster accounts
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleSyncFromPos}
            disabled={syncingFromPos}
          >
            {syncingFromPos ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Sync from POS
          </Button>
          {selectedIds.size > 0 && (
            <Button 
              variant="default"
              onClick={handleBulkImportToPos}
              disabled={importingIds.size > 0}
            >
              {importingIds.size > 0 ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CloudUpload className="h-4 w-4 mr-2" />
              )}
              Import to POS ({selectedIds.size})
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowPasswords(!showPasswords)}>
            {showPasswords ? "Hide Passwords" : "Show Passwords"}
          </Button>
          {selectedIds.size > 0 ? (
            <Button onClick={() => handleExport(false)}>
              <Download className="h-4 w-4 mr-2" />
              Export Selected ({selectedIds.size})
            </Button>
          ) : (
            <Button variant="outline" onClick={() => handleExport(true)}>
              <Download className="h-4 w-4 mr-2" />
              Export All
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[250px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
                {search && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setSearch("")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="BANNED">Banned</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Select value={cardFilter} onValueChange={setCardFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Card" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Has Card</SelectItem>
                <SelectItem value="false">No Card</SelectItem>
              </SelectContent>
            </Select>
            <Select value={purchaseFilter} onValueChange={setPurchaseFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Purchases" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                <SelectItem value="true">Has Purchases</SelectItem>
                <SelectItem value="false">No Purchases</SelectItem>
              </SelectContent>
            </Select>
            <Select value={posImportedFilter} onValueChange={setPosImportedFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="POS Import" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Imported to POS</SelectItem>
                <SelectItem value="false">Not in POS</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tags</SelectItem>
                {tags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: tag.color || "#6b7280" }}
                      />
                      {tag.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={generatedFilter} onValueChange={setGeneratedFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="true">Generated</SelectItem>
                <SelectItem value="false">Imported</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit">Search</Button>
          </form>
        </CardContent>
      </Card>

      {/* Accounts Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            Accounts ({totalItems.toLocaleString()})
          </CardTitle>
          {selectedIds.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear Selection
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading accounts...
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No accounts found
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30px]"></TableHead>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={selectedIds.size === accounts.length && accounts.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <SortHeader field="email">Email</SortHeader>
                    <TableHead>Password</TableHead>
                    <SortHeader field="status">Status</SortHeader>
                    <TableHead>Tags</TableHead>
                    <TableHead>Card</TableHead>
                    <SortHeader field="purchases">Purchases</SortHeader>
                    <SortHeader field="successRate">Success Rate</SortHeader>
                    <TableHead>Imported</TableHead>
                    <SortHeader field="createdAt">Created</SortHeader>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => {
                    const isExpanded = expandedIds.has(account.id);
                    const isLoading = loadingExpanded.has(account.id);
                    const data = expandedData[account.id];
                    const currentTab = expandedTab[account.id] || "queues";
                    
                    return (
                      <React.Fragment key={account.id}>
                        <TableRow
                          className={`cursor-pointer hover:bg-muted/50 ${isExpanded ? "bg-muted/30" : ""}`}
                          onClick={() => {
                            setEditingAccountId(account.id);
                            setEditDialogOpen(true);
                          }}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()} className="p-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={(e) => toggleExpanded(account.id, e)}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(account.id)}
                              onCheckedChange={(checked) => handleSelectOne(account.id, !!checked)}
                            />
                          </TableCell>
                          <TableCell className="font-medium" onClick={(e) => e.stopPropagation()}>
                            <span
                              className="cursor-pointer hover:text-primary hover:underline"
                              onClick={() => copyToClipboard(account.email, "Email")}
                              title="Click to copy"
                            >
                              {account.email}
                            </span>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {account.password ? (
                              <span
                                className="cursor-pointer hover:text-primary hover:underline font-mono text-sm"
                                onClick={() => copyToClipboard(account.password!, "Password")}
                                title="Click to copy"
                              >
                                {showPasswords ? account.password : "••••••••"}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 flex-wrap">
                              <Badge variant={statusColors[account.status] || "default"}>
                                {account.status}
                              </Badge>
                              {account.isGenerated && (
                                <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300">
                                  Generated
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {account.tags && account.tags.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {account.tags.map((tag) => (
                                  <Badge
                                    key={tag.id}
                                    variant="outline"
                                    className="text-xs gap-1"
                                    style={{ borderColor: tag.color || undefined }}
                                  >
                                    <span
                                      className="w-2 h-2 rounded-full"
                                      style={{ backgroundColor: tag.color || "#6b7280" }}
                                    />
                                    {tag.name}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {account.cards.length > 0 ? (
                              <div className="flex flex-col gap-1">
                                {account.cards.map((card) => (
                                  <span key={card.id} className="text-sm">
                                    {card.type} ****{card.last4}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">None</span>
                            )}
                          </TableCell>
                          <TableCell>{account.stats.purchases}</TableCell>
                          <TableCell>
                            {account.stats.successRate !== null ? (
                              <span
                                className={
                                  account.stats.successRate >= 50
                                    ? "text-green-600"
                                    : "text-red-600"
                                }
                              >
                                {account.stats.successRate}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {account.posAccountId ? (
                              <Badge variant="success" className="gap-1">
                                <Check className="h-3 w-3" />
                                Yes
                              </Badge>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={!account.hasPassword || importingIds.has(account.id)}
                                onClick={(e) => handleImportToPos(account.id, e)}
                                title={!account.hasPassword ? "Password required to import" : "Import to TicketVault POS"}
                              >
                                {importingIds.has(account.id) ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <Upload className="h-3 w-3 mr-1" />
                                    Import
                                  </>
                                )}
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDate(account.createdAt)}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingAccountId(account.id);
                                setEditDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                        
                        {/* Expanded Row */}
                        {isExpanded && (
                          <TableRow key={`${account.id}-expanded`} className="bg-muted/20 hover:bg-muted/20">
                            <TableCell colSpan={12} className="p-0">
                              <div className="px-4 py-3 border-l-4 border-primary/30">
                                {/* Tab Buttons */}
                                <div className="flex gap-2 mb-3">
                                  <Button
                                    variant={currentTab === "queues" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setExpandedTab(prev => ({ ...prev, [account.id]: "queues" }))}
                                  >
                                    Queues ({data?.queuePositions?.length || account.stats.queueTests})
                                  </Button>
                                  <Button
                                    variant={currentTab === "purchases" ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setExpandedTab(prev => ({ ...prev, [account.id]: "purchases" }))}
                                  >
                                    Purchases ({data?.purchases?.length || account.stats.purchases})
                                  </Button>
                                </div>
                                
                                {isLoading ? (
                                  <div className="flex items-center justify-center py-4">
                                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                    <span className="text-sm text-muted-foreground">Loading...</span>
                                  </div>
                                ) : currentTab === "queues" ? (
                                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                                    {data?.queuePositions?.length === 0 ? (
                                      <div className="text-sm text-muted-foreground py-2">No queue tests</div>
                                    ) : (
                                      data?.queuePositions?.map((q) => (
                                        <div
                                          key={q.id}
                                          className={`flex items-center justify-between p-2 bg-background rounded-md text-sm ${q.excluded ? "opacity-60" : ""}`}
                                        >
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium truncate flex items-center gap-2">
                                              {q.event?.artistName || q.event?.eventName || "Unknown Event"}
                                              {q.excluded && (
                                                <Badge variant="outline" className="text-xs text-muted-foreground">
                                                  Excluded
                                                </Badge>
                                              )}
                                            </div>
                                            <div className="text-xs text-muted-foreground truncate">
                                              {q.event?.eventDateRaw || (q.event?.eventDate ? formatDate(q.event.eventDate) : "")}
                                              {q.event?.venue && ` • ${q.event.venue}`}
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2 flex-shrink-0">
                                            <span className={`font-mono ${q.excluded ? "line-through" : ""}`}>#{q.position.toLocaleString()}</span>
                                            {!q.excluded && q.percentile != null && (
                                              <Badge 
                                                variant={q.percentile <= 20 ? "success" : q.percentile <= 50 ? "default" : "secondary"}
                                                className="text-xs"
                                              >
                                                {q.percentile}%
                                              </Badge>
                                            )}
                                            {!q.excluded && q.totalParticipants > 0 && (
                                              <span className="text-xs text-muted-foreground">
                                                /{q.totalParticipants.toLocaleString()}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                ) : (
                                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                                    {data?.purchases?.length === 0 ? (
                                      <div className="text-sm text-muted-foreground py-2">No purchases</div>
                                    ) : (
                                      data?.purchases?.map((p) => (
                                        <div
                                          key={p.id}
                                          className="flex items-center justify-between p-2 bg-background rounded-md text-sm"
                                        >
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium truncate">
                                              {p.event?.artistName || p.event?.eventName || "Unknown Event"}
                                            </div>
                                            <div className="text-xs text-muted-foreground truncate">
                                              {p.event?.eventDateRaw || (p.event?.eventDate ? formatDate(p.event.eventDate) : "")}
                                              {p.event?.venue && ` • ${p.event.venue}`}
                                              {p.section && ` • Sec ${p.section}`}
                                              {p.row && `, Row ${p.row}`}
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <Badge variant={p.status === "SUCCESS" ? "success" : "destructive"}>
                                              {p.status}
                                            </Badge>
                                            {p.totalPrice && (
                                              <span className="text-xs font-medium">
                                                ${Number(p.totalPrice).toFixed(0)}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              <PaginationControls
                page={page}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={totalItems}
                onPageChange={setPage}
                onPageSizeChange={handlePageSizeChange}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <AccountEditDialog
        accountId={editingAccountId}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSaved={() => {
          fetchAccounts();
        }}
      />
    </div>
  );
}
