"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

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

interface PerformanceTooltipProps {
  performances: EventPerformance[];
  children: React.ReactNode;
}

function getPercentileColor(percentile: number): string {
  if (percentile <= 5) return "bg-green-500";
  if (percentile <= 15) return "bg-green-400";
  if (percentile <= 30) return "bg-blue-400";
  if (percentile <= 50) return "bg-yellow-400";
  return "bg-red-400";
}

function getPercentileBadgeVariant(percentile: number): "success" | "default" | "secondary" | "destructive" {
  if (percentile <= 10) return "success";
  if (percentile <= 25) return "default";
  if (percentile <= 50) return "secondary";
  return "destructive";
}

export function PerformanceTooltip({
  performances,
  children,
}: PerformanceTooltipProps) {
  if (performances.length === 0) {
    return <>{children}</>;
  }

  // Calculate quick stats
  const top5Count = performances.filter(p => p.percentile <= 5).length;
  const top20Count = performances.filter(p => p.percentile <= 20).length;
  const totalEvents = performances.length;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <div className="cursor-help">{children}</div>
        </TooltipTrigger>
        <TooltipContent side="right" className="w-96 p-0">
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Event Performances</span>
              <div className="flex gap-1 text-xs">
                <Badge variant="success" className="text-xs">
                  Top 5%: {top5Count}/{totalEvents}
                </Badge>
                <Badge variant="default" className="text-xs">
                  Top 20%: {top20Count}/{totalEvents}
                </Badge>
              </div>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {performances
                .sort((a, b) => new Date(b.testedAt).getTime() - new Date(a.testedAt).getTime())
                .map((perf, idx) => (
                  <div
                    key={`${perf.eventId}-${idx}`}
                    className="flex items-center gap-2 p-2 bg-muted/50 rounded text-sm"
                  >
                    {/* Color indicator */}
                    <div
                      className={`w-2 h-8 rounded-full ${getPercentileColor(perf.percentile)}`}
                    />
                    
                    {/* Event details */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {perf.artistName || perf.eventName}
                        {perf.eventDateRaw && ` - ${perf.eventDateRaw}`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {perf.venue && <span>{perf.venue} • </span>}
                        {formatDate(perf.testedAt)} • {perf.totalParticipants.toLocaleString()} accounts
                      </div>
                    </div>
                    
                    {/* Position and percentile */}
                    <div className="text-right">
                      <div className="font-mono text-xs">#{perf.position.toLocaleString()}</div>
                      <Badge variant={getPercentileBadgeVariant(perf.percentile)} className="text-xs">
                        {perf.percentile.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
              <span>Percentile:</span>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span>Top 5%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span>5-15%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span>15-30%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-yellow-400" />
                <span>30-50%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <span>50%+</span>
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact inline performance indicators
 */
export function PerformanceIndicators({
  performances,
}: {
  performances: EventPerformance[];
}) {
  return (
    <div className="flex gap-0.5">
      {performances
        .sort((a, b) => new Date(b.testedAt).getTime() - new Date(a.testedAt).getTime())
        .slice(0, 5) // Show last 5
        .map((perf, idx) => (
          <div
            key={`${perf.eventId}-${idx}`}
            className={`w-2 h-4 rounded-sm ${getPercentileColor(perf.percentile)}`}
            title={`${perf.artistName || perf.eventName}${perf.eventDateRaw ? ` - ${perf.eventDateRaw}` : ""}${perf.venue ? ` @ ${perf.venue}` : ""}: ${perf.percentile.toFixed(1)}%`}
          />
        ))}
      {performances.length > 5 && (
        <span className="text-xs text-muted-foreground ml-1">+{performances.length - 5}</span>
      )}
    </div>
  );
}
