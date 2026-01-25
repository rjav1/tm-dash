"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Search, Filter, DollarSign, CheckCircle2, XCircle, TrendingUp, Pencil, Link2, RefreshCw, Trash2, CheckSquare, Loader2, Calendar, Plus, Upload, Eye, EyeOff, Clock, Ticket, ExternalLink, CloudUpload } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PurchaseEditDialog } from "@/components/purchase-edit-dialog";
import { AddPurchaseDialog } from "@/components/add-purchase-dialog";
import { EmailCsvImportDialog } from "@/components/email-csv-import-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatsCard } from "@/components/stats-card";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { PaginationControls } from "@/components/pagination-controls";
import { PosExportModal } from "@/components/pos-export-modal";

interface ZonePrice {
  zoneName: string;
  minPrice: number;
}

interface Purchase {
  id: string;
  externalJobId: string | null;
  tmOrderNumber: string | null;
  dashboardPoNumber: string | null;
  status: string;
  quantity: number;
  priceEach: number;
  totalPrice: number;
  section: string | null;
  row: string | null;
  seats: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  checkoutUrl: string | null;
  confirmationUrl: string | null;
  createdAt: string;
  completedAt: string | null;
  attemptCount: number;
  // Price override fields
  priceOverrideType: string | null;
  priceOverrideZone: string | null;
  priceOverrideValue: number | null;
  // Comparison price info
  comparisonPrice: number | null;
  comparisonSource: string | null;
  matchedZone: string | null;
  // POS sync fields
  posSyncedAt: string | null;
  posTicketGroupId: number | null;
  posPurchaseOrderId: number | null;
  account: {
    id: string;
    email: string;
  };
  event: {
    id: string;
    tmEventId: string;
    name: string;
    eventDate: string | null;
    venue: string | null;
    getInPrice: number | null;
    getInPriceUrl: string | null;
    getInPriceUpdatedAt: string | null;
    zonePrices: ZonePrice[];
  } | null;
  card: {
    id: string;
    type: string;
    last4: string;
  } | null;
}

interface EventOption {
  id: string;
  name: string;
  eventDate: string | null;
  venue: string | null;
  count: number;
}

interface AccountOption {
  id: string;
  email: string;
  count: number;
}

interface CardOption {
  id: string;
  type: string;
  last4: string;
  count: number;
}

interface Stats {
  checkouts: number;
  totalTickets: number;
  revenue: number;
  unrealizedProfit: number;
  unrealizedSales: number;
  roi: number;
  marketplaceFeePercentage: number;
}

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [cards, setCards] = useState<CardOption[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [page, setPage] = useState(1);
  const startDateInputRef = useRef<HTMLInputElement>(null);
  const endDateInputRef = useRef<HTMLInputElement>(null);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  
  // New filter states
  const [sectionFilter, setSectionFilter] = useState<string>("");
  const [rowFilter, setRowFilter] = useState<string>("");
  const [poNumberFilter, setPoNumberFilter] = useState<string>("");
  const [posSyncFilter, setPosSyncFilter] = useState<string>("all"); // "all", "synced", "not_synced"
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [cardFilter, setCardFilter] = useState<string>("all"); // cardId or "all", "has_card", "no_card"
  const [minPriceFilter, setMinPriceFilter] = useState<string>("");
  const [maxPriceFilter, setMaxPriceFilter] = useState<string>("");
  const [minQuantityFilter, setMinQuantityFilter] = useState<string>("");
  const [maxQuantityFilter, setMaxQuantityFilter] = useState<string>("");
  const [orderNumberFilter, setOrderNumberFilter] = useState<string>("");
  const [seatsFilter, setSeatsFilter] = useState<string>("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  // Edit dialog state
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  // Add dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  
  // Email CSV import dialog state
  const [emailImportDialogOpen, setEmailImportDialogOpen] = useState(false);
  
  // Column visibility state
  const [showOrderNumber, setShowOrderNumber] = useState(false);
  
  // Price sync state
  const [syncingEventId, setSyncingEventId] = useState<string | null>(null);
  
  // Re-link state
  const [relinking, setRelinking] = useState(false);
  const [linkStats, setLinkStats] = useState<{ 
    withCards: number; 
    withoutCards: number; 
    total: number;
    breakdown?: {
      unlinkedSuccess: number;
      unlinkedFailed: number;
    };
  } | null>(null);
  
  // Bulk selection state
  const [selectedPurchases, setSelectedPurchases] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkZoneLoading, setBulkZoneLoading] = useState(false);
  const [bulkSectionDialogOpen, setBulkSectionDialogOpen] = useState(false);
  const [bulkZoneSections, setBulkZoneSections] = useState<Array<{zoneName: string; sections: string[]; sectionPrices?: Array<{sectionName: string; minPrice: number | null}>; minPrice: number | null}>>([]);
  const [bulkSelectedSections, setBulkSelectedSections] = useState<Set<string>>(new Set());
  
  // POS sync state
  const [posSyncing, setPosSyncing] = useState(false);
  const [posSyncDialogOpen, setPosSyncDialogOpen] = useState(false);
  const [posExportPreviewOpen, setPosExportPreviewOpen] = useState(false);
  const [eligiblePurchasesForExport, setEligiblePurchasesForExport] = useState<Purchase[]>([]);
  const [posSyncResults, setPosSyncResults] = useState<{
    totalProcessed: number;
    successful: number;
    failed: number;
    results: Array<{
      purchaseId: string;
      dashboardPoNumber: string;
      success: boolean;
      error?: string;
    }>;
  } | null>(null);
  
  const { toast } = useToast();
  
  // Check if all visible purchases are selected
  const allSelected = purchases.length > 0 && selectedPurchases.size === purchases.length;
  const someSelected = selectedPurchases.size > 0 && selectedPurchases.size < purchases.length;
  
  // Check if all selected purchases are from the same event
  const selectedPurchasesList = purchases.filter(p => selectedPurchases.has(p.id));
  const selectedEventIds = new Set(selectedPurchasesList.map(p => p.event?.id).filter(Boolean));
  const allSameEvent = selectedEventIds.size === 1;
  const commonEventId = allSameEvent ? Array.from(selectedEventIds)[0] : null;
  const commonEvent = commonEventId ? selectedPurchasesList[0]?.event : null;
  
  // Toggle select all
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedPurchases(new Set());
    } else {
      setSelectedPurchases(new Set(purchases.map(p => p.id)));
    }
  };
  
  // Toggle single purchase selection
  const togglePurchaseSelection = (purchaseId: string) => {
    const newSelected = new Set(selectedPurchases);
    if (newSelected.has(purchaseId)) {
      newSelected.delete(purchaseId);
    } else {
      newSelected.add(purchaseId);
    }
    setSelectedPurchases(newSelected);
  };
  
  // Bulk update status
  const handleBulkStatusChange = async (status: string) => {
    if (selectedPurchases.size === 0) return;
    
    setBulkUpdating(true);
    try {
      const response = await fetch("/api/purchases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseIds: Array.from(selectedPurchases),
          updates: { status },
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Bulk Update Successful",
          description: `Updated ${data.updated} purchase(s) to ${status}`,
        });
        setSelectedPurchases(new Set());
        fetchPurchases();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: "Bulk Update Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setBulkUpdating(false);
    }
  };
  
  // Bulk delete
  const handleBulkDelete = async () => {
    if (selectedPurchases.size === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedPurchases.size} purchase(s)? This cannot be undone.`)) {
      return;
    }
    
    setBulkUpdating(true);
    try {
      const response = await fetch("/api/purchases", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseIds: Array.from(selectedPurchases),
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Bulk Delete Successful",
          description: `Deleted ${data.deleted} purchase(s)`,
        });
        setSelectedPurchases(new Set());
        fetchPurchases();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: "Bulk Delete Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setBulkUpdating(false);
    }
  };

  // Export to POS (TicketVault) - Opens preview modal first
  const handleExportToPOS = () => {
    if (selectedPurchases.size === 0) return;
    
    // Filter to only SUCCESS purchases with events
    const eligiblePurchases = purchases.filter(
      p => selectedPurchases.has(p.id) && p.status === "SUCCESS" && p.event && !p.posSyncedAt
    );
    
    if (eligiblePurchases.length === 0) {
      toast({
        title: "No Eligible Purchases",
        description: "Select successful purchases with events that haven't been synced yet",
        variant: "destructive",
      });
      return;
    }
    
    // Open preview modal with eligible purchases
    setEligiblePurchasesForExport(eligiblePurchases);
    setPosExportPreviewOpen(true);
  };

  // Confirm export from preview modal
  const handleConfirmExport = async (items: { purchaseId: string; splitType: number; listingPrice: number }[]) => {
    setPosExportPreviewOpen(false);
    setPosSyncing(true);
    
    try {
      const response = await fetch("/api/pos/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchases: items, // Use detailed format with per-purchase options
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setPosSyncResults(data);
        setPosSyncDialogOpen(true);
        setSelectedPurchases(new Set());
        fetchPurchases();
        
        toast({
          title: "POS Export Complete",
          description: `${data.successful} of ${data.totalProcessed} synced successfully`,
          variant: data.failed > 0 ? "destructive" : "default",
        });
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: "POS Export Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setPosSyncing(false);
    }
  };

  // Fetch zone sections for bulk section selector
  const fetchBulkZoneSections = async () => {
    if (!commonEventId) return;
    
    try {
      const response = await fetch(`/api/events/${commonEventId}/zone-sections`);
      const data = await response.json();
      
      if (data.success && data.zones) {
        setBulkZoneSections(data.zones);
        setBulkSectionDialogOpen(true);
      } else {
        toast({
          title: "No Section Data",
          description: "Please sync the event first to load section data",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Failed to Load Sections",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  // Bulk update zone (also supports sections)
  const handleBulkZoneChange = async (zoneType: string, zoneName?: string, sections?: string[]) => {
    if (selectedPurchases.size === 0 || !allSameEvent) return;
    
    setBulkZoneLoading(true);
    setBulkUpdating(true);
    
    try {
      // If selecting a specific zone, first fetch the zone price to ensure it's in the DB
      if (zoneType === "zone" && zoneName && commonEventId) {
        const zoneResponse = await fetch(`/api/events/${commonEventId}/zone-price`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ zoneName }),
        });
        
        const zoneData = await zoneResponse.json();
        
        if (!zoneResponse.ok) {
          throw new Error(zoneData.error || "Failed to fetch zone price");
        }
        
        if (zoneData.minPrice === null) {
          toast({
            title: "Zone Not Available",
            description: `Zone "${zoneName}" is not available for this event`,
            variant: "destructive",
          });
          return;
        }
      }
      
      // Build the update payload
      let priceOverrideType = zoneType === "auto" ? null : zoneType;
      let priceOverrideZone: string | null = null;
      
      if (zoneType === "zone") {
        priceOverrideZone = zoneName || null;
      } else if (zoneType === "section" && sections && sections.length > 0) {
        priceOverrideZone = sections.join(",");
      }
      
      // Now update all selected purchases
      const response = await fetch("/api/purchases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseIds: Array.from(selectedPurchases),
          updates: {
            priceOverrideType,
            priceOverrideZone,
          },
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Updated",
          description: `Updated ${data.updated} purchase(s) to ${
            zoneType === "get_in" ? "Get-In Price" : 
            zoneType === "zone" ? zoneName :
            zoneType === "section" ? `${sections?.length} section(s)` :
            "Auto Match"
          }`,
        });
        setSelectedPurchases(new Set());
        setBulkSectionDialogOpen(false);
        fetchPurchases();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: "Update Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setBulkZoneLoading(false);
      setBulkUpdating(false);
    }
  };

  const fetchPurchases = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
      });

      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (eventFilter !== "all") params.set("eventId", eventFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      
      // New filters
      if (sectionFilter) params.set("section", sectionFilter);
      if (rowFilter) params.set("row", rowFilter);
      if (poNumberFilter) params.set("poNumber", poNumberFilter);
      if (posSyncFilter !== "all") params.set("posSync", posSyncFilter);
      if (accountFilter !== "all") params.set("accountId", accountFilter);
      if (cardFilter === "has_card") {
        params.set("hasCard", "yes");
      } else if (cardFilter === "no_card") {
        params.set("hasCard", "no");
      } else if (cardFilter !== "all") {
        params.set("cardId", cardFilter);
      }
      if (minPriceFilter) params.set("minPrice", minPriceFilter);
      if (maxPriceFilter) params.set("maxPrice", maxPriceFilter);
      if (minQuantityFilter) params.set("minQuantity", minQuantityFilter);
      if (maxQuantityFilter) params.set("maxQuantity", maxQuantityFilter);
      if (orderNumberFilter) params.set("orderNumber", orderNumberFilter);
      if (seatsFilter) params.set("seats", seatsFilter);

      const response = await fetch(`/api/purchases?${params}`);
      const data = await response.json();

      setPurchases(data.purchases || []);
      setEvents(data.events || []);
      setAccounts(data.accounts || []);
      setCards(data.cards || []);
      setStats(data.stats || null);
      setTotalPages(data.pagination?.pages || 1);
      setTotalItems(data.pagination?.total || 0);
    } catch (error) {
      console.error("Failed to fetch purchases:", error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, eventFilter, startDate, endDate, sectionFilter, rowFilter, poNumberFilter, posSyncFilter, accountFilter, cardFilter, minPriceFilter, maxPriceFilter, minQuantityFilter, maxQuantityFilter, orderNumberFilter, seatsFilter]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchPurchases();
  };

  const fetchLinkStats = useCallback(async () => {
    try {
      const response = await fetch("/api/purchases/relink-cards");
      const data = await response.json();
      setLinkStats(data);
    } catch (error) {
      console.error("Failed to fetch link stats:", error);
    }
  }, []);

  useEffect(() => {
    fetchLinkStats();
  }, [fetchLinkStats]);

  const handleRelinkCards = async () => {
    setRelinking(true);
    try {
      const response = await fetch("/api/purchases/relink-cards", {
        method: "POST",
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Cards Re-linked",
          description: data.message,
        });
        fetchPurchases();
        fetchLinkStats();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: "Re-link Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setRelinking(false);
    }
  };
  
  // Sync event price
  const handleSyncEventPrice = async (eventId: string, eventName: string) => {
    setSyncingEventId(eventId);
    try {
      const response = await fetch("/api/events/sync-prices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Price Synced",
          description: `${eventName}: $${data.price}`,
        });
        fetchPurchases();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: "Sync Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setSyncingEventId(null);
    }
  };
  
  // Format "time ago" helper
  const formatTimeAgo = (dateString: string | null): string => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Purchases</h1>
          <p className="text-muted-foreground">
            Track checkout attempts and completed purchases
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEmailImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import from Email
          </Button>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Purchase
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-5">
          <StatsCard
            title="Unrealized Profit"
            value={formatCurrency(stats.unrealizedProfit)}
            description={`ROI: ${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(1)}% (after ${stats.marketplaceFeePercentage}% fee)`}
            icon={TrendingUp}
            valueClassName={stats.unrealizedProfit >= 0 ? "text-green-600" : "text-red-600"}
          />
          <StatsCard
            title="Unrealized Sales"
            value={formatCurrency(stats.unrealizedSales)}
            description="at zone-matched prices"
            icon={DollarSign}
            valueClassName="text-blue-600"
          />
          <StatsCard
            title="Total Cost"
            value={formatCurrency(stats.revenue)}
            description="for tickets with get-in prices"
            icon={DollarSign}
          />
          <StatsCard
            title="Checkouts"
            value={stats.checkouts.toLocaleString()}
            icon={CheckCircle2}
          />
          <StatsCard
            title="Total Tickets"
            value={stats.totalTickets.toLocaleString()}
            icon={Ticket}
          />
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[300px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by account email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="SUCCESS">Success</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
                <SelectItem value="NEEDS_REVIEW">Needs Review</SelectItem>
              </SelectContent>
            </Select>
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Event" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                {events?.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name}
                    {event.eventDate && ` - ${event.eventDate}`}
                    {event.venue && ` @ ${event.venue}`}
                    {` (${event.count})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Calendar 
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground cursor-pointer z-10 hover:text-foreground" 
                  onClick={() => {
                    if (startDateInputRef.current) {
                      if (typeof startDateInputRef.current.showPicker === 'function') {
                        startDateInputRef.current.showPicker();
                      } else {
                        startDateInputRef.current.focus();
                        startDateInputRef.current.click();
                      }
                    }
                  }}
                />
                <Input
                  ref={startDateInputRef}
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="pl-10 w-[160px] date-input-custom"
                  placeholder="Start Date"
                />
              </div>
              <span className="text-muted-foreground">to</span>
              <div className="relative">
                <Calendar 
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground cursor-pointer z-10 hover:text-foreground" 
                  onClick={() => {
                    if (endDateInputRef.current) {
                      if (typeof endDateInputRef.current.showPicker === 'function') {
                        endDateInputRef.current.showPicker();
                      } else {
                        endDateInputRef.current.focus();
                        endDateInputRef.current.click();
                      }
                    }
                  }}
                />
                <Input
                  ref={endDateInputRef}
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="pl-10 w-[160px] date-input-custom"
                  placeholder="End Date"
                />
              </div>
              {(startDate || endDate) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Clear
                </Button>
              )}
            </div>
            <Button type="submit">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
            <Button 
              type="button" 
              variant="outline"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            >
              {showAdvancedFilters ? "Hide" : "More"} Filters
            </Button>
          </form>
          
          {/* Advanced Filters Row */}
          {showAdvancedFilters && (
            <div className="mt-4 pt-4 border-t flex gap-4 flex-wrap items-end">
              {/* Section Filter */}
              <div className="w-[100px]">
                <label className="text-xs text-muted-foreground mb-1 block">Section</label>
                <Input
                  placeholder="e.g. 513"
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                  className="h-9"
                />
              </div>
              
              {/* Row Filter */}
              <div className="w-[80px]">
                <label className="text-xs text-muted-foreground mb-1 block">Row</label>
                <Input
                  placeholder="e.g. 5"
                  value={rowFilter}
                  onChange={(e) => setRowFilter(e.target.value)}
                  className="h-9"
                />
              </div>
              
              {/* Seats Filter */}
              <div className="w-[100px]">
                <label className="text-xs text-muted-foreground mb-1 block">Seats</label>
                <Input
                  placeholder="e.g. 1-4"
                  value={seatsFilter}
                  onChange={(e) => setSeatsFilter(e.target.value)}
                  className="h-9"
                />
              </div>
              
              {/* Order Number Filter */}
              <div className="w-[130px]">
                <label className="text-xs text-muted-foreground mb-1 block">Order #</label>
                <Input
                  placeholder="TM Order"
                  value={orderNumberFilter}
                  onChange={(e) => setOrderNumberFilter(e.target.value)}
                  className="h-9"
                />
              </div>
              
              {/* PO Number Filter */}
              <div className="w-[110px]">
                <label className="text-xs text-muted-foreground mb-1 block">PO Number</label>
                <Input
                  placeholder="e.g. 000001"
                  value={poNumberFilter}
                  onChange={(e) => setPoNumberFilter(e.target.value)}
                  className="h-9"
                />
              </div>
              
              {/* POS Sync Filter */}
              <div className="w-[140px]">
                <label className="text-xs text-muted-foreground mb-1 block">POS Status</label>
                <Select value={posSyncFilter} onValueChange={setPosSyncFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="synced">Synced to POS</SelectItem>
                    <SelectItem value="not_synced">Not Synced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Account Filter */}
              <div className="w-[200px]">
                <label className="text-xs text-muted-foreground mb-1 block">Account</label>
                <Select value={accountFilter} onValueChange={setAccountFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All Accounts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Accounts</SelectItem>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.email.length > 25 ? acc.email.slice(0, 22) + "..." : acc.email} ({acc.count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Card Filter */}
              <div className="w-[170px]">
                <label className="text-xs text-muted-foreground mb-1 block">Card</label>
                <Select value={cardFilter} onValueChange={setCardFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All Cards" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="has_card">With Card</SelectItem>
                    <SelectItem value="no_card">Without Card</SelectItem>
                    {cards.map((card) => (
                      <SelectItem key={card.id} value={card.id}>
                        {card.type} ****{card.last4} ({card.count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Price Range Filter */}
              <div className="flex items-center gap-2">
                <div className="w-[80px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Min $</label>
                  <Input
                    type="number"
                    placeholder="$0"
                    value={minPriceFilter}
                    onChange={(e) => setMinPriceFilter(e.target.value)}
                    className="h-9"
                  />
                </div>
                <span className="text-muted-foreground mt-5">-</span>
                <div className="w-[80px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Max $</label>
                  <Input
                    type="number"
                    placeholder="$∞"
                    value={maxPriceFilter}
                    onChange={(e) => setMaxPriceFilter(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
              
              {/* Quantity Range Filter */}
              <div className="flex items-center gap-2">
                <div className="w-[70px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Min Qty</label>
                  <Input
                    type="number"
                    placeholder="1"
                    value={minQuantityFilter}
                    onChange={(e) => setMinQuantityFilter(e.target.value)}
                    className="h-9"
                  />
                </div>
                <span className="text-muted-foreground mt-5">-</span>
                <div className="w-[70px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Max Qty</label>
                  <Input
                    type="number"
                    placeholder="∞"
                    value={maxQuantityFilter}
                    onChange={(e) => setMaxQuantityFilter(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
              
              {/* Clear All Filters */}
              {(sectionFilter || rowFilter || poNumberFilter || posSyncFilter !== "all" || 
                accountFilter !== "all" || cardFilter !== "all" || 
                minPriceFilter || maxPriceFilter || minQuantityFilter || maxQuantityFilter ||
                orderNumberFilter || seatsFilter) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSectionFilter("");
                    setRowFilter("");
                    setPoNumberFilter("");
                    setPosSyncFilter("all");
                    setAccountFilter("all");
                    setCardFilter("all");
                    setMinPriceFilter("");
                    setMaxPriceFilter("");
                    setMinQuantityFilter("");
                    setMaxQuantityFilter("");
                    setOrderNumberFilter("");
                    setSeatsFilter("");
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Clear Advanced
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Actions Bar */}
      {selectedPurchases.size > 0 && (
        <Card className="border-primary bg-primary/5">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckSquare className="h-5 w-5 text-primary" />
                <div className="flex flex-col">
                  <span className="font-medium">
                    {selectedPurchases.size} purchase{selectedPurchases.size !== 1 ? 's' : ''} selected
                  </span>
                  {selectedPurchases.size > 1 && (
                    <span className="text-xs text-muted-foreground">
                      {allSameEvent 
                        ? `All from: ${commonEvent?.name || 'same event'}`
                        : `From ${selectedEventIds.size} different events`
                      }
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkStatusChange("SUCCESS")}
                  disabled={bulkUpdating}
                  className="text-green-600 border-green-600 hover:bg-green-50"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Mark Success
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkStatusChange("FAILED")}
                  disabled={bulkUpdating}
                  className="text-red-600 border-red-600 hover:bg-red-50"
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Mark Failed
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkStatusChange("NEEDS_REVIEW")}
                  disabled={bulkUpdating}
                  className="text-yellow-600 border-yellow-600 hover:bg-yellow-50"
                >
                  Mark Review
                </Button>
                <div className="w-px h-6 bg-border mx-1" />
                
                {/* Bulk Zone Change Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={bulkUpdating || !allSameEvent}
                      className="text-blue-600 border-blue-600 hover:bg-blue-50"
                      title={!allSameEvent ? "All selected purchases must be from the same event" : undefined}
                    >
                      {bulkZoneLoading ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <DollarSign className="h-4 w-4 mr-1" />
                      )}
                      Change Zone
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem 
                      onClick={() => handleBulkZoneChange("auto")}
                      disabled={bulkZoneLoading}
                    >
                      Auto (Zone Match)
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => handleBulkZoneChange("get_in")}
                      disabled={bulkZoneLoading}
                    >
                      Use Get-In Price
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={fetchBulkZoneSections}
                      disabled={bulkZoneLoading}
                      className="font-medium"
                    >
                      Select Sections...
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {commonEvent?.zonePrices && commonEvent.zonePrices.length > 0 ? (
                      commonEvent.zonePrices.map((zp) => (
                        <DropdownMenuItem 
                          key={zp.zoneName}
                          onClick={() => handleBulkZoneChange("zone", zp.zoneName)}
                          disabled={bulkZoneLoading}
                        >
                          {zp.zoneName} - ${zp.minPrice}
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <DropdownMenuItem disabled className="text-muted-foreground text-xs">
                        No zones scraped yet. Sync event prices first.
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                
                <div className="w-px h-6 bg-border mx-1" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportToPOS}
                  disabled={bulkUpdating || posSyncing}
                  className="text-purple-600 border-purple-600 hover:bg-purple-50"
                  title="Export selected purchases to TicketVault POS"
                >
                  {posSyncing ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <CloudUpload className="h-4 w-4 mr-1" />
                  )}
                  Export to POS
                </Button>
                <div className="w-px h-6 bg-border mx-1" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={bulkUpdating}
                  className="text-destructive border-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedPurchases(new Set())}
                  disabled={bulkUpdating}
                >
                  Clear Selection
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Purchases Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            Purchase History ({purchases.length} shown)
          </CardTitle>
          <div className="flex items-center gap-4">
            {linkStats && linkStats.withoutCards > 0 && (
              <span className="text-sm text-muted-foreground">
                {linkStats.breakdown?.unlinkedSuccess || 0} success / {linkStats.breakdown?.unlinkedFailed || 0} failed without cards
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowOrderNumber(!showOrderNumber)}
              title={showOrderNumber ? "Hide TM Order #" : "Show TM Order #"}
            >
              {showOrderNumber ? (
                <EyeOff className="h-4 w-4 mr-2" />
              ) : (
                <Eye className="h-4 w-4 mr-2" />
              )}
              Order #
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRelinkCards}
              disabled={relinking || (linkStats?.withoutCards === 0)}
            >
              {relinking ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4 mr-2" />
              )}
              Re-link Cards
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading purchases...
            </div>
          ) : purchases.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No purchases found
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                        className={someSelected ? "opacity-50" : ""}
                      />
                    </TableHead>
                    <TableHead>Account</TableHead>
                    {showOrderNumber && <TableHead>TM Order #</TableHead>}
                    <TableHead>Event</TableHead>
                    <TableHead>Venue</TableHead>
                    <TableHead>Tickets</TableHead>
                    <TableHead>Unit Cost (w/ fees)</TableHead>
                    <TableHead>Total Cost</TableHead>
                    <TableHead>Comp. Price</TableHead>
                    <TableHead>Total Profit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Card</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.map((purchase) => (
                    <TableRow 
                      key={purchase.id}
                      className={`cursor-pointer hover:bg-muted/50 ${selectedPurchases.has(purchase.id) ? 'bg-primary/5' : ''}`}
                      onClick={() => {
                        setEditingPurchaseId(purchase.id);
                        setEditDialogOpen(true);
                      }}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedPurchases.has(purchase.id)}
                          onCheckedChange={() => togglePurchaseSelection(purchase.id)}
                          aria-label={`Select purchase ${purchase.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px]">
                          <p 
                            className="font-medium truncate cursor-pointer hover:text-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(purchase.account.email);
                              toast({
                                title: "Copied",
                                description: purchase.account.email,
                              });
                            }}
                            title="Click to copy"
                          >
                            {purchase.account.email}
                          </p>
                          {purchase.dashboardPoNumber && (
                            <p className={`text-xs font-mono ${purchase.posSyncedAt ? 'text-purple-600' : 'text-muted-foreground'}`}>
                              PO #{purchase.dashboardPoNumber}
                              {purchase.posSyncedAt && (
                                <span className="ml-1 text-[10px]" title={`Synced to POS on ${new Date(purchase.posSyncedAt).toLocaleString()}`}>✓</span>
                              )}
                            </p>
                          )}
                          {purchase.externalJobId && !purchase.dashboardPoNumber && (
                            <p className="text-xs text-muted-foreground">
                              Job #{purchase.externalJobId}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      {showOrderNumber && (
                        <TableCell>
                          {purchase.tmOrderNumber ? (
                            <span className="font-mono text-xs">{purchase.tmOrderNumber}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="max-w-[180px]">
                          <p className="truncate font-medium" title={purchase.event?.name || "Unknown"}>
                            {purchase.event?.name || "Unknown"}
                          </p>
                          {purchase.section && (
                            <p className="text-xs text-muted-foreground">
                              Sec {purchase.section}
                              {purchase.row && `, Row ${purchase.row}`}
                              {purchase.seats && `, Seats ${purchase.seats}`}
                            </p>
                          )}
                          {purchase.event?.eventDate && (
                            <p className="text-xs text-muted-foreground">
                              {purchase.event.eventDate}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {purchase.event?.venue ? (
                          <div className="max-w-[150px]">
                            {(() => {
                              // Parse venue like "SoFi Stadium, Inglewood, CA"
                              const parts = purchase.event.venue.split(",").map(s => s.trim());
                              const venueName = parts[0] || "";
                              const location = parts.slice(1).join(", ");
                              return (
                                <>
                                  <p className="truncate font-medium" title={venueName}>{venueName}</p>
                                  {location && (
                                    <p className="text-xs text-muted-foreground truncate" title={location}>{location}</p>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{purchase.quantity}</TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(purchase.priceEach)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(purchase.totalPrice)}
                      </TableCell>
                      <TableCell>
                        {purchase.comparisonPrice ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1">
                              {purchase.event?.getInPriceUrl ? (
                                <a
                                  href={purchase.event.getInPriceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-semibold text-green-600 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {formatCurrency(purchase.comparisonPrice)}
                                </a>
                              ) : (
                                <span className="font-semibold text-green-600">
                                  {formatCurrency(purchase.comparisonPrice)}
                                </span>
                              )}
                              {/* Sync button */}
                              {purchase.event && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSyncEventPrice(purchase.event!.id, purchase.event!.name);
                                  }}
                                  disabled={syncingEventId === purchase.event.id}
                                  className="p-0.5 hover:bg-muted rounded transition-colors"
                                  title={`Sync price (Last: ${formatTimeAgo(purchase.event.getInPriceUpdatedAt)})`}
                                >
                                  <RefreshCw className={`h-3 w-3 text-muted-foreground hover:text-foreground ${syncingEventId === purchase.event.id ? 'animate-spin' : ''}`} />
                                </button>
                              )}
                            </div>
                            {/* Show source indicator and last sync time */}
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground">
                                {purchase.comparisonSource === "section" && purchase.matchedZone
                                  ? `${purchase.matchedZone.split(", ").length > 1 ? "Sections" : purchase.matchedZone}`
                                  : purchase.comparisonSource === "auto_zone" && purchase.matchedZone
                                  ? `${purchase.matchedZone}`
                                  : purchase.comparisonSource === "zone" && purchase.matchedZone
                                  ? `${purchase.matchedZone} (set)`
                                  : purchase.comparisonSource === "manual"
                                  ? "Manual"
                                  : purchase.comparisonSource === "get_in"
                                  ? "Get-In"
                                  : "—"}
                              </span>
                              {purchase.event?.getInPriceUpdatedAt && (
                                <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5" title={new Date(purchase.event.getInPriceUpdatedAt).toLocaleString()}>
                                  <Clock className="h-2.5 w-2.5" />
                                  {formatTimeAgo(purchase.event.getInPriceUpdatedAt)}
                                </span>
                              )}
                            </div>
                            {purchase.status === "SUCCESS" && purchase.priceEach > 0 && stats && (
                              <div className="flex flex-col gap-0.5">
                                <span className={`text-xs font-medium ${
                                  (() => {
                                    const feeMultiplier = 1 - (stats.marketplaceFeePercentage / 100);
                                    const saleAfterFees = purchase.comparisonPrice * feeMultiplier;
                                    return saleAfterFees > purchase.priceEach 
                                      ? "text-green-600" 
                                      : saleAfterFees < purchase.priceEach 
                                      ? "text-red-600" 
                                      : "text-muted-foreground";
                                  })()
                                }`}>
                                  {(() => {
                                    const feeMultiplier = 1 - (stats.marketplaceFeePercentage / 100);
                                    const saleAfterFees = purchase.comparisonPrice * feeMultiplier;
                                    const profit = saleAfterFees - purchase.priceEach;
                                    return profit > 0
                                      ? `+${formatCurrency(profit)}`
                                      : profit < 0
                                      ? `-${formatCurrency(Math.abs(profit))}`
                                      : "Break even";
                                  })()}
                                </span>
                                <span className={`text-[10px] font-medium ${
                                  (() => {
                                    const feeMultiplier = 1 - (stats.marketplaceFeePercentage / 100);
                                    const saleAfterFees = purchase.comparisonPrice * feeMultiplier;
                                    return saleAfterFees > purchase.priceEach 
                                      ? "text-green-600" 
                                      : saleAfterFees < purchase.priceEach 
                                      ? "text-red-600" 
                                      : "text-muted-foreground";
                                  })()
                                }`}>
                                  {(() => {
                                    const feeMultiplier = 1 - (stats.marketplaceFeePercentage / 100);
                                    const saleAfterFees = purchase.comparisonPrice * feeMultiplier;
                                    const roi = ((saleAfterFees - purchase.priceEach) / purchase.priceEach) * 100;
                                    return `ROI: ${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`;
                                  })()}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {purchase.comparisonPrice && purchase.status === "SUCCESS" && purchase.priceEach > 0 && stats ? (
                          <div className="flex flex-col gap-0.5">
                            <span className={`font-semibold ${
                              (() => {
                                const feeMultiplier = 1 - (stats.marketplaceFeePercentage / 100);
                                const saleAfterFees = purchase.comparisonPrice * feeMultiplier;
                                return saleAfterFees > purchase.priceEach 
                                  ? "text-green-600" 
                                  : saleAfterFees < purchase.priceEach 
                                  ? "text-red-600" 
                                  : "text-muted-foreground";
                              })()
                            }`}>
                              {(() => {
                                const feeMultiplier = 1 - (stats.marketplaceFeePercentage / 100);
                                const saleAfterFees = purchase.comparisonPrice * feeMultiplier;
                                const profitPerTicket = saleAfterFees - purchase.priceEach;
                                const totalProfit = profitPerTicket * purchase.quantity;
                                return `${totalProfit >= 0 ? '+' : ''}${formatCurrency(totalProfit)}`;
                              })()}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {purchase.quantity} {purchase.quantity === 1 ? 'ticket' : 'tickets'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <Badge
                            variant={
                              purchase.status === "SUCCESS"
                                ? "success"
                                : purchase.status === "NEEDS_REVIEW"
                                ? "warning"
                                : "destructive"
                            }
                          >
                            {purchase.status}
                          </Badge>
                          {purchase.errorCode && purchase.errorCode !== "NONE" && (
                            <p className="text-xs text-muted-foreground mt-1 truncate max-w-[150px]">
                              {purchase.errorCode}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {purchase.card ? (
                          <span className="text-sm">
                            {purchase.card.type} ****{purchase.card.last4}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateTime(purchase.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingPurchaseId(purchase.id);
                            setEditDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
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
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <PurchaseEditDialog
        purchaseId={editingPurchaseId}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSaved={() => {
          fetchPurchases();
        }}
      />

      {/* Add Purchase Dialog */}
      <AddPurchaseDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreated={() => {
          fetchPurchases();
        }}
      />

      {/* Bulk Section Selector Dialog */}
      <Dialog open={bulkSectionDialogOpen} onOpenChange={(open) => {
        setBulkSectionDialogOpen(open);
        if (!open) setBulkSelectedSections(new Set());
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Sections for {selectedPurchases.size} Purchase(s)</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {bulkZoneSections.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No section data available. Please sync the event first.</p>
            ) : (
              bulkZoneSections.map((zone) => (
                <div key={zone.zoneName} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">{zone.zoneName}</h4>
                    {zone.minPrice && (
                      <span className="text-sm text-muted-foreground">Zone min: ${zone.minPrice}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {zone.sections.map((section) => {
                      const sectionPrice = zone.sectionPrices?.find(sp => sp.sectionName === section);
                      const isSelected = bulkSelectedSections.has(section);
                      return (
                        <Button
                          key={section}
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const newSelected = new Set(bulkSelectedSections);
                            if (isSelected) {
                              newSelected.delete(section);
                            } else {
                              newSelected.add(section);
                            }
                            setBulkSelectedSections(newSelected);
                          }}
                          className="text-xs"
                        >
                          {section}
                          {sectionPrice?.minPrice && (
                            <span className="ml-1 opacity-70">${sectionPrice.minPrice}</span>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkSectionDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={bulkSelectedSections.size === 0 || bulkZoneLoading}
              onClick={() => handleBulkZoneChange("section", undefined, Array.from(bulkSelectedSections))}
            >
              {bulkZoneLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Apply to {selectedPurchases.size} Purchase(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* POS Sync Results Dialog */}
      <Dialog open={posSyncDialogOpen} onOpenChange={setPosSyncDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>POS Export Results</DialogTitle>
          </DialogHeader>
          {posSyncResults && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{posSyncResults.successful}</div>
                  <div className="text-xs text-muted-foreground">Successful</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{posSyncResults.failed}</div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{posSyncResults.totalProcessed}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
              </div>
              
              {posSyncResults.results.length > 0 && (
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {posSyncResults.results.map((result) => (
                    <div
                      key={result.purchaseId}
                      className={`p-2 rounded text-sm flex items-center justify-between ${
                        result.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                      }`}
                    >
                      <span className="font-mono">PO #{result.dashboardPoNumber}</span>
                      {result.success ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <span className="text-xs truncate max-w-[200px]" title={result.error}>
                          {result.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setPosSyncDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* POS Export Preview Modal */}
      <PosExportModal
        open={posExportPreviewOpen}
        onOpenChange={setPosExportPreviewOpen}
        purchases={eligiblePurchasesForExport}
        onConfirm={handleConfirmExport}
      />

      {/* Email CSV Import Dialog */}
      <EmailCsvImportDialog
        open={emailImportDialogOpen}
        onOpenChange={setEmailImportDialogOpen}
        onImportComplete={() => {
          fetchPurchases();
          fetchLinkStats();
        }}
      />
    </div>
  );
}
