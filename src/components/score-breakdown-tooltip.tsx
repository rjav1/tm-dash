"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Info } from "lucide-react";

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

interface ScoreBreakdownTooltipProps {
  score: number;
  breakdown: ScoreBreakdown;
  children?: React.ReactNode;
}

const WEIGHTS = {
  percentile: 40,
  consistency: 25,
  recentPerformance: 15,
  eventCoverage: 10,
  purchaseSuccess: 10,
};

export function ScoreBreakdownTooltip({
  score,
  breakdown,
  children,
}: ScoreBreakdownTooltipProps) {
  const confidenceColors = {
    low: "bg-yellow-500",
    medium: "bg-blue-500",
    high: "bg-green-500",
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          {children || (
            <div className="flex items-center gap-1 cursor-help">
              <span className="font-mono font-bold">{score.toFixed(1)}</span>
              <Info className="h-3 w-3 text-muted-foreground" />
            </div>
          )}
        </TooltipTrigger>
        <TooltipContent side="left" className="w-80 p-0">
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Composite Score Breakdown</span>
              <Badge
                variant="outline"
                className={`text-white ${confidenceColors[breakdown.confidence]}`}
              >
                {breakdown.confidence} confidence
              </Badge>
            </div>

            <div className="text-xs text-muted-foreground">
              {breakdown.confidenceReason}
            </div>

            <div className="space-y-2">
              {/* Percentile */}
              <ScoreRow
                label="Percentile"
                weight={WEIGHTS.percentile}
                rawScore={breakdown.percentileScore}
                contribution={breakdown.percentileContribution}
              />
              
              {/* Consistency */}
              <ScoreRow
                label="Consistency"
                weight={WEIGHTS.consistency}
                rawScore={breakdown.consistencyScore}
                contribution={breakdown.consistencyContribution}
              />
              
              {/* Recent Performance */}
              <ScoreRow
                label="Recent"
                weight={WEIGHTS.recentPerformance}
                rawScore={breakdown.recentPerformanceScore}
                contribution={breakdown.recentPerformanceContribution}
              />
              
              {/* Event Coverage */}
              <ScoreRow
                label="Events"
                weight={WEIGHTS.eventCoverage}
                rawScore={breakdown.eventCoverageScore}
                contribution={breakdown.eventCoverageContribution}
              />
              
              {/* Purchase Success */}
              <ScoreRow
                label="Purchased"
                weight={WEIGHTS.purchaseSuccess}
                rawScore={breakdown.purchaseSuccessScore}
                contribution={breakdown.purchaseSuccessContribution}
              />
            </div>

            <div className="pt-2 border-t flex justify-between items-center">
              <span className="font-semibold">Total Score</span>
              <span className="text-xl font-bold">{breakdown.compositeScore.toFixed(1)}</span>
            </div>

            <div className="text-xs text-muted-foreground">
              Formula: (Percentile × 40%) + (Consistency × 25%) + (Recent × 15%) + (Events × 10%) + (Purchased × 10%)
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ScoreRow({
  label,
  weight,
  rawScore,
  contribution,
}: {
  label: string;
  weight: number;
  rawScore: number;
  contribution: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span>
          {label} <span className="text-muted-foreground">({weight}%)</span>
        </span>
        <span>
          {rawScore.toFixed(0)} → <span className="font-medium">+{contribution.toFixed(1)}</span>
        </span>
      </div>
      <Progress value={rawScore} className="h-1.5" />
    </div>
  );
}

/**
 * Simplified version for table cells
 */
export function CompositeScoreCell({
  score,
  breakdown,
}: {
  score: number;
  breakdown: ScoreBreakdown;
}) {
  const bgColor = score >= 70 
    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
    : score >= 50
    ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
    : score >= 30
    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";

  return (
    <ScoreBreakdownTooltip score={score} breakdown={breakdown}>
      <div
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-sm cursor-help ${bgColor}`}
      >
        {score.toFixed(1)}
        <Info className="h-3 w-3 opacity-60" />
      </div>
    </ScoreBreakdownTooltip>
  );
}
