"use client";

import { useEffect, useState } from "react";
import {
  Users,
  CreditCard,
  ShoppingCart,
  BarChart3,
  DollarSign,
  CheckCircle2,
  XCircle,
  TrendingUp,
} from "lucide-react";
import { StatsCard } from "@/components/stats-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface Stats {
  accounts: {
    total: number;
    withCards: number;
    withoutCards: number;
  };
  cards: {
    total: number;
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
  };
  queues: {
    total: number;
    recent: number;
    avgPosition: number;
  };
  purchases: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    recent: number;
    recentSuccessful: number;
    totalRevenue: number;
    latest: Array<{
      id: string;
      email: string;
      event: string;
      status: string;
      total: number;
      quantity: number;
      section: string;
      row: string;
      seats: string;
      createdAt: string;
    }>;
  };
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
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading dashboard...</p>
      </div>
    );
  }

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

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your Ticketmaster accounts and operations
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Accounts"
          value={(stats.accounts?.total || 0).toLocaleString()}
          description={`${stats.accounts?.withCards || 0} with cards`}
          icon={Users}
        />
        <StatsCard
          title="Total Cards"
          value={(stats.cards?.total || 0).toLocaleString()}
          description="Active payment methods"
          icon={CreditCard}
        />
        <StatsCard
          title="Success Rate"
          value={`${stats.purchases?.successRate || 0}%`}
          description={`${stats.purchases?.successful || 0} / ${stats.purchases?.total || 0} purchases`}
          icon={TrendingUp}
        />
        <StatsCard
          title="Total Revenue"
          value={formatCurrency(stats.purchases?.totalRevenue || 0)}
          description="From successful purchases"
          icon={DollarSign}
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Queue Tests"
          value={(stats.queues?.total || 0).toLocaleString()}
          description={`Avg position: ${(stats.queues?.avgPosition || 0).toLocaleString()}`}
          icon={BarChart3}
        />
        <StatsCard
          title="Events Tracked"
          value={(stats.events?.total || 0).toLocaleString()}
          description="Unique events"
          icon={ShoppingCart}
        />
        <StatsCard
          title="Successful"
          value={(stats.purchases?.successful || 0).toLocaleString()}
          description="Completed checkouts"
          icon={CheckCircle2}
        />
        <StatsCard
          title="Failed"
          value={(stats.purchases?.failed || 0).toLocaleString()}
          description="Failed checkouts"
          icon={XCircle}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Events */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Events</CardTitle>
          </CardHeader>
          <CardContent>
            {!stats.events?.recent || stats.events.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No events tracked yet
              </p>
            ) : (
              <div className="space-y-4">
                {stats.events.recent.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {event.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {event.tmEventId}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="secondary">
                        {event.queueTests} queues
                      </Badge>
                      <Badge variant="outline">{event.purchases} purchases</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Purchases */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Purchases</CardTitle>
          </CardHeader>
          <CardContent>
            {!stats.purchases?.latest || stats.purchases.latest.length === 0 ? (
              <p className="text-sm text-muted-foreground">
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
                          <p className="text-sm truncate max-w-[200px]">
                            {purchase.email}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {purchase.section && `Sec ${purchase.section}`}
                            {purchase.row && `, Row ${purchase.row}`}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            purchase.status === "SUCCESS"
                              ? "success"
                              : "destructive"
                          }
                        >
                          {purchase.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(purchase.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
