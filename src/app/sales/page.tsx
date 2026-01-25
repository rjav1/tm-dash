"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Search,
  RefreshCw,
  Loader2,
  DollarSign,
  Receipt,
  CheckCircle2,
  CreditCard,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Calendar,
  Filter,
  Percent,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { PaginationControls } from "@/components/pagination-controls";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

interface Sale {
  id: string;
  ticketGroupId: number;
  invoiceNumber: number | null;
  orderId: number | null;
  eventName: string | null;
  eventDateTime: string | null;
  venueName: string | null;
  section: string | null;
  row: string | null;
  seats: string | null;
  quantity: number;
  salePrice: number;
  cost: number | null;
  buyerEmail: string | null;
  buyerName: string | null;
  status: number;
  statusName: string | null;
  deliveryType: string | null;
  isComplete: boolean;
  needsShipping: boolean;
  extOrderNumber: string | null;
  extPONumber: string | null;
  saleDate: string | null;
  listingId: string | null;
  listing: {
    id: string;
    extPONumber: string | null;
    accountEmail: string | null;
    purchaseId: string | null;
    cost: number | null;
    purchase: {
      id: string;
      dashboardPoNumber: string | null;
      totalPrice: number | null;
      priceEach: number | null;
      cardId: string | null;
      card: {
        id: string;
        cardNumber: string | null;
        cardType: string | null;
      } | null;
      account: {
        id: string;
        email: string;
      } | null;
    } | null;
  } | null;
  invoice: {
    id: string;
    invoiceNumber: number;
    isPaid: boolean;
    payoutStatus: string | null;
    totalAmount: number | null;
    fees: number | null;
  } | null;
}

interface InvoiceSale {
  id: string;
  ticketGroupId: number;
  quantity: number;
  salePrice: number;
  cost: number | null;
  section: string | null;
  row: string | null;
  seats: string | null;
  eventName: string | null;
  eventDateTime: string | null;
  venueName: string | null;
  buyerEmail: string | null;
  buyerName: string | null;
  extPONumber?: string | null;
  derivedPoNumber?: string | null;
  listingId: string | null;
  listing: {
    id: string;
    extPONumber: string | null;
    accountEmail: string | null;
    cost: number | null;
    purchaseId: string | null;
    purchase: {
      id: string;
      dashboardPoNumber: string | null;
      totalPrice: number | null;
      priceEach: number | null;
      cardId: string | null;
      card: {
        id: string;
        cardNumber: string | null;
        cardType: string | null;
      } | null;
      account: {
        id: string;
        email: string;
      } | null;
    } | null;
  } | null;
}

interface Invoice {
  id: string;
  invoiceNumber: number;
  clientId: number | null;
  clientName: string | null;
  clientEmail: string | null;
  eventName: string | null;
  eventDateTime: string | null;
  totalQuantity: number;
  totalAmount: number;
  fees: number;
  totalCost: number;
  isPaid: boolean;
  payoutStatus: string | null;
  remittanceStatus: string | null;
  remittanceDate: string | null;
  isCancelled: boolean;
  extPONumber: string | null;
  invoiceDate: string | null;
  sales: InvoiceSale[];
}

interface SalesStats {
  totalSales: number;
  pendingSales: number;
  completedSales: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  avgProfitPerDay: number;
  daysWithSales: number;
}

interface InvoiceStats {
  totalInvoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  totalRevenue: number;
  totalUnpaid: number;
}

// Date range options
type DateRange = "all" | "today" | "week" | "month" | "quarter";

// Profitability filter
type ProfitFilter = "all" | "profitable" | "breakeven" | "loss";

// =============================================================================
// Helper Functions
// =============================================================================

// Format event date for display (short format: "Jan 24, 2026")
function formatEventDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return null;
  }
}

// =============================================================================
// Helper Components
// =============================================================================

function MetricCard({
  title,
  value,
  subValue,
  icon: Icon,
  trend,
  className,
}: {
  title: string;
  value: string | number;
  subValue?: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
  className?: string;
}) {
  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subValue && (
          <div className={cn(
            "text-xs mt-1 flex items-center gap-1",
            trend === "up" && "text-green-600",
            trend === "down" && "text-red-600",
            trend === "neutral" && "text-muted-foreground"
          )}>
            {trend === "up" && <TrendingUp className="h-3 w-3" />}
            {trend === "down" && <TrendingDown className="h-3 w-3" />}
            {subValue}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBreakdown({
  complete,
  alert,
  pending,
}: {
  complete: number;
  alert: number;
  pending: number;
}) {
  const total = complete + alert + pending;
  if (total === 0) return null;

  const completePercent = (complete / total) * 100;
  const alertPercent = (alert / total) * 100;
  const pendingPercent = (pending / total) * 100;

  return (
    <div className="space-y-2">
      <div className="flex h-2 rounded-full overflow-hidden bg-muted">
        <div
          className="bg-green-500 transition-all"
          style={{ width: `${completePercent}%` }}
        />
        <div
          className="bg-orange-500 transition-all"
          style={{ width: `${alertPercent}%` }}
        />
        <div
          className="bg-yellow-500 transition-all"
          style={{ width: `${pendingPercent}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          Complete ({complete})
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-orange-500" />
          Alert ({alert})
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-yellow-500" />
          Pending ({pending})
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export default function SalesPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("sales");
  
  // Sales state
  const [sales, setSales] = useState<Sale[]>([]);
  const [salesStats, setSalesStats] = useState<SalesStats | null>(null);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesSyncing, setSalesSyncing] = useState(false);
  const [salesPage, setSalesPage] = useState(1);
  const [salesTotalPages, setSalesTotalPages] = useState(1);
  const [salesTotal, setSalesTotal] = useState(0);
  
  // Enhanced sales filters
  const [salesSearch, setSalesSearch] = useState("");
  const [salesStatusFilter, setSalesStatusFilter] = useState("all");
  const [salesDateRange, setSalesDateRange] = useState<DateRange>("all");
  const [salesProfitFilter, setSalesProfitFilter] = useState<ProfitFilter>("all");
  const [salesEventFilter, setSalesEventFilter] = useState("all");
  
  // Invoice state
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceStats, setInvoiceStats] = useState<InvoiceStats | null>(null);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesSyncing, setInvoicesSyncing] = useState(false);
  const [invoicesPage, setInvoicesPage] = useState(1);
  const [invoicesTotalPages, setInvoicesTotalPages] = useState(1);
  const [invoicesTotal, setInvoicesTotal] = useState(0);
  const [invoicesSearch, setInvoicesSearch] = useState("");
  const [invoicesPaidFilter, setInvoicesPaidFilter] = useState("all");
  const [invoicesPayoutFilter, setInvoicesPayoutFilter] = useState("all");
  
  // PO Detail Modal (for invoices tab)
  const [selectedPO, setSelectedPO] = useState<InvoiceSale | null>(null);
  const [poModalOpen, setPoModalOpen] = useState(false);
  
  // Sale Detail Modal (for sales queue tab)
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  
  // Refresh state for individual sales
  const [refreshingSaleId, setRefreshingSaleId] = useState<string | null>(null);
  
  // Bulk selection state
  const [selectedSaleIds, setSelectedSaleIds] = useState<Set<string>>(new Set());
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, currentEmail: "" });
  
  const limit = 50;

  // =============================================================================
  // Computed Values
  // =============================================================================
  
  // Calculate enhanced metrics from current page data
  const enhancedMetrics = useMemo(() => {
    if (!sales.length) return null;
    
    let totalCost = 0;
    let totalRevenue = 0;
    let profitableSales = 0;
    let lossSales = 0;
    let completeCount = 0;
    let alertCount = 0;
    let pendingCount = 0;
    let missingCostCount = 0;
    
    sales.forEach((sale) => {
      // Cost priority: sale.cost > listing.cost > purchase.priceEach
      const unitCost = Number(sale.cost || sale.listing?.cost || sale.listing?.purchase?.priceEach || 0);
      const saleTotalCost = unitCost * sale.quantity;
      // Use invoice totalAmount (net payout after fees) if available
      const netPayout = Number(sale.invoice?.totalAmount || sale.salePrice || 0);
      
      // Track sales with missing cost
      if (unitCost === 0) missingCostCount++;
      
      totalCost += saleTotalCost;
      totalRevenue += netPayout;
      
      const profit = netPayout - saleTotalCost;
      if (profit > 0) profitableSales++;
      else if (profit < 0) lossSales++;
      
      if (sale.status === 1 || sale.isComplete) completeCount++;
      else if (sale.status === 40) alertCount++;
      else if (sale.status === 20) pendingCount++;
    });
    
    const totalProfit = totalRevenue - totalCost;
    const roi = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
    const avgProfit = sales.length > 0 ? totalProfit / sales.length : 0;
    
    return {
      totalCost,
      totalRevenue,
      totalProfit,
      roi,
      avgProfit,
      profitableSales,
      lossSales,
      completeCount,
      alertCount,
      pendingCount,
      missingCostCount,
    };
  }, [sales]);

  // Get unique events for filter dropdown
  const uniqueEvents = useMemo(() => {
    const events = new Set<string>();
    sales.forEach((sale) => {
      if (sale.eventName) events.add(sale.eventName);
    });
    return Array.from(events).sort();
  }, [sales]);

  // =============================================================================
  // Fetch Sales
  // =============================================================================
  
  const fetchSales = useCallback(async () => {
    try {
      setSalesLoading(true);
      const params = new URLSearchParams();
      params.set("page", salesPage.toString());
      params.set("limit", limit.toString());
      
      if (salesSearch) params.set("search", salesSearch);
      if (salesStatusFilter !== "all") params.set("status", salesStatusFilter);
      if (salesDateRange !== "all") params.set("dateRange", salesDateRange);
      if (salesProfitFilter !== "all") params.set("profit", salesProfitFilter);
      if (salesEventFilter !== "all") params.set("event", salesEventFilter);
      
      const response = await fetch(`/api/sales?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setSales(data.sales);
        setSalesStats(data.stats);
        setSalesTotalPages(data.pagination.pages);
        setSalesTotal(data.pagination.total);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch sales",
        variant: "destructive",
      });
    } finally {
      setSalesLoading(false);
    }
  }, [salesPage, salesSearch, salesStatusFilter, salesDateRange, salesProfitFilter, salesEventFilter, toast]);
  
  // =============================================================================
  // Fetch Invoices
  // =============================================================================
  
  const fetchInvoices = useCallback(async () => {
    try {
      setInvoicesLoading(true);
      const params = new URLSearchParams();
      params.set("page", invoicesPage.toString());
      params.set("limit", limit.toString());
      
      if (invoicesSearch) params.set("search", invoicesSearch);
      if (invoicesPaidFilter !== "all") params.set("paid", invoicesPaidFilter);
      if (invoicesPayoutFilter !== "all") params.set("payout", invoicesPayoutFilter);
      
      const response = await fetch(`/api/invoices?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setInvoices(data.invoices);
        setInvoiceStats(data.stats);
        setInvoicesTotalPages(data.pagination.pages);
        setInvoicesTotal(data.pagination.total);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch invoices",
        variant: "destructive",
      });
    } finally {
      setInvoicesLoading(false);
    }
  }, [invoicesPage, invoicesSearch, invoicesPaidFilter, invoicesPayoutFilter, toast]);
  
  // =============================================================================
  // Sync Functions
  // =============================================================================
  
  const handleSyncSales = async () => {
    try {
      setSalesSyncing(true);
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Sales Synced",
          description: data.message,
        });
        fetchSales();
      } else {
        toast({
          title: "Sync Failed",
          description: data.error || "Failed to sync sales",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to sync sales",
        variant: "destructive",
      });
    } finally {
      setSalesSyncing(false);
    }
  };
  
  const handleSyncInvoices = async () => {
    try {
      setInvoicesSyncing(true);
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Invoices Synced",
          description: data.message,
        });
        fetchInvoices();
      } else {
        toast({
          title: "Sync Failed",
          description: data.error || "Failed to sync invoices",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to sync invoices",
        variant: "destructive",
      });
    } finally {
      setInvoicesSyncing(false);
    }
  };
  
  const handleSyncAll = async () => {
    setSalesSyncing(true);
    setInvoicesSyncing(true);
    
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "syncAll" }),
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Sync Complete",
          description: data.message,
        });
        fetchSales();
        fetchInvoices();
      } else {
        toast({
          title: "Sync Failed",
          description: "Failed to sync from POS",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to sync from POS",
        variant: "destructive",
      });
    } finally {
      setSalesSyncing(false);
      setInvoicesSyncing(false);
    }
  };
  
  // Refresh a single sale - import account to POS if needed and re-sync
  const handleRefreshSale = async (saleId: string) => {
    try {
      setRefreshingSaleId(saleId);
      
      const response = await fetch(`/api/sales/${saleId}/refresh`, {
        method: "POST",
      });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Sale Refreshed",
          description: data.steps?.join(". ") || "Sale has been refreshed",
        });
        fetchSales();
      } else {
        toast({
          title: "Refresh Failed",
          description: data.error || "Failed to refresh sale",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to refresh sale",
        variant: "destructive",
      });
    } finally {
      setRefreshingSaleId(null);
    }
  };

  // Toggle selection for a single sale
  const toggleSaleSelection = (saleId: string) => {
    setSelectedSaleIds(prev => {
      const next = new Set(prev);
      if (next.has(saleId)) {
        next.delete(saleId);
      } else {
        next.add(saleId);
      }
      return next;
    });
  };

  // Select/deselect all visible sales
  const toggleSelectAll = () => {
    if (selectedSaleIds.size === sales.length) {
      setSelectedSaleIds(new Set());
    } else {
      setSelectedSaleIds(new Set(sales.map(s => s.id)));
    }
  };

  // Bulk refresh selected sales
  const handleBulkRefresh = async () => {
    const saleIds = Array.from(selectedSaleIds);
    if (saleIds.length === 0) return;

    setBulkRefreshing(true);
    setBulkProgress({ current: 0, total: saleIds.length, currentEmail: "" });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < saleIds.length; i++) {
      const saleId = saleIds[i];
      const sale = sales.find(s => s.id === saleId);
      
      setBulkProgress({
        current: i + 1,
        total: saleIds.length,
        currentEmail: sale?.listing?.accountEmail || sale?.listing?.purchase?.account?.email || "Unknown",
      });

      try {
        const response = await fetch(`/api/sales/${saleId}/refresh`, {
          method: "POST",
        });
        const data = await response.json();
        
        if (data.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }

      // Small delay between requests to avoid overwhelming the API
      if (i < saleIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setBulkRefreshing(false);
    setSelectedSaleIds(new Set());
    
    toast({
      title: "Bulk Refresh Complete",
      description: `${successCount} succeeded, ${failCount} failed`,
    });
    
    fetchSales();
  };

  // Clear all filters
  const clearFilters = () => {
    setSalesSearch("");
    setSalesStatusFilter("all");
    setSalesDateRange("all");
    setSalesProfitFilter("all");
    setSalesEventFilter("all");
    setSalesPage(1);
  };

  const hasActiveFilters = salesSearch || salesStatusFilter !== "all" || salesDateRange !== "all" || salesProfitFilter !== "all" || salesEventFilter !== "all";
  
  // =============================================================================
  // Effects
  // =============================================================================
  
  useEffect(() => {
    if (activeTab === "sales") {
      fetchSales();
    } else {
      fetchInvoices();
    }
  }, [activeTab, fetchSales, fetchInvoices]);
  
  // =============================================================================
  // Helper Functions
  // =============================================================================
  
  const getStatusBadge = (sale: Sale) => {
    if (sale.status === 1 || sale.isComplete) {
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Complete</Badge>;
    }
    if (sale.status === 40) {
      return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">Alert</Badge>;
    }
    if (sale.status === 20) {
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Pending</Badge>;
    }
    return <Badge variant="outline">{sale.status}</Badge>;
  };
  
  const isSaleComplete = (sale: Sale) => {
    return sale.status === 1 || sale.isComplete;
  };
  
  const getPaidBadge = (isPaid: boolean) => {
    return isPaid ? (
      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Paid</Badge>
    ) : (
      <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Unpaid</Badge>
    );
  };

  const formatROI = (cost: number, salePrice: number) => {
    if (!cost || cost === 0) return null;
    const profit = salePrice - cost;
    const roi = (profit / cost) * 100;
    return roi;
  };

  const getRoiBadge = (roi: number | null) => {
    if (roi === null) return <span className="text-muted-foreground">-</span>;
    const roiStr = `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`;
    if (roi > 20) {
      return <span className="text-green-600 font-medium">{roiStr}</span>;
    }
    if (roi > 0) {
      return <span className="text-green-500">{roiStr}</span>;
    }
    if (roi === 0) {
      return <span className="text-muted-foreground">{roiStr}</span>;
    }
    return <span className="text-red-600 font-medium">{roiStr}</span>;
  };

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <div className="w-full px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sales Dashboard</h1>
          <p className="text-muted-foreground">
            Track sales, invoices, and profitability from TicketVault POS
          </p>
        </div>
        <Button
          onClick={handleSyncAll}
          disabled={salesSyncing || invoicesSyncing}
          size="lg"
        >
          {salesSyncing || invoicesSyncing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Sync All from POS
        </Button>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="sales" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Sales Queue
            {salesStats && (
              <Badge variant="secondary" className="ml-1">{salesStats.totalSales}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="invoices" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Invoices
            {invoiceStats && (
              <Badge variant="secondary" className="ml-1">{invoiceStats.totalInvoices}</Badge>
            )}
          </TabsTrigger>
        </TabsList>
        
        {/* ================================================================= */}
        {/* Sales Queue Tab */}
        {/* ================================================================= */}
        
        <TabsContent value="sales" className="space-y-6">
          {/* Enhanced Stats Grid */}
          <div className="space-y-4">
            {/* Primary Metrics Row */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-6">
              <MetricCard
                title="Total Sales"
                value={salesStats?.totalSales || 0}
                icon={Receipt}
              />
              <MetricCard
                title="Net Payout"
                value={formatCurrency(salesStats?.totalRevenue || 0)}
                subValue="After fees"
                icon={DollarSign}
              />
              <MetricCard
                title="Total Cost"
                value={formatCurrency(salesStats?.totalCost || 0)}
                icon={CreditCard}
              />
              <MetricCard
                title="Total Profit"
                value={formatCurrency(salesStats?.totalProfit || 0)}
                subValue={salesStats && salesStats.totalProfit > 0 ? "Profitable" : salesStats?.totalProfit === 0 ? "Break-even" : "Loss"}
                trend={salesStats && salesStats.totalProfit > 0 ? "up" : salesStats?.totalProfit === 0 ? "neutral" : "down"}
                icon={TrendingUp}
              />
              <MetricCard
                title="Overall ROI"
                value={enhancedMetrics && salesStats?.totalCost ? `${((salesStats.totalProfit / salesStats.totalCost) * 100).toFixed(1)}%` : "N/A"}
                icon={Percent}
              />
              <MetricCard
                title="Avg Profit/Day"
                value={salesStats 
                  ? formatCurrency(salesStats.avgProfitPerDay) 
                  : formatCurrency(0)}
                subValue={salesStats ? `${salesStats.daysWithSales} days tracked` : undefined}
                icon={TrendingUp}
              />
            </div>
            
            {/* Status Breakdown */}
            {enhancedMetrics && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Status Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <StatusBreakdown
                    complete={enhancedMetrics.completeCount}
                    alert={enhancedMetrics.alertCount}
                    pending={enhancedMetrics.pendingCount}
                  />
                </CardContent>
              </Card>
            )}
            
            {/* Warning for missing cost data */}
            {enhancedMetrics && enhancedMetrics.missingCostCount > 0 && (
              <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20">
                <CardContent className="py-3">
                  <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      {enhancedMetrics.missingCostCount} sale{enhancedMetrics.missingCostCount > 1 ? 's' : ''} missing cost data
                    </span>
                    <span className="text-xs text-orange-600 dark:text-orange-500">
                      - Profit/ROI may be inaccurate
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
          
          {/* Filters Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by PO, event, account..."
                  value={salesSearch}
                  onChange={(e) => {
                    setSalesSearch(e.target.value);
                    setSalesPage(1);
                  }}
                  className="pl-9"
                />
              </div>
              
              {/* Status Filter */}
              <Select
                value={salesStatusFilter}
                onValueChange={(value) => {
                  setSalesStatusFilter(value);
                  setSalesPage(1);
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="alert">Alert</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Date Range Filter */}
              <Select
                value={salesDateRange}
                onValueChange={(value: DateRange) => {
                  setSalesDateRange(value);
                  setSalesPage(1);
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="quarter">This Quarter</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Profitability Filter */}
              <Select
                value={salesProfitFilter}
                onValueChange={(value: ProfitFilter) => {
                  setSalesProfitFilter(value);
                  setSalesPage(1);
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Profit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Profit</SelectItem>
                  <SelectItem value="profitable">Profitable</SelectItem>
                  <SelectItem value="breakeven">Break-even</SelectItem>
                  <SelectItem value="loss">Loss</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Event Filter */}
              {uniqueEvents.length > 0 && (
                <Select
                  value={salesEventFilter}
                  onValueChange={(value) => {
                    setSalesEventFilter(value);
                    setSalesPage(1);
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="All Events" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Events</SelectItem>
                    {uniqueEvents.map((event) => (
                      <SelectItem key={event} value={event}>
                        {event.length > 30 ? event.substring(0, 30) + "..." : event}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              
              {/* Clear Filters */}
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
              
              <div className="flex-1" />
              
              {/* Sync Button */}
              <Button
                variant="outline"
                onClick={handleSyncSales}
                disabled={salesSyncing}
              >
                {salesSyncing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Sync Sales
              </Button>
            </div>
            
            {/* Active Filters Display */}
            {hasActiveFilters && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Active filters:</span>
                {salesSearch && <Badge variant="secondary">Search: {salesSearch}</Badge>}
                {salesStatusFilter !== "all" && <Badge variant="secondary">Status: {salesStatusFilter}</Badge>}
                {salesDateRange !== "all" && <Badge variant="secondary">Date: {salesDateRange}</Badge>}
                {salesProfitFilter !== "all" && <Badge variant="secondary">Profit: {salesProfitFilter}</Badge>}
                {salesEventFilter !== "all" && <Badge variant="secondary">Event</Badge>}
              </div>
            )}
          </div>
          
          {/* Bulk Action Bar */}
          {selectedSaleIds.size > 0 && (
            <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedSaleIds.size === sales.length}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm font-medium">
                  {selectedSaleIds.size} sale{selectedSaleIds.size > 1 ? "s" : ""} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedSaleIds(new Set())}
                >
                  Clear Selection
                </Button>
                <Button
                  size="sm"
                  onClick={handleBulkRefresh}
                  disabled={bulkRefreshing}
                >
                  {bulkRefreshing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Refresh Selected
                </Button>
              </div>
            </div>
          )}

          {/* Sales Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={sales.length > 0 && selectedSaleIds.size === sales.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-[100px]">PO #</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Section/Row</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead className="text-right">Net Payout</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">ROI</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesLoading ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                      <p className="mt-2 text-muted-foreground">Loading sales...</p>
                    </TableCell>
                  </TableRow>
                ) : sales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-12 text-muted-foreground">
                      <Receipt className="h-12 w-12 mx-auto mb-4 opacity-20" />
                      <p>No sales found.</p>
                      <p className="text-sm">Click &quot;Sync Sales&quot; to fetch from POS.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  sales.map((sale) => {
                    const poNumber = sale.extPONumber || sale.listing?.extPONumber || sale.listing?.purchase?.dashboardPoNumber || null;
                    const accountEmail = sale.listing?.accountEmail || sale.listing?.purchase?.account?.email || null;
                    // Cost priority: sale.cost > listing.cost > purchase.priceEach
                    const unitCost = Number(sale.cost || sale.listing?.cost || sale.listing?.purchase?.priceEach || 0);
                    const totalCost = unitCost * sale.quantity;
                    // Use invoice totalAmount (net payout after fees) if available, else fall back to salePrice
                    const netPayout = Number(sale.invoice?.totalAmount || sale.salePrice || 0);
                    const profit = netPayout - totalCost;
                    const roi = formatROI(totalCost, netPayout);
                    
                    return (
                      <TableRow 
                        key={sale.id}
                        className={cn(
                          "hover:bg-muted/50 transition-colors",
                          profit < 0 && totalCost > 0 && "bg-red-50/50 dark:bg-red-900/5",
                          totalCost === 0 && "bg-orange-50/50 dark:bg-orange-900/5",
                          selectedSaleIds.has(sale.id) && "bg-primary/5"
                        )}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedSaleIds.has(sale.id)}
                            onCheckedChange={() => toggleSaleSelection(sale.id)}
                          />
                        </TableCell>
                        <TableCell>
                          {poNumber ? (
                            <Button
                              variant="link"
                              className="h-auto p-0 text-primary font-mono text-xs"
                              onClick={() => {
                                setSelectedSale(sale);
                                setSaleModalOpen(true);
                              }}
                            >
                              {poNumber}
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <div className="font-medium truncate text-sm">{sale.eventName || "N/A"}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {sale.venueName}
                            {sale.eventDateTime && (
                              <span className="ml-1">• {formatEventDate(sale.eventDateTime)}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">
                            {sale.section}/{sale.row}
                          </span>
                          {sale.seats && (
                            <span className="text-muted-foreground text-xs ml-1">
                              ({sale.seats})
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[160px]">
                          <div className="truncate text-xs">
                            {accountEmail || <span className="text-muted-foreground">-</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{sale.quantity}</TableCell>
                        <TableCell className="text-right">
                          {totalCost ? formatCurrency(totalCost) : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(netPayout)}
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-medium",
                          profit > 0 && "text-green-600",
                          profit < 0 && "text-red-600"
                        )}>
                          {totalCost ? formatCurrency(profit) : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          {getRoiBadge(roi)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {getStatusBadge(sale)}
                            {!isSaleComplete(sale) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleRefreshSale(sale.id)}
                                disabled={refreshingSaleId === sale.id}
                                title="Import account to POS and refresh"
                              >
                                {refreshingSaleId === sale.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {sale.invoiceNumber ? (
                            <Badge variant="outline" className="text-xs">#{sale.invoiceNumber}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {sale.saleDate ? formatDateTime(sale.saleDate) : "N/A"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Summary Row */}
          {sales.length > 0 && enhancedMetrics && (
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg text-sm">
              <div className="flex items-center gap-6">
                <span>
                  <strong>{sales.length}</strong> sales on this page
                </span>
                <span className="text-muted-foreground">|</span>
                <span>
                  <strong className="text-green-600">{enhancedMetrics.profitableSales}</strong> profitable
                </span>
                <span>
                  <strong className="text-red-600">{enhancedMetrics.lossSales}</strong> loss
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span>Page Total: <strong>{formatCurrency(enhancedMetrics.totalRevenue)}</strong></span>
                <span>Profit: <strong className={enhancedMetrics.totalProfit >= 0 ? "text-green-600" : "text-red-600"}>{formatCurrency(enhancedMetrics.totalProfit)}</strong></span>
                <span>ROI: <strong>{enhancedMetrics.roi.toFixed(1)}%</strong></span>
              </div>
            </div>
          )}
          
          {/* Pagination */}
          {salesTotalPages > 1 && (
            <PaginationControls
              page={salesPage}
              pageSize={limit}
              totalPages={salesTotalPages}
              totalItems={salesTotal}
              onPageChange={setSalesPage}
            />
          )}
        </TabsContent>
        
        {/* ================================================================= */}
        {/* Invoices Tab */}
        {/* ================================================================= */}
        
        <TabsContent value="invoices" className="space-y-6">
          {/* Stats */}
          {invoiceStats && (
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
              <MetricCard
                title="Total Invoices"
                value={invoiceStats.totalInvoices}
                icon={CreditCard}
              />
              <MetricCard
                title="Paid"
                value={invoiceStats.paidInvoices}
                subValue={`${((invoiceStats.paidInvoices / invoiceStats.totalInvoices) * 100 || 0).toFixed(0)}%`}
                icon={CheckCircle2}
                trend="up"
              />
              <MetricCard
                title="Unpaid"
                value={invoiceStats.unpaidInvoices}
                icon={AlertCircle}
              />
              <MetricCard
                title="Net Payout"
                value={formatCurrency(invoiceStats.totalRevenue)}
                subValue="After ~6% fees"
                icon={DollarSign}
              />
              <MetricCard
                title="Awaiting Payment"
                value={formatCurrency(invoiceStats.totalUnpaid)}
                subValue={invoiceStats.unpaidInvoices > 0 ? `${invoiceStats.unpaidInvoices} unpaid invoices` : "All paid"}
                icon={AlertTriangle}
                trend={invoiceStats.totalUnpaid > 0 ? "down" : "neutral"}
              />
            </div>
          )}
          
          {/* Filters */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search invoices..."
                value={invoicesSearch}
                onChange={(e) => {
                  setInvoicesSearch(e.target.value);
                  setInvoicesPage(1);
                }}
                className="pl-9"
              />
            </div>
            
            <Select
              value={invoicesPaidFilter}
              onValueChange={(value) => {
                setInvoicesPaidFilter(value);
                setInvoicesPage(1);
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Payment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Paid</SelectItem>
                <SelectItem value="false">Unpaid</SelectItem>
              </SelectContent>
            </Select>
            
            <Select
              value={invoicesPayoutFilter}
              onValueChange={(value) => {
                setInvoicesPayoutFilter(value);
                setInvoicesPage(1);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Payout Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payout</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="flex-1" />
            
            <Button
              variant="outline"
              onClick={handleSyncInvoices}
              disabled={invoicesSyncing}
            >
              {invoicesSyncing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sync Invoices
            </Button>
          </div>
          
          {/* Invoices Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Section/Row</TableHead>
                  <TableHead>PO #</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Payout Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoicesLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                      <p className="mt-2 text-muted-foreground">Loading invoices...</p>
                    </TableCell>
                  </TableRow>
                ) : invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-20" />
                      <p>No invoices found.</p>
                      <p className="text-sm">Click &quot;Sync Invoices&quot; to fetch from POS.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((invoice) => {
                    const sale = invoice.sales[0];
                    const eventName = sale?.eventName || invoice.eventName || "N/A";
                    const venueName = sale?.venueName || "";
                    const eventDate = sale?.eventDateTime || invoice.eventDateTime;
                    const section = sale?.section || "";
                    const row = sale?.row || "";
                    const poNumber = sale?.derivedPoNumber || sale?.extPONumber || sale?.listing?.extPONumber || sale?.listing?.purchase?.dashboardPoNumber || null;
                    
                    return (
                      <TableRow key={invoice.id} className="hover:bg-muted/50">
                        <TableCell>
                          <Badge variant="outline" className="font-mono">
                            #{invoice.invoiceNumber}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <div className="font-medium truncate text-sm">{eventName}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {venueName}
                            {eventDate && (
                              <span className={venueName ? "ml-1" : ""}>
                                {venueName && "• "}{formatEventDate(eventDate)}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {section && row ? (
                            <span className="font-mono text-sm">{section}/{row}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {poNumber ? (
                            <Button
                              variant="link"
                              className="h-auto p-0 text-primary font-mono text-xs"
                              onClick={() => {
                                setSelectedPO(sale);
                                setPoModalOpen(true);
                              }}
                            >
                              {poNumber}
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">{invoice.totalQuantity}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(invoice.totalAmount)}
                        </TableCell>
                        <TableCell>{getPaidBadge(invoice.isPaid)}</TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {invoice.payoutStatus || "N/A"}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {invoice.invoiceDate
                            ? formatDateTime(invoice.invoiceDate)
                            : "N/A"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Pagination */}
          {invoicesTotalPages > 1 && (
            <PaginationControls
              page={invoicesPage}
              pageSize={limit}
              totalPages={invoicesTotalPages}
              totalItems={invoicesTotal}
              onPageChange={setInvoicesPage}
            />
          )}
        </TabsContent>
      </Tabs>
      
      {/* PO Detail Modal */}
      <Dialog open={poModalOpen} onOpenChange={setPoModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              PO Trail: {selectedPO?.listing?.extPONumber || selectedPO?.listing?.purchase?.dashboardPoNumber || "N/A"}
            </DialogTitle>
          </DialogHeader>
          
          {selectedPO && (
            <div className="space-y-6">
              {/* Event Info */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Event</h4>
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="font-medium text-lg">{selectedPO.eventName || "N/A"}</div>
                  <div className="text-muted-foreground">
                    {selectedPO.venueName}
                    {selectedPO.eventDateTime && (
                      <span className={selectedPO.venueName ? " • " : ""}>
                        {formatEventDate(selectedPO.eventDateTime)}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-sm">
                    <span className="font-mono">Section {selectedPO.section} / Row {selectedPO.row}</span>
                    {selectedPO.seats && <span className="ml-2">Seats: {selectedPO.seats}</span>}
                  </div>
                </div>
              </div>
              
              {/* Purchase Info */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Purchase Details</h4>
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground">Dashboard PO #</div>
                      <div className="font-mono font-medium">
                        {selectedPO.listing?.purchase?.dashboardPoNumber || "N/A"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">TV PO #</div>
                      <div className="font-mono font-medium">
                        {selectedPO.listing?.extPONumber || "N/A"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Cost</div>
                      <div className="font-medium">
                        {selectedPO.cost ? formatCurrency(selectedPO.cost) : "N/A"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Purchase Total</div>
                      <div className="font-medium">
                        {selectedPO.listing?.purchase?.totalPrice 
                          ? formatCurrency(selectedPO.listing.purchase.totalPrice) 
                          : "N/A"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Account Info */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Account</h4>
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="font-medium">
                    {selectedPO.listing?.accountEmail || selectedPO.listing?.purchase?.account?.email || "N/A"}
                  </div>
                </div>
              </div>
              
              {/* Card Info */}
              {selectedPO.listing?.purchase?.card && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Payment Card</h4>
                  <div className="bg-muted/50 rounded-lg p-4">
                    <div className="font-medium">
                      {selectedPO.listing.purchase.card.cardType} ending in {selectedPO.listing.purchase.card.cardNumber?.slice(-4) || "****"}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Sale Info */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Sale Details</h4>
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground">Quantity Sold</div>
                      <div className="font-medium">{selectedPO.quantity}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Sale Price</div>
                      <div className="font-medium text-green-600">
                        {formatCurrency(selectedPO.salePrice)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Buyer</div>
                      <div className="font-medium">
                        {selectedPO.buyerName || selectedPO.buyerEmail || "N/A"}
                      </div>
                    </div>
                    {selectedPO.buyerEmail && selectedPO.buyerName && (
                      <div>
                        <div className="text-xs text-muted-foreground">Buyer Email</div>
                        <div className="font-medium text-sm">{selectedPO.buyerEmail}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Profit Calculation */}
              {selectedPO.cost && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Profit</h4>
                  <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <span>Sale Price - Cost</span>
                      <span className="font-bold text-lg text-green-600">
                        {formatCurrency(Number(selectedPO.salePrice) - Number(selectedPO.cost))}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-2 text-sm text-muted-foreground">
                      <span>ROI</span>
                      <span className="font-medium">
                        {(((Number(selectedPO.salePrice) - Number(selectedPO.cost)) / Number(selectedPO.cost)) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Sale Detail Modal (for Sales Queue tab) */}
      <Dialog open={saleModalOpen} onOpenChange={setSaleModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              PO Trail: {selectedSale?.extPONumber || selectedSale?.listing?.extPONumber || selectedSale?.listing?.purchase?.dashboardPoNumber || "N/A"}
            </DialogTitle>
          </DialogHeader>
          
          {selectedSale && (
            <div className="space-y-6">
              {/* Event Info */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Event</h4>
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="font-medium text-lg">{selectedSale.eventName || "N/A"}</div>
                  <div className="text-muted-foreground">
                    {selectedSale.venueName}
                    {selectedSale.eventDateTime && (
                      <span className={selectedSale.venueName ? " • " : ""}>
                        {formatEventDate(selectedSale.eventDateTime)}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-sm">
                    <span className="font-mono">Section {selectedSale.section} / Row {selectedSale.row}</span>
                    {selectedSale.seats && <span className="ml-2">Seats: {selectedSale.seats}</span>}
                  </div>
                </div>
              </div>
              
              {/* Purchase Info */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Purchase Details</h4>
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground">Dashboard PO #</div>
                      <div className="font-mono font-medium">
                        {selectedSale.listing?.purchase?.dashboardPoNumber || selectedSale.extPONumber || "N/A"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">TV PO #</div>
                      <div className="font-mono font-medium">
                        {selectedSale.extPONumber || selectedSale.listing?.extPONumber || "N/A"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Unit Cost</div>
                      <div className="font-medium">
                        {selectedSale.cost || selectedSale.listing?.cost 
                          ? formatCurrency(selectedSale.cost || selectedSale.listing?.cost || 0) 
                          : "N/A"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Total Cost</div>
                      <div className="font-medium">
                        {selectedSale.cost || selectedSale.listing?.cost 
                          ? formatCurrency(Number(selectedSale.cost || selectedSale.listing?.cost || 0) * selectedSale.quantity) 
                          : "N/A"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Purchase Total</div>
                      <div className="font-medium">
                        {selectedSale.listing?.purchase?.totalPrice 
                          ? formatCurrency(selectedSale.listing.purchase.totalPrice) 
                          : "N/A"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Account Info */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Account</h4>
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="font-medium">
                    {selectedSale.listing?.accountEmail || selectedSale.listing?.purchase?.account?.email || "N/A"}
                  </div>
                </div>
              </div>
              
              {/* Card Info */}
              {selectedSale.listing?.purchase?.card && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Payment Card</h4>
                  <div className="bg-muted/50 rounded-lg p-4">
                    <div className="font-medium">
                      {selectedSale.listing.purchase.card.cardType} ending in {selectedSale.listing.purchase.card.cardNumber?.slice(-4) || "****"}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Sale Info */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Sale Details</h4>
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground">Quantity Sold</div>
                      <div className="font-medium">{selectedSale.quantity}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Payout (Sale Price)</div>
                      <div className="font-medium text-green-600">
                        {formatCurrency(selectedSale.salePrice)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Invoice</div>
                      <div className="font-medium">
                        {selectedSale.invoiceNumber ? `#${selectedSale.invoiceNumber}` : "N/A"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Status</div>
                      <div className="font-medium">
                        {selectedSale.status === 1 || selectedSale.isComplete ? "Complete" : selectedSale.status === 40 ? "Alert" : selectedSale.status === 20 ? "Pending" : "Unknown"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Profit Calculation */}
              {(selectedSale.cost || selectedSale.listing?.cost) && (() => {
                const unitCost = Number(selectedSale.cost || selectedSale.listing?.cost || 0);
                const totalCost = unitCost * selectedSale.quantity;
                const profit = Number(selectedSale.salePrice) - totalCost;
                const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;
                return (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Profit & ROI</h4>
                    <div className={cn(
                      "rounded-lg p-4",
                      profit >= 0 ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"
                    )}>
                      <div className="flex justify-between items-center">
                        <span>Payout - Total Cost</span>
                        <span className={cn(
                          "font-bold text-lg",
                          profit >= 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {formatCurrency(profit)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-2 text-sm text-muted-foreground">
                        <span>ROI</span>
                        <span className="font-medium">
                          {roi.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Refresh Progress Modal */}
      <Dialog open={bulkRefreshing} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Refreshing Sales</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{bulkProgress.current} / {bulkProgress.total}</span>
            </div>
            <Progress value={(bulkProgress.current / bulkProgress.total) * 100} />
            {bulkProgress.currentEmail && (
              <div className="text-sm text-muted-foreground">
                Processing: <span className="font-mono">{bulkProgress.currentEmail}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Triggering account sync for each sale. This may take a moment...
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
