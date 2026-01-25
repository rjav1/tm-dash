"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  TrendingDown,
  User,
  CreditCard,
  Clock,
  XCircle,
  CheckCircle2,
  BarChart3,
  Lightbulb,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatsCard } from "@/components/stats-card";

interface ErrorBreakdown {
  errorCode: string;
  count: number;
  percentage: number;
}

interface AccountIssue {
  accountId: string;
  email: string;
  failureCount: number;
  successCount: number;
  failureRate: number;
  lastError: string;
  lastErrorDate: string;
}

interface AnalyticsData {
  totalFailed: number;
  totalSuccess: number;
  failureRate: number;
  errorBreakdown: ErrorBreakdown[];
  problematicAccounts: AccountIssue[];
  recentErrors: Array<{
    id: string;
    email: string;
    errorCode: string;
    errorMessage: string;
    eventName: string;
    createdAt: string;
  }>;
}

// Error code suggestions
const ERROR_SUGGESTIONS: Record<string, { description: string; suggestion: string; severity: "high" | "medium" | "low" }> = {
  "CART_EXPIRED": {
    description: "Cart expired before checkout could complete",
    suggestion: "Checkout process is too slow. Consider using faster proxies or reducing bot load.",
    severity: "medium",
  },
  "U001": {
    description: "Account flagged or payment issue",
    suggestion: "The account may be flagged by Ticketmaster. Consider rotating to a new account.",
    severity: "high",
  },
  "U103": {
    description: "Card declined or verification failed",
    suggestion: "The card may be declined. Check if the card has sufficient funds and is not blocked.",
    severity: "high",
  },
  "U201": {
    description: "Session or authentication error",
    suggestion: "Account session may have expired. Try re-authenticating or using fresh cookies.",
    severity: "medium",
  },
  "UNKNOWN": {
    description: "Job cancelled or unhandled error",
    suggestion: "Check logs for more details. May be due to bot issues or network problems.",
    severity: "low",
  },
  "NONE": {
    description: "No error (successful)",
    suggestion: "This is a successful checkout.",
    severity: "low",
  },
};

function getSuggestion(errorCode: string) {
  // Check for exact match first
  if (ERROR_SUGGESTIONS[errorCode]) {
    return ERROR_SUGGESTIONS[errorCode];
  }
  
  // Check for partial matches
  for (const [code, info] of Object.entries(ERROR_SUGGESTIONS)) {
    if (errorCode.includes(code)) {
      return info;
    }
  }
  
  return {
    description: "Unknown error type",
    suggestion: "Investigate the error logs for more details.",
    severity: "medium" as const,
  };
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/analytics/errors");
      if (!response.ok) throw new Error("Failed to fetch analytics");
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-destructive">Error: {error}</p>
        <p className="text-sm text-muted-foreground">
          Make sure you have imported checkout data first.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No analytics data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Error Analysis</h1>
        <p className="text-muted-foreground">
          Analyze failed checkouts and identify patterns
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatsCard
          title="Total Failed"
          value={data.totalFailed.toLocaleString()}
          icon={XCircle}
        />
        <StatsCard
          title="Total Success"
          value={data.totalSuccess.toLocaleString()}
          icon={CheckCircle2}
        />
        <StatsCard
          title="Failure Rate"
          value={`${data.failureRate.toFixed(1)}%`}
          icon={TrendingDown}
        />
        <StatsCard
          title="Unique Errors"
          value={data.errorBreakdown.length.toLocaleString()}
          icon={AlertTriangle}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Error Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Error Code Breakdown
            </CardTitle>
            <CardDescription>
              Distribution of error types
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.errorBreakdown.length === 0 ? (
              <p className="text-muted-foreground text-sm">No error data available</p>
            ) : (
              <div className="space-y-3">
                {data.errorBreakdown.map((item) => (
                  <div key={item.errorCode} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-sm">{item.errorCode || "Unknown"}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {item.count} ({item.percentage.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-destructive h-2 rounded-full"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {getSuggestion(item.errorCode).description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Suggestions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Recommendations
            </CardTitle>
            <CardDescription>
              Suggestions based on error patterns
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.errorBreakdown.length === 0 ? (
              <p className="text-muted-foreground text-sm">No recommendations available</p>
            ) : (
              <div className="space-y-4">
                {data.errorBreakdown
                  .filter(e => e.errorCode !== "NONE")
                  .slice(0, 5)
                  .map((item) => {
                    const suggestion = getSuggestion(item.errorCode);
                    return (
                      <div key={item.errorCode} className="p-3 bg-muted rounded-lg space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              suggestion.severity === "high"
                                ? "destructive"
                                : suggestion.severity === "medium"
                                ? "warning"
                                : "secondary"
                            }
                          >
                            {suggestion.severity}
                          </Badge>
                          <span className="font-mono text-sm">{item.errorCode}</span>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {item.count} occurrences
                          </span>
                        </div>
                        <p className="text-sm">{suggestion.suggestion}</p>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Problematic Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Problematic Accounts
          </CardTitle>
          <CardDescription>
            Accounts with high failure rates that may need attention
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.problematicAccounts.length === 0 ? (
            <p className="text-muted-foreground text-sm">No problematic accounts found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Failures</TableHead>
                  <TableHead>Successes</TableHead>
                  <TableHead>Failure Rate</TableHead>
                  <TableHead>Last Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.problematicAccounts.map((account) => (
                  <TableRow key={account.accountId}>
                    <TableCell className="font-medium">{account.email}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">{account.failureCount}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="success">{account.successCount}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className={account.failureRate > 50 ? "text-destructive" : ""}>
                        {account.failureRate.toFixed(0)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{account.lastError}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent Errors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Errors
          </CardTitle>
          <CardDescription>
            Latest failed checkout attempts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.recentErrors.length === 0 ? (
            <p className="text-muted-foreground text-sm">No recent errors</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentErrors.map((error) => (
                  <TableRow key={error.id}>
                    <TableCell className="font-medium truncate max-w-[200px]">
                      {error.email}
                    </TableCell>
                    <TableCell className="truncate max-w-[200px]">
                      {error.eventName || "Unknown"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="destructive" className="font-mono">
                        {error.errorCode}
                      </Badge>
                    </TableCell>
                    <TableCell className="truncate max-w-[300px] text-muted-foreground text-sm">
                      {error.errorMessage}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
