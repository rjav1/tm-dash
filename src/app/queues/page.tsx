"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Upload, BarChart3, TrendingUp, TrendingDown, Award, ArrowUpDown, ChevronUp, ChevronDown, Download, CheckSquare, Square, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { FileUpload } from "@/components/file-upload";
import { StatsCard } from "@/components/stats-card";
import { QueueDistributionChart } from "@/components/queue-distribution-chart";
import { CompositeScoreCell } from "@/components/score-breakdown-tooltip";
import { PerformanceTooltip, PerformanceIndicators } from "@/components/performance-tooltip";
import { ScatterQuadrantChart } from "@/components/scatter-quadrant-chart";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { PaginationControls } from "@/components/pagination-controls";

interface QueuePosition {
  id: string;
  position: number;
  percentile: number | null;
  testedAt: string;
  source: string | null;
  account: {
    id: string;
    email: string;
    status: string;
    hasCard: boolean;
    hasPurchased: boolean;
  };
  event: {
    id: string;
    tmEventId: string;
    name: string;
  };
}

interface EventOption {
  id: string;
  tmEventId: string;
  name: string;
  eventDate: string | null;
  venue: string | null;
  count: number;
}

interface Stats {
  avgPosition: number;
  minPosition: number;
  maxPosition: number;
  totalAccounts: number;
}

interface DistributionData {
  histogram: { bucket: string; count: number; start: number; end: number }[];
  scatter: { rank: number; position: number; id?: string }[];
  excludedScatter?: { rank: number; position: number; id?: string; excluded: boolean; reason?: string }[];
  excludedCount?: number;
}

interface ScoreBreakdown {
  percentileScore: number;
  consistencyScore: number;
  recentPerformanceScore: number;
  eventCoverageScore: number;
  purchaseSuccessScore: number;
  percentileContribution: number;
  consistencyContribution: number;
  recentPerformanceContribution: number;
  eventCoverageContribution: number;
  purchaseSuccessContribution: number;
  compositeScore: number;
  confidence: "low" | "medium" | "high";
  confidenceReason: string;
}

interface EventPerformance {
  eventId: string;
  eventName: string;
  artistName?: string | null;
  eventDateRaw?: string | null;
  venue?: string | null;
  position: number;
  percentile: number;
  totalParticipants: number;
  testedAt: string;
}

interface AccountRanking {
  rank: number;
  accountId: string;
  email: string;
  hasPurchased: boolean;
  eventsEntered: number;
  avgPercentile: number;
  weightedPercentile: number;
  bestPercentile: number;
  worstPercentile: number;
  percentileRange: number;
  consistencyScore: number;
  recentAvgPercentile: number;
  improvementScore: number;
  lastTestedAt: string | null;
  scoreBreakdown: ScoreBreakdown;
  performances: EventPerformance[];
}

interface RankingsStats {
  totalAccounts: number;
  filteredAccounts: number;
  totalEvents: number;
  totalQueueTests: number;
  avgPercentile: number;
  avgCompositeScore: number;
  avgEventsPerAccount: number;
  accountsWithMultipleEvents: number;
}

type SortColumn = "position" | "percentile" | "email" | "testedAt" | "hasPurchased";
type SortOrder = "asc" | "desc";
type ViewMode = "single-event" | "all-events" | "visualization";

export default function QueuesPage() {
  const [queuePositions, setQueuePositions] = useState<QueuePosition[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [rankingsStats, setRankingsStats] = useState<RankingsStats | null>(null);
  const [distribution, setDistribution] = useState<DistributionData | null>(null);
  const [accountRankings, setAccountRankings] = useState<AccountRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("all-events");
  const [sortBy, setSortBy] = useState<string>("compositeScore");
  const [minEvents, setMinEvents] = useState<number>(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("position");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  
  // Row selection state
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  
  const { toast } = useToast();

  const fetchQueues = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
        sortBy: sortColumn,
        sortOrder: sortOrder,
      });

      if (selectedEvent && selectedEvent !== "all") {
        params.set("eventId", selectedEvent);
      }

      const response = await fetch(`/api/queues?${params}`);
      const data = await response.json();

      setQueuePositions(data.queuePositions || []);
      setEvents(data.events || []);
      setStats(data.stats);
      setTotalPages(data.pagination?.pages || 1);
      setTotalItems(data.pagination?.total || 0);
    } catch (error) {
      console.error("Failed to fetch queues:", error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, selectedEvent, sortColumn, sortOrder]);

  const fetchDistribution = useCallback(async () => {
    if (!selectedEvent || selectedEvent === "all") {
      setDistribution(null);
      return;
    }

    try {
      const response = await fetch(`/api/analytics/distribution?eventId=${selectedEvent}`);
      const data = await response.json();
      setDistribution({
        histogram: data.histogram || [],
        scatter: data.scatter || [],
        excludedScatter: data.excludedScatter || [],
        excludedCount: data.excludedCount || 0,
      });
    } catch (error) {
      console.error("Failed to fetch distribution:", error);
    }
  }, [selectedEvent]);

  // Callback when exclusions change - refetch data
  const handleExclusionChange = useCallback(() => {
    fetchDistribution();
    fetchQueues();
  }, [fetchDistribution, fetchQueues]);

  const fetchAccountRankings = useCallback(async () => {
    if (viewMode === "single-event") return;

    setLoading(true);
    try {
      const minEventsFilter = minEvents;
      
      const params = new URLSearchParams({
        sortBy: sortBy,
        sortOrder: "asc",
        limit: "100",
        page: page.toString(),
        minEvents: minEventsFilter.toString(),
      });

      const response = await fetch(`/api/analytics/account-rankings?${params}`);
      const data = await response.json();
      setAccountRankings(data.accounts || []);
      setRankingsStats(data.stats || null);
      setTotalPages(data.pagination?.pages || 1);
    } catch (error) {
      console.error("Failed to fetch account rankings:", error);
    } finally {
      setLoading(false);
    }
  }, [sortBy, page, viewMode, minEvents]);

  useEffect(() => {
    if (viewMode === "single-event") {
      fetchQueues();
      fetchDistribution();
    } else {
      fetchAccountRankings();
    }
  }, [fetchQueues, fetchDistribution, fetchAccountRankings, viewMode]);

  const handleFileUpload = async (file: File) => {
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/import/queues", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Import Successful",
          description: `Imported ${data.imported} queue positions, updated ${data.updated || 0} (${data.skipped} skipped)`,
        });
        setShowUpload(false);
        fetchQueues();
        fetchAccountRankings();
      } else {
        toast({
          title: "Import Failed",
          description: data.error || "Unknown error",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Import Failed",
        description: "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortOrder("asc");
    }
    setPage(1);
  };

  // Row selection handlers
  const toggleRowSelection = (accountId: string) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(accountId)) {
        newSet.delete(accountId);
      } else {
        newSet.add(accountId);
      }
      return newSet;
    });
  };

  const selectAllOnPage = () => {
    const pageAccountIds = accountRankings.map(a => a.accountId);
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      pageAccountIds.forEach(id => newSet.add(id));
      return newSet;
    });
  };

  const deselectAll = () => {
    setSelectedRows(new Set());
  };

  const handleExport = async (exportAll: boolean) => {
    setExporting(true);
    try {
      const response = await fetch("/api/export/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountIds: exportAll ? undefined : Array.from(selectedRows),
          sortBy,
          minEvents: minEvents,
        }),
      });

      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `account-rankings-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export Successful",
        description: `Exported ${exportAll ? "all" : selectedRows.size} accounts to CSV`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export accounts",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const SortableHeader = ({ column, label }: { column: SortColumn; label: string }) => (
    <TableHead
      className="cursor-pointer hover:bg-muted/50"
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortColumn === column ? (
          sortOrder === "asc" ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )
        ) : (
          <ArrowUpDown className="h-4 w-4 opacity-30" />
        )}
      </div>
    </TableHead>
  );

  const getConfidenceBadge = (confidence: "low" | "medium" | "high") => {
    const variants: Record<string, "destructive" | "secondary" | "success"> = {
      low: "destructive",
      medium: "secondary",
      high: "success",
    };
    return <Badge variant={variants[confidence]} className="text-xs">{confidence}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Queue Analytics</h1>
          <p className="text-muted-foreground">
            Track and analyze account queue positions with data science insights
          </p>
        </div>
        <Button onClick={() => setShowUpload(!showUpload)}>
          <Upload className="h-4 w-4 mr-2" />
          Import Queue Data
        </Button>
      </div>

      {/* Upload Section */}
      {showUpload && (
        <Card>
          <CardHeader>
            <CardTitle>Import Queue File</CardTitle>
          </CardHeader>
          <CardContent>
            <FileUpload
              onFileSelect={handleFileUpload}
              description="Tab-separated file: email, event_id, position"
              accept={{ "text/plain": [".txt"], "text/csv": [".csv"] }}
            />
            {importing && (
              <p className="text-sm text-muted-foreground mt-4">
                Importing... This may take a moment for large files.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* View Mode Tabs */}
      <Tabs value={viewMode} onValueChange={(v) => { setViewMode(v as ViewMode); setPage(1); }}>
        <TabsList>
          <TabsTrigger value="single-event">Single Event</TabsTrigger>
          <TabsTrigger value="all-events">All Accounts</TabsTrigger>
          <TabsTrigger value="visualization">Scatter Plot</TabsTrigger>
        </TabsList>

        {/* Single Event View */}
        <TabsContent value="single-event" className="space-y-6">
          {/* Event Filter */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4 items-center">
                <div className="flex-1 max-w-md">
                  <Select value={selectedEvent} onValueChange={(v) => { setSelectedEvent(v); setPage(1); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an event to view queues" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Events</SelectItem>
                      {events?.map((event) => (
                        <SelectItem key={event.id} value={event.id}>
                          {event.name}
                          {event.eventDate && ` - ${event.eventDate}`}
                          {event.venue && ` @ ${event.venue}`}
                          {` (${event.count?.toLocaleString() || 0} accounts)`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedEvent && selectedEvent !== "all" && (
                  <Button variant="outline" onClick={() => setSelectedEvent("all")}>
                    Clear Filter
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Distribution Chart */}
          {selectedEvent && selectedEvent !== "all" && distribution && (
            <QueueDistributionChart
              histogram={distribution.histogram}
              scatter={distribution.scatter}
              excludedScatter={distribution.excludedScatter}
              excludedCount={distribution.excludedCount}
              eventId={selectedEvent}
              eventName={events.find(e => e.id === selectedEvent)?.name}
              onExclusionChange={handleExclusionChange}
            />
          )}

          {/* Stats for selected event */}
          {stats && selectedEvent && selectedEvent !== "all" && (
            <div className="grid gap-4 md:grid-cols-4">
              <StatsCard
                title="Total Accounts"
                value={stats.totalAccounts.toLocaleString()}
                icon={BarChart3}
              />
              <StatsCard
                title="Average Position"
                value={`#${stats.avgPosition.toLocaleString()}`}
                icon={TrendingUp}
              />
              <StatsCard
                title="Best Position"
                value={`#${stats.minPosition.toLocaleString()}`}
                icon={Award}
              />
              <StatsCard
                title="Worst Position"
                value={`#${stats.maxPosition.toLocaleString()}`}
                icon={TrendingDown}
              />
            </div>
          )}

          {/* Queue Positions Table */}
          <Card>
            <CardHeader>
              <CardTitle>
                Queue Positions
                {selectedEvent && selectedEvent !== "all" && ` (${queuePositions?.length || 0} shown)`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading queue positions...
                </div>
              ) : !queuePositions || queuePositions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {selectedEvent && selectedEvent !== "all"
                    ? "No queue positions for this event"
                    : "Select an event to view queue positions, or import queue data"}
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Rank</TableHead>
                        <SortableHeader column="email" label="Account" />
                        <SortableHeader column="position" label="Position" />
                        {selectedEvent && selectedEvent !== "all" && (
                          <SortableHeader column="percentile" label="Percentile" />
                        )}
                        <TableHead>Event</TableHead>
                        <SortableHeader column="hasPurchased" label="Has Purchased" />
                        <SortableHeader column="testedAt" label="Last Tested" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {queuePositions?.map((q, index) => (
                        <TableRow key={q.id}>
                          <TableCell className="font-medium">
                            #{(page - 1) * 100 + index + 1}
                          </TableCell>
                          <TableCell>{q.account?.email || "Unknown"}</TableCell>
                          <TableCell className="font-mono">
                            #{q.position?.toLocaleString() || 0}
                          </TableCell>
                          {selectedEvent && selectedEvent !== "all" && (
                            <TableCell className="font-mono">
                              {q.percentile !== null ? `${q.percentile}%` : "-"}
                            </TableCell>
                          )}
                          <TableCell className="truncate max-w-[200px]">
                            {q.event?.name || "Unknown Event"}
                          </TableCell>
                          <TableCell>
                            {q.account?.hasPurchased ? (
                              <Badge variant="success">Yes</Badge>
                            ) : (
                              <Badge variant="secondary">No</Badge>
                            )}
                          </TableCell>
                          <TableCell>{formatDate(q.testedAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  <PaginationControls
                    page={page}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    totalItems={totalItems}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                      setPageSize(size);
                      setPage(1);
                    }}
                    pageSizeOptions={[25, 50, 100]}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* All Events / Account Rankings View */}
        <TabsContent value="all-events" className="space-y-6">
          <AccountRankingsTable
            accountRankings={accountRankings}
            rankingsStats={rankingsStats}
            loading={loading}
            sortBy={sortBy}
            setSortBy={(v) => { setSortBy(v); setPage(1); }}
            minEvents={minEvents}
            setMinEvents={(v) => { setMinEvents(v); setPage(1); }}
            page={page}
            totalPages={totalPages}
            setPage={setPage}
            selectedRows={selectedRows}
            toggleRowSelection={toggleRowSelection}
            selectAllOnPage={selectAllOnPage}
            deselectAll={deselectAll}
            handleExport={handleExport}
            exporting={exporting}
            showMinEventsFilter={true}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
        </TabsContent>

        {/* Visualization View */}
        <TabsContent value="visualization" className="space-y-6">
          <ScatterQuadrantChart
            data={accountRankings.map(a => ({
              accountId: a.accountId,
              email: a.email,
              avgPercentile: a.avgPercentile,
              consistencyScore: a.consistencyScore,
              eventsEntered: a.eventsEntered,
              hasPurchased: a.hasPurchased,
              compositeScore: a.scoreBreakdown.compositeScore,
            }))}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Extracted component for account rankings table
function AccountRankingsTable({
  accountRankings,
  rankingsStats,
  loading,
  sortBy,
  setSortBy,
  minEvents,
  setMinEvents,
  page,
  totalPages,
  setPage,
  selectedRows,
  toggleRowSelection,
  selectAllOnPage,
  deselectAll,
  handleExport,
  exporting,
  showMinEventsFilter,
  searchQuery,
  setSearchQuery,
}: {
  accountRankings: AccountRanking[];
  rankingsStats: RankingsStats | null;
  loading: boolean;
  sortBy: string;
  setSortBy: (v: string) => void;
  minEvents: number;
  setMinEvents: (v: number) => void;
  page: number;
  totalPages: number;
  setPage: (v: number) => void;
  selectedRows: Set<string>;
  toggleRowSelection: (id: string) => void;
  selectAllOnPage: () => void;
  deselectAll: () => void;
  handleExport: (exportAll: boolean) => void;
  exporting: boolean;
  showMinEventsFilter: boolean;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
}) {
  // Filter accounts by search query
  const filteredRankings = useMemo(() => {
    if (!searchQuery.trim()) return accountRankings;
    const query = searchQuery.toLowerCase().trim();
    return accountRankings.filter(a => 
      a.email.toLowerCase().includes(query) ||
      a.accountId.toLowerCase().includes(query)
    );
  }, [accountRankings, searchQuery]);

  // Check if showing a single account detail view
  const singleAccountView = filteredRankings.length === 1 && searchQuery.trim().length > 3;
  return (
    <>
      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex gap-4 items-center flex-wrap">
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-[250px]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <span className="text-sm font-medium">Rank by:</span>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[280px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compositeScore">Composite Score (recommended)</SelectItem>
                  <SelectItem value="weightedPercentile">Weighted Percentile</SelectItem>
                  <SelectItem value="percentile">Average Percentile</SelectItem>
                  <SelectItem value="consistency">Consistency Score</SelectItem>
                  <SelectItem value="eventsEntered">Events Entered</SelectItem>
                  <SelectItem value="recentPerformance">Recent Performance</SelectItem>
                  <SelectItem value="improvement">Improvement (reroll detection)</SelectItem>
                </SelectContent>
              </Select>

              {showMinEventsFilter && (
                <>
                  <span className="text-sm font-medium">Min events:</span>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={minEvents}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 1 && val <= 100) {
                        setMinEvents(val);
                      }
                    }}
                    className="w-[80px]"
                  />
                </>
              )}
            </div>

            <div className="flex gap-2 items-center">
              <span className="text-sm text-muted-foreground">
                {selectedRows.size} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={selectAllOnPage}
              >
                <CheckSquare className="h-4 w-4 mr-1" />
                Select Page
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={deselectAll}
                disabled={selectedRows.size === 0}
              >
                Deselect All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport(false)}
                disabled={selectedRows.size === 0 || exporting}
              >
                <Download className="h-4 w-4 mr-1" />
                Export Selected ({selectedRows.size})
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => handleExport(true)}
                disabled={exporting}
              >
                <Download className="h-4 w-4 mr-1" />
                Export All
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      {rankingsStats && (
        <div className="grid gap-4 md:grid-cols-4">
          <StatsCard
            title="Accounts"
            value={rankingsStats.filteredAccounts.toLocaleString()}
            description={`${rankingsStats.totalAccounts} total`}
            icon={BarChart3}
          />
          <StatsCard
            title="Avg Composite Score"
            value={rankingsStats.avgCompositeScore.toFixed(1)}
            description="Higher is better"
            icon={Award}
          />
          <StatsCard
            title="Avg Percentile"
            value={`${rankingsStats.avgPercentile.toFixed(1)}%`}
            description="Lower is better"
            icon={TrendingUp}
          />
          <StatsCard
            title="Multi-Event Accounts"
            value={rankingsStats.accountsWithMultipleEvents.toLocaleString()}
            description="High confidence rankings"
            icon={TrendingDown}
          />
        </div>
      )}

      {/* Single Account Detail View */}
      {singleAccountView && filteredRankings[0] && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Account Details: {filteredRankings[0].email}
            </CardTitle>
            <CardDescription>
              Detailed performance breakdown for this account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              {/* Left Column - Metrics */}
              <div className="space-y-4">
                <h4 className="font-semibold text-lg">Performance Metrics</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground">Composite Score</div>
                    <div className="text-2xl font-bold">{filteredRankings[0].scoreBreakdown.compositeScore.toFixed(1)}</div>
                    <div className="text-xs text-muted-foreground">
                      {getConfidenceBadge(filteredRankings[0].scoreBreakdown.confidence)}
                    </div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground">Avg Percentile</div>
                    <div className="text-2xl font-bold">{filteredRankings[0].avgPercentile.toFixed(1)}%</div>
                    <div className="text-xs text-muted-foreground">Lower is better</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground">Consistency</div>
                    <div className="text-2xl font-bold">{filteredRankings[0].consistencyScore.toFixed(0)}</div>
                    <div className="text-xs text-muted-foreground">Higher is better</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground">Events Entered</div>
                    <div className="text-2xl font-bold">{filteredRankings[0].eventsEntered}</div>
                    <div className="text-xs text-muted-foreground">
                      {filteredRankings[0].hasPurchased ? (
                        <Badge variant="success" className="text-xs">Has Purchased</Badge>
                      ) : (
                        <span>No purchases</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="p-3 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground mb-2">Percentile Range</div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-green-600">Best: {filteredRankings[0].bestPercentile.toFixed(1)}%</Badge>
                    <span className="text-muted-foreground">→</span>
                    <Badge variant="outline" className="text-red-600">Worst: {filteredRankings[0].worstPercentile.toFixed(1)}%</Badge>
                    <span className="text-sm text-muted-foreground ml-2">
                      (Range: {filteredRankings[0].percentileRange.toFixed(1)}pp)
                    </span>
                  </div>
                </div>

                {filteredRankings[0].improvementScore !== 0 && (
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground mb-1">Improvement Trend</div>
                    <div className="flex items-center gap-2">
                      {filteredRankings[0].improvementScore > 0 ? (
                        <>
                          <TrendingUp className="h-4 w-4 text-green-600" />
                          <span className="text-green-600 font-medium">
                            Improving ({filteredRankings[0].improvementScore.toFixed(1)}pp better recently)
                          </span>
                        </>
                      ) : (
                        <>
                          <TrendingDown className="h-4 w-4 text-red-600" />
                          <span className="text-red-600 font-medium">
                            Declining ({Math.abs(filteredRankings[0].improvementScore).toFixed(1)}pp worse recently)
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column - Event Performances */}
              <div className="space-y-4">
                <h4 className="font-semibold text-lg">Event Performance History</h4>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {filteredRankings[0].performances
                    .sort((a, b) => new Date(b.testedAt).getTime() - new Date(a.testedAt).getTime())
                    .map((perf, idx) => (
                      <div key={idx} className="p-3 bg-muted rounded-lg flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{perf.eventName || perf.eventId}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(perf.testedAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="font-medium">#{perf.position.toLocaleString()}</div>
                            <div className="text-xs text-muted-foreground">
                              of {perf.totalParticipants.toLocaleString()}
                            </div>
                          </div>
                          <Badge 
                            variant={perf.percentile < 10 ? "success" : perf.percentile < 30 ? "secondary" : "destructive"}
                            className="min-w-[60px] justify-center"
                          >
                            {perf.percentile.toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Score Breakdown */}
            <div className="mt-6 p-4 bg-muted/50 rounded-lg">
              <h4 className="font-semibold mb-3">Score Breakdown</h4>
              <div className="grid grid-cols-5 gap-4 text-center">
                <div>
                  <div className="text-sm text-muted-foreground">Percentile</div>
                  <div className="font-bold">{filteredRankings[0].scoreBreakdown.percentileScore.toFixed(0)}</div>
                  <div className="text-xs text-muted-foreground">×0.40 = {filteredRankings[0].scoreBreakdown.percentileContribution.toFixed(1)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Consistency</div>
                  <div className="font-bold">{filteredRankings[0].scoreBreakdown.consistencyScore.toFixed(0)}</div>
                  <div className="text-xs text-muted-foreground">×0.25 = {filteredRankings[0].scoreBreakdown.consistencyContribution.toFixed(1)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Recent</div>
                  <div className="font-bold">{filteredRankings[0].scoreBreakdown.recentPerformanceScore.toFixed(0)}</div>
                  <div className="text-xs text-muted-foreground">×0.15 = {filteredRankings[0].scoreBreakdown.recentPerformanceContribution.toFixed(1)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Events</div>
                  <div className="font-bold">{filteredRankings[0].scoreBreakdown.eventCoverageScore.toFixed(0)}</div>
                  <div className="text-xs text-muted-foreground">×0.10 = {filteredRankings[0].scoreBreakdown.eventCoverageContribution.toFixed(1)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Purchased</div>
                  <div className="font-bold">{filteredRankings[0].scoreBreakdown.purchaseSuccessScore}</div>
                  <div className="text-xs text-muted-foreground">×0.10 = {filteredRankings[0].scoreBreakdown.purchaseSuccessContribution.toFixed(1)}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {searchQuery ? `Search Results (${filteredRankings.length})` : "Account Rankings"}
          </CardTitle>
          <CardDescription>
            Hover over scores for detailed breakdown. Hover over performances to see individual event results.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading account rankings...
            </div>
          ) : filteredRankings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? (
                <>No accounts found matching &quot;{searchQuery}&quot;</>
              ) : (
                <>No account rankings available. Import queue data first.</>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={filteredRankings.length > 0 && filteredRankings.every(a => selectedRows.has(a.accountId))}
                        onCheckedChange={(checked) => {
                          if (checked) selectAllOnPage();
                          else deselectAll();
                        }}
                      />
                    </TableHead>
                    <TableHead className="w-[60px]">Rank</TableHead>
                    <TableHead>Account</TableHead>
                    <SortableRankingHeader 
                      label="Events" 
                      sortKey="eventsEntered" 
                      currentSort={sortBy} 
                      onSort={setSortBy} 
                    />
                    <SortableRankingHeader 
                      label="Score" 
                      sortKey="compositeScore" 
                      currentSort={sortBy} 
                      onSort={setSortBy} 
                    />
                    <SortableRankingHeader 
                      label="Confidence" 
                      sortKey="compositeScore" 
                      currentSort={sortBy} 
                      onSort={setSortBy}
                      disabled
                    />
                    <SortableRankingHeader 
                      label="Avg %ile" 
                      sortKey="percentile" 
                      currentSort={sortBy} 
                      onSort={setSortBy} 
                    />
                    <SortableRankingHeader 
                      label="Weighted" 
                      sortKey="weightedPercentile" 
                      currentSort={sortBy} 
                      onSort={setSortBy} 
                    />
                    <SortableRankingHeader 
                      label="Range" 
                      sortKey="percentile" 
                      currentSort={sortBy} 
                      onSort={setSortBy}
                      disabled
                    />
                    <SortableRankingHeader 
                      label="Consistency" 
                      sortKey="consistency" 
                      currentSort={sortBy} 
                      onSort={setSortBy} 
                    />
                    <SortableRankingHeader 
                      label="Recent" 
                      sortKey="recentPerformance" 
                      currentSort={sortBy} 
                      onSort={setSortBy} 
                    />
                    <SortableRankingHeader 
                      label="Improvement" 
                      sortKey="improvement" 
                      currentSort={sortBy} 
                      onSort={setSortBy} 
                    />
                    <TableHead>Purchased</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRankings.map((account) => (
                    <TableRow
                      key={account.accountId}
                      className={selectedRows.has(account.accountId) ? "bg-muted/50" : ""}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedRows.has(account.accountId)}
                          onCheckedChange={() => toggleRowSelection(account.accountId)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">#{account.rank}</TableCell>
                      <TableCell className="max-w-[180px] truncate">
                        <PerformanceTooltip performances={account.performances}>
                          <span className="hover:underline cursor-help">{account.email}</span>
                        </PerformanceTooltip>
                      </TableCell>
                      <TableCell className="text-center">{account.eventsEntered}</TableCell>
                      <TableCell>
                        <CompositeScoreCell
                          score={account.scoreBreakdown.compositeScore}
                          breakdown={account.scoreBreakdown}
                        />
                      </TableCell>
                      <TableCell>
                        {getConfidenceBadge(account.scoreBreakdown.confidence)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {account.avgPercentile.toFixed(1)}%
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {account.weightedPercentile.toFixed(1)}%
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {account.bestPercentile.toFixed(0)}-{account.worstPercentile.toFixed(0)}%
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            account.consistencyScore > 80
                              ? "success"
                              : account.consistencyScore > 50
                              ? "default"
                              : "secondary"
                          }
                        >
                          {account.consistencyScore}%
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {account.recentAvgPercentile.toFixed(1)}%
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        <span className={account.improvementScore > 0 ? "text-green-600" : account.improvementScore < 0 ? "text-red-600" : ""}>
                          {account.improvementScore > 0 ? "+" : ""}{account.improvementScore.toFixed(1)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {account.hasPurchased ? (
                          <Badge variant="success">Yes</Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function getConfidenceBadge(confidence: "low" | "medium" | "high") {
  const variants: Record<string, "destructive" | "secondary" | "success"> = {
    low: "destructive",
    medium: "secondary",
    high: "success",
  };
  return <Badge variant={variants[confidence]} className="text-xs">{confidence}</Badge>;
}

function SortableRankingHeader({
  label,
  sortKey,
  currentSort,
  onSort,
  disabled = false,
}: {
  label: string;
  sortKey: string;
  currentSort: string;
  onSort: (key: string) => void;
  disabled?: boolean;
}) {
  const isActive = currentSort === sortKey;
  
  if (disabled) {
    return <TableHead>{label}</TableHead>;
  }
  
  return (
    <TableHead
      className="cursor-pointer hover:bg-muted/50 select-none"
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </div>
    </TableHead>
  );
}
