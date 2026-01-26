"use client";

import { useEffect, useState } from "react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  CreditCard,
  Users,
  ShoppingCart,
  BarChart3,
  Zap,
  Calendar,
  Activity,
} from "lucide-react";
import { StatsCard } from "@/components/stats-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import {
  RevenueAreaChart,
  ProfitPieChart,
  WeeklyPerformanceChart,
  EventPerformanceChart,
  TicketPipelineChart,
  CardHealthChart,
  OperationsDonut,
} from "@/components/dashboard-charts";

interface DailyTrend {
  date: string;
  revenue: number;
  count: number;
  tickets: number;
}

interface WeeklyTrend {
  week: string;
  purchases: number;
  revenue: number;
  sales: number;
  salesRevenue: number;
}

interface EventPerformance {
  id: string;
  name: string;
  venue?: string;
  eventDate?: string;
  totalCost: number;
  ticketsBought: number;
  ticketsSold: number;
  salesRevenue: number;
  profit: number;
  roi: number;
}

interface UpcomingEvent {
  id: string;
  name: string;
  venue?: string;
  eventDate?: string;
  purchases: number;
  ticketCount: number;
  unsoldTickets: number;
  estimatedValue: number;
}

interface RecentSale {
  id: string;
  eventName: string;
  section?: string;
  row?: string;
  quantity: number;
  salePrice: number;
  saleDate?: string;
  payoutStatus: string;
  isPaid: boolean;
}

interface LatestPurchase {
  id: string;
  email: string;
  event: string;
  status: string;
  total: number;
  quantity: number;
  section?: string;
  row?: string;
  seats?: string;
  createdAt: string;
  hasSale: boolean;
  saleRevenue: number;
}

interface Stats {
  accounts: {
    total: number;
    withCards: number;
    withoutCards: number;
  };
  cards: {
    total: number;
    health: Record<string, number>;
  };
  events: {
    total: number;
    recent: Array<{
      id: string;
      tmEventId: string;
      name: string;
      queueTests: number;
      purchases: number;
    }>;
    upcoming: UpcomingEvent[];
    topByProfit: EventPerformance[];
  };
  queues: {
    total: number;
    recent: number;
    avgPosition: number;
    minPosition: number;
    maxPosition: number;
    percentiles: {
      p10: number;
      p50: number;
      p90: number;
    };
  };
  purchases: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    thisWeek: number;
    lastWeek: number;
    totalRevenue: number;
    totalTickets: number;
    latest: LatestPurchase[];
  };
  revenue: {
    total: number;
    thisWeek: number;
    lastWeek: number;
    weekOverWeekChange: number;
  };
  profit: {
    realized: number;
    realizedRevenue: number;
    realizedCost: number;
    unrealized: number;
    unrealizedRevenue: number;
    unrealizedCost: number;
  };
  pipeline: {
    purchased: number;
    listed: number;
    sold: number;
    cancelled: number;
  };
  trends: {
    daily: DailyTrend[];
    weekly: WeeklyTrend[];
  };
  checkout: {
    queued: number;
    running: number;
    success: number;
    failed: number;
    successRate: number;
    activeWorkers: number;
  };
  generator: {
    pending: number;
    running: number;
    tasksToday: number;
    successToday: number;
  };
  sales: {
    recent: RecentSale[];
  };
}

// Skeleton loader component
function SkeletonCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="h-4 w-24 bg-muted rounded animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-32 bg-muted rounded animate-pulse mb-2" />
        <div className="h-3 w-20 bg-muted rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}

function SkeletonChart() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="h-4 w-32 bg-muted rounded animate-pulse" />
        <div className="h-3 w-48 bg-muted rounded animate-pulse mt-1" />
      </CardHeader>
      <CardContent>
        <div className="h-[280px] bg-muted rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch("/api/stats");
        if (!response.ok) throw new Error("Failed to fetch stats");
        const data = await response.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
    
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-destructive">Error: {error}</p>
        <p className="text-sm text-muted-foreground">
          Make sure the database is running and configured correctly.
        </p>
      </div>
    );
  }

  // Show skeleton while loading
  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your Ticketmaster operations
          </p>
        </div>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
        
        <div className="grid gap-6 md:grid-cols-2">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No data available</p>
      </div>
    );
  }

  const totalProfit = stats.profit.realized + stats.profit.unrealized;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your Ticketmaster operations
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="h-4 w-4 animate-pulse text-green-500" />
          <span>Live</span>
        </div>
      </div>

      {/* ================================
          SECTION 1: Hero Stats Row (Top KPIs)
          ================================ */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Revenue"
          value={formatCurrency(stats.revenue.total)}
          description={stats.revenue.weekOverWeekChange >= 0 ? "vs last week" : "vs last week"}
          icon={DollarSign}
          trend={stats.revenue.lastWeek > 0 ? {
            value: Math.abs(stats.revenue.weekOverWeekChange),
            isPositive: stats.revenue.weekOverWeekChange >= 0,
          } : undefined}
        />
        <StatsCard
          title="Realized Profit"
          value={formatCurrency(stats.profit.realized)}
          description="From completed sales"
          icon={CheckCircle2}
          valueClassName="text-green-600"
        />
        <StatsCard
          title="Unrealized Profit"
          value={formatCurrency(stats.profit.unrealized)}
          description="Estimated from listings"
          icon={TrendingUp}
          valueClassName="text-blue-600"
        />
        <StatsCard
          title="Success Rate"
          value={`${stats.purchases.successRate}%`}
          description={`${stats.purchases.successful.toLocaleString()} / ${stats.purchases.total.toLocaleString()} purchases`}
          icon={stats.purchases.successRate >= 80 ? CheckCircle2 : XCircle}
          valueClassName={stats.purchases.successRate >= 80 ? "text-green-600" : "text-amber-600"}
        />
      </div>

      {/* ================================
          SECTION 2: Financial Overview Charts
          ================================ */}
      <div className="grid gap-6 md:grid-cols-2">
        <RevenueAreaChart data={stats.trends.daily} />
        <ProfitPieChart 
          realized={stats.profit.realized} 
          unrealized={stats.profit.unrealized} 
        />
      </div>

      {/* ================================
          SECTION 3: Operations Dashboard
          ================================ */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Checkout Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Checkout Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Queue</span>
              <Badge variant="secondary">{stats.checkout.queued} jobs</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Running</span>
              <Badge variant={stats.checkout.running > 0 ? "default" : "secondary"}>
                {stats.checkout.running} active
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Workers</span>
              <Badge variant="outline">{stats.checkout.activeWorkers}</Badge>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-medium">Success Rate</span>
              <span className={`font-bold ${stats.checkout.successRate >= 80 ? 'text-green-600' : 'text-amber-600'}`}>
                {stats.checkout.successRate}%
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Generator Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Generator Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Pending Jobs</span>
              <Badge variant="secondary">{stats.generator.pending}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Running</span>
              <Badge variant={stats.generator.running > 0 ? "default" : "secondary"}>
                {stats.generator.running}
              </Badge>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-medium">Created Today</span>
              <span className="font-bold text-green-600">{stats.generator.successToday}</span>
            </div>
          </CardContent>
        </Card>

        {/* Queue Performance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Queue Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Avg Position</span>
              <span className="font-mono text-sm">{stats.queues.avgPosition.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Top 10%</span>
              <span className="font-mono text-sm text-green-600">{stats.queues.percentiles.p10.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Bottom 10%</span>
              <span className="font-mono text-sm text-amber-600">{stats.queues.percentiles.p90.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-medium">Total Tests</span>
              <span className="font-bold">{stats.queues.total.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        {/* Card Health */}
        <CardHealthChart health={stats.cards.health} total={stats.cards.total} />
      </div>

      {/* ================================
          SECTION 4: Inventory & Pipeline
          ================================ */}
      <div className="grid gap-6 md:grid-cols-2">
        <TicketPipelineChart
          purchased={stats.pipeline.purchased}
          listed={stats.pipeline.listed}
          sold={stats.pipeline.sold}
        />

        {/* Upcoming Events with Inventory */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Upcoming Events
            </CardTitle>
            <CardDescription>Events with unsold inventory</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.events.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No upcoming events with inventory
              </p>
            ) : (
              <div className="space-y-3 max-h-[280px] overflow-y-auto">
                {stats.events.upcoming.slice(0, 6).map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{event.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {event.eventDate 
                          ? new Date(event.eventDate).toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric',
                              year: 'numeric'
                            })
                          : 'TBD'}
                        {event.venue && ` • ${event.venue}`}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-sm font-medium">{event.unsoldTickets} tickets</p>
                      <p className="text-xs text-green-600">
                        {formatCurrency(event.estimatedValue)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ================================
          SECTION 5: Time-Based Analytics
          ================================ */}
      <div className="grid gap-6 md:grid-cols-2">
        <WeeklyPerformanceChart data={stats.trends.weekly} />
        <EventPerformanceChart data={stats.events.topByProfit} />
      </div>

      {/* ================================
          SECTION 6: Activity Feed
          ================================ */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Purchases */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Recent Purchases</CardTitle>
            <CardDescription>Latest checkout activity</CardDescription>
          </CardHeader>
          <CardContent>
            {!stats.purchases?.latest || stats.purchases.latest.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No purchases yet
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.purchases.latest.slice(0, 5).map((purchase) => (
                    <TableRow key={purchase.id}>
                      <TableCell className="font-medium">
                        <div>
                          <p className="text-sm truncate max-w-[180px]">
                            {purchase.email}
                          </p>
                          <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                            {purchase.event}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge
                            variant={
                              purchase.status === "SUCCESS"
                                ? "success"
                                : "destructive"
                            }
                          >
                            {purchase.status}
                          </Badge>
                          {purchase.hasSale && (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              SOLD
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div>
                          <p className="font-medium">{formatCurrency(purchase.total)}</p>
                          {purchase.hasSale && (
                            <p className="text-xs text-green-600">
                              +{formatCurrency(purchase.saleRevenue - purchase.total)}
                            </p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent Sales */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Recent Sales</CardTitle>
            <CardDescription>Latest completed sales</CardDescription>
          </CardHeader>
          <CardContent>
            {!stats.sales?.recent || stats.sales.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No sales yet
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Payout</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.sales.recent.slice(0, 5).map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-medium">
                        <div>
                          <p className="text-sm truncate max-w-[180px]">
                            {sale.eventName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {sale.section && `Sec ${sale.section}`}
                            {sale.row && `, Row ${sale.row}`}
                            {` • ${sale.quantity} tix`}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={sale.isPaid ? "success" : "secondary"}
                        >
                          {sale.payoutStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {formatCurrency(sale.salePrice)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ================================
          Quick Stats Footer
          ================================ */}
      <div className="grid gap-4 md:grid-cols-4 pt-2 border-t">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <Users className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">Accounts</p>
            <p className="text-lg font-bold">{stats.accounts.total.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">Cards</p>
            <p className="text-lg font-bold">{stats.cards.total.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">Events</p>
            <p className="text-lg font-bold">{stats.events.total.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <ShoppingCart className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">Total Tickets</p>
            <p className="text-lg font-bold">{stats.purchases.totalTickets.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
