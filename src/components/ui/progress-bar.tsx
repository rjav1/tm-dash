"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "./button";

export type ProgressStatus = "idle" | "running" | "success" | "error" | "cancelled";

export interface ProgressBarProps {
  /** Current progress value (0-100 or current item number) */
  current: number;
  /** Total items (if using item-based progress) */
  total?: number;
  /** Progress as percentage (0-100). If not provided, calculated from current/total */
  percentage?: number;
  /** Current item label (e.g., "Processing: email@example.com") */
  label?: string;
  /** Operation status */
  status?: ProgressStatus;
  /** Show elapsed time */
  showElapsedTime?: boolean;
  /** Start time for elapsed time calculation */
  startTime?: Date;
  /** Show estimated time remaining */
  showEstimate?: boolean;
  /** Allow cancellation */
  onCancel?: () => void;
  /** Compact variant for tight spaces */
  variant?: "default" | "compact" | "minimal";
  /** Custom class name */
  className?: string;
  /** Show success/error state with icon */
  showStatusIcon?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Success message to display */
  successMessage?: string;
}

function formatElapsedTime(startTime: Date): string {
  const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatEstimatedTime(current: number, total: number, startTime: Date): string {
  if (current === 0) return "Calculating...";
  
  const elapsed = (Date.now() - startTime.getTime()) / 1000;
  const rate = current / elapsed; // items per second
  const remaining = total - current;
  const estimatedSeconds = Math.ceil(remaining / rate);
  
  if (estimatedSeconds < 60) {
    return `~${estimatedSeconds}s remaining`;
  }
  const minutes = Math.floor(estimatedSeconds / 60);
  const seconds = estimatedSeconds % 60;
  return `~${minutes}m ${seconds}s remaining`;
}

export function ProgressBar({
  current,
  total,
  percentage,
  label,
  status = "running",
  showElapsedTime = false,
  startTime,
  showEstimate = false,
  onCancel,
  variant = "default",
  className,
  showStatusIcon = true,
  errorMessage,
  successMessage,
}: ProgressBarProps) {
  // Calculate percentage
  const calculatedPercentage = percentage ?? (total && total > 0 ? Math.round((current / total) * 100) : 0);
  const clampedPercentage = Math.min(100, Math.max(0, calculatedPercentage));

  // Status colors
  const statusColors: Record<ProgressStatus, string> = {
    idle: "bg-muted",
    running: "bg-primary",
    success: "bg-green-500",
    error: "bg-red-500",
    cancelled: "bg-yellow-500",
  };

  // Status icons
  const StatusIcon = () => {
    if (!showStatusIcon) return null;
    
    switch (status) {
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "cancelled":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  // Minimal variant - just the bar
  if (variant === "minimal") {
    return (
      <div className={cn("w-full", className)}>
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full transition-all duration-300 ease-out",
              statusColors[status]
            )}
            style={{ width: `${clampedPercentage}%` }}
          />
        </div>
      </div>
    );
  }

  // Compact variant
  if (variant === "compact") {
    return (
      <div className={cn("w-full space-y-1", className)}>
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <StatusIcon />
            {label && <span className="text-muted-foreground truncate max-w-[200px]">{label}</span>}
          </div>
          <div className="flex items-center gap-2">
            {total && <span className="font-medium">{current}/{total}</span>}
            <span className="text-muted-foreground">{clampedPercentage}%</span>
          </div>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full transition-all duration-300 ease-out",
              statusColors[status]
            )}
            style={{ width: `${clampedPercentage}%` }}
          />
        </div>
      </div>
    );
  }

  // Default (full) variant
  return (
    <div className={cn("w-full space-y-2", className)}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <StatusIcon />
          {label && (
            <span className="text-sm text-muted-foreground truncate">
              {label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {total && (
            <span className="text-sm font-medium">
              {current} / {total}
            </span>
          )}
          <span className="text-sm font-semibold text-primary">
            {clampedPercentage}%
          </span>
          {onCancel && status === "running" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="h-6 w-6 p-0"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full transition-all duration-300 ease-out",
            statusColors[status],
            status === "running" && "animate-pulse"
          )}
          style={{ width: `${clampedPercentage}%` }}
        />
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {showElapsedTime && startTime && (
            <span>Elapsed: {formatElapsedTime(startTime)}</span>
          )}
          {showEstimate && total && startTime && status === "running" && current > 0 && (
            <span>{formatEstimatedTime(current, total, startTime)}</span>
          )}
        </div>
        <div>
          {status === "success" && (successMessage || "Complete!")}
          {status === "error" && (errorMessage || "Failed")}
          {status === "cancelled" && "Cancelled"}
        </div>
      </div>
    </div>
  );
}

/**
 * Inline progress indicator for buttons/actions
 * Shows a small progress bar inline with text
 */
export interface InlineProgressProps {
  current: number;
  total: number;
  label?: string;
  className?: string;
}

export function InlineProgress({ current, total, label, className }: InlineProgressProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Loader2 className="h-4 w-4 animate-spin" />
      <div className="flex items-center gap-1.5 text-sm">
        {label && <span className="text-muted-foreground">{label}</span>}
        <span className="font-medium">{current}/{total}</span>
        <span className="text-muted-foreground">({percentage}%)</span>
      </div>
    </div>
  );
}

/**
 * Table loading progress - subtle bar at top of table
 */
export interface TableLoadingProgressProps {
  loading: boolean;
  className?: string;
}

export function TableLoadingProgress({ loading, className }: TableLoadingProgressProps) {
  if (!loading) return null;
  
  return (
    <div className={cn("w-full h-1 bg-secondary overflow-hidden", className)}>
      <div className="h-full w-1/3 bg-primary animate-[shimmer_1.5s_ease-in-out_infinite]" />
      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}
