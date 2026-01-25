"use client";

import { useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AccountData {
  accountId: string;
  email: string;
  avgPercentile: number;
  consistencyScore: number;
  eventsEntered: number;
  hasPurchased: boolean;
  compositeScore: number;
}

interface ScatterQuadrantChartProps {
  data: AccountData[];
  onAccountClick?: (accountId: string) => void;
}

// Quadrant definitions
const QUADRANTS = {
  topRight: { label: "Elite & Consistent", color: "hsl(142, 76%, 36%)" }, // Green
  topLeft: { label: "Elite but Variable", color: "hsl(217, 91%, 60%)" }, // Blue
  bottomRight: { label: "Average but Consistent", color: "hsl(48, 96%, 53%)" }, // Yellow
  bottomLeft: { label: "Needs Improvement", color: "hsl(0, 84%, 60%)" }, // Red
};

function getQuadrantColor(avgPercentile: number, consistencyScore: number): string {
  const isElite = avgPercentile <= 25; // Top 25%
  const isConsistent = consistencyScore >= 60;
  
  if (isElite && isConsistent) return QUADRANTS.topRight.color;
  if (isElite && !isConsistent) return QUADRANTS.topLeft.color;
  if (!isElite && isConsistent) return QUADRANTS.bottomRight.color;
  return QUADRANTS.bottomLeft.color;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: AccountData;
  }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  
  const data = payload[0].payload;
  
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 space-y-2">
      <div className="font-medium truncate max-w-[200px]">{data.email}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">Avg Percentile:</span>
        <span className="font-mono">{data.avgPercentile.toFixed(1)}%</span>
        <span className="text-muted-foreground">Consistency:</span>
        <span className="font-mono">{data.consistencyScore.toFixed(0)}%</span>
        <span className="text-muted-foreground">Events:</span>
        <span className="font-mono">{data.eventsEntered}</span>
        <span className="text-muted-foreground">Composite:</span>
        <span className="font-mono font-bold">{data.compositeScore.toFixed(1)}</span>
      </div>
      {data.hasPurchased && (
        <Badge variant="success" className="text-xs">Has Purchased</Badge>
      )}
    </div>
  );
}

export function ScatterQuadrantChart({ data, onAccountClick }: ScatterQuadrantChartProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            No data available for scatter plot
          </p>
        </CardContent>
      </Card>
    );
  }

  // Calculate medians for quadrant lines
  const medianPercentile = 25; // Fixed threshold for "elite"
  const medianConsistency = 60; // Fixed threshold for "consistent"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Consistency vs Performance</span>
          <div className="flex gap-2 text-xs">
            {Object.entries(QUADRANTS).map(([key, { label, color }]) => (
              <div key={key} className="flex items-center gap-1">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                type="number"
                dataKey="avgPercentile"
                name="Avg Percentile"
                domain={[0, 100]}
                reversed // Lower percentile = better, so reverse
                tick={{ fontSize: 12 }}
                label={{
                  value: "← Better Percentile",
                  position: "insideBottom",
                  offset: -10,
                }}
              />
              <YAxis
                type="number"
                dataKey="consistencyScore"
                name="Consistency"
                domain={[0, 100]}
                tick={{ fontSize: 12 }}
                label={{
                  value: "More Consistent →",
                  angle: -90,
                  position: "insideLeft",
                  offset: 10,
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              
              {/* Quadrant reference lines */}
              <ReferenceLine
                x={medianPercentile}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="5 5"
              />
              <ReferenceLine
                y={medianConsistency}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="5 5"
              />

              <Scatter
                name="Accounts"
                data={data}
                onClick={(data) => onAccountClick?.(data.accountId)}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={getQuadrantColor(entry.avgPercentile, entry.consistencyScore)}
                    fillOpacity={hoveredId === entry.accountId ? 1 : 0.7}
                    stroke={entry.hasPurchased ? "hsl(var(--foreground))" : "none"}
                    strokeWidth={entry.hasPurchased ? 2 : 0}
                    r={Math.max(4, Math.min(12, entry.eventsEntered * 3))} // Size by events
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHoveredId(entry.accountId)}
                    onMouseLeave={() => setHoveredId(null)}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Summary stats */}
        <div className="mt-4 grid grid-cols-4 gap-4 text-center text-sm">
          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded">
            <div className="font-bold text-green-700 dark:text-green-300">
              {data.filter(d => d.avgPercentile <= 25 && d.consistencyScore >= 60).length}
            </div>
            <div className="text-xs text-muted-foreground">Elite & Consistent</div>
          </div>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded">
            <div className="font-bold text-blue-700 dark:text-blue-300">
              {data.filter(d => d.avgPercentile <= 25 && d.consistencyScore < 60).length}
            </div>
            <div className="text-xs text-muted-foreground">Elite but Variable</div>
          </div>
          <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded">
            <div className="font-bold text-yellow-700 dark:text-yellow-300">
              {data.filter(d => d.avgPercentile > 25 && d.consistencyScore >= 60).length}
            </div>
            <div className="text-xs text-muted-foreground">Avg but Consistent</div>
          </div>
          <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded">
            <div className="font-bold text-red-700 dark:text-red-300">
              {data.filter(d => d.avgPercentile > 25 && d.consistencyScore < 60).length}
            </div>
            <div className="text-xs text-muted-foreground">Needs Improvement</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
