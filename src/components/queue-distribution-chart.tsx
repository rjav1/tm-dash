"use client";

import { useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Legend,
  Scatter,
  ScatterChart,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, MousePointer, Trash2, RotateCcw, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface HistogramData {
  bucket: string;
  count: number;
  start: number;
  end: number;
}

interface ScatterData {
  rank: number;
  position: number;
  id?: string;
}

interface ExcludedScatterData extends ScatterData {
  excluded: boolean;
  reason?: string;
}

interface QueueDistributionChartProps {
  histogram: HistogramData[];
  scatter: ScatterData[];
  excludedScatter?: ExcludedScatterData[];
  excludedCount?: number;
  eventId?: string;
  eventName?: string;
  onExclusionChange?: () => void;
}

export function QueueDistributionChart({
  histogram,
  scatter,
  excludedScatter = [],
  excludedCount = 0,
  eventId,
  eventName,
  onExclusionChange,
}: QueueDistributionChartProps) {
  const [chartType, setChartType] = useState<"histogram" | "scatter">("scatter");
  const [selectionMode, setSelectionMode] = useState(false);
  const [showExcluded, setShowExcluded] = useState(true);
  const [isExcluding, setIsExcluding] = useState(false);
  
  // Selection state for range selection (line chart)
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Selection state for histogram bars
  const [selectedBars, setSelectedBars] = useState<Set<number>>(new Set());
  
  const { toast } = useToast();

  const handleMouseDown = useCallback((e: { activePayload?: Array<{ payload: ScatterData }> }) => {
    if (!selectionMode || !e.activePayload?.[0]) return;
    const position = e.activePayload[0].payload.position;
    setSelectionStart(position);
    setSelectionEnd(position);
    setIsDragging(true);
  }, [selectionMode]);

  const handleMouseMove = useCallback((e: { activePayload?: Array<{ payload: ScatterData }> }) => {
    if (!isDragging || !e.activePayload?.[0]) return;
    const position = e.activePayload[0].payload.position;
    setSelectionEnd(position);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectionStart(null);
    setSelectionEnd(null);
    setSelectedBars(new Set());
  }, []);

  // Handle clicking on histogram bars
  const handleBarClick = useCallback((data: HistogramData, index: number) => {
    if (!selectionMode) return;
    
    setSelectedBars(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  }, [selectionMode]);

  // Calculate selected range from line chart drag
  const lineChartMin = selectionStart !== null && selectionEnd !== null
    ? Math.min(selectionStart, selectionEnd)
    : null;
  const lineChartMax = selectionStart !== null && selectionEnd !== null
    ? Math.max(selectionStart, selectionEnd)
    : null;
  
  // Calculate selected range from histogram bar clicks
  const histogramRanges = Array.from(selectedBars).map(idx => histogram[idx]).filter(Boolean);
  const histogramMin = histogramRanges.length > 0 
    ? Math.min(...histogramRanges.map(h => h.start))
    : null;
  const histogramMax = histogramRanges.length > 0
    ? Math.max(...histogramRanges.map(h => h.end))
    : null;
  
  // Use the appropriate selection based on chart type
  const selectedMin = chartType === "histogram" ? histogramMin : lineChartMin;
  const selectedMax = chartType === "histogram" ? histogramMax : lineChartMax;
  
  // Count points in selection
  const selectedCount = selectedMin !== null && selectedMax !== null
    ? scatter.filter(p => p.position >= selectedMin && p.position <= selectedMax).length
    : 0;
  
  // Count from histogram bars directly
  const histogramSelectedCount = histogramRanges.reduce((sum, h) => sum + h.count, 0);

  const handleExcludeSelected = async () => {
    if (!eventId || selectedMin === null || selectedMax === null) return;
    
    setIsExcluding(true);
    try {
      const response = await fetch("/api/queues/exclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "exclude",
          eventId,
          positionRange: { min: selectedMin, max: selectedMax },
          reason: `Excluded range ${selectedMin.toLocaleString()}-${selectedMax.toLocaleString()} (outliers)`,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Positions Excluded",
          description: `Excluded ${data.updated} position(s) from calculations`,
        });
        clearSelection();
        onExclusionChange?.();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: "Exclusion Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsExcluding(false);
    }
  };

  const handleResetExclusions = async () => {
    if (!eventId) return;
    
    setIsExcluding(true);
    try {
      const response = await fetch(`/api/queues/exclusions?eventId=${eventId}&confirm=yes`, {
        method: "DELETE",
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Exclusions Reset",
          description: `Restored ${data.restored} position(s)`,
        });
        onExclusionChange?.();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: "Reset Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsExcluding(false);
    }
  };

  if (histogram.length === 0 && scatter.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            No distribution data available. Select an event to view.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Combine active and excluded scatter data for visualization
  const combinedScatter = [
    ...scatter.map(s => ({ ...s, excluded: false })),
    ...(showExcluded ? excludedScatter.map(s => ({ ...s, excluded: true })) : []),
  ].sort((a, b) => a.position - b.position);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            {chartType === "histogram" ? (
              <BarChart3 className="h-5 w-5" />
            ) : (
              <TrendingUp className="h-5 w-5" />
            )}
            Position Distribution
            {eventName && <span className="text-muted-foreground text-sm font-normal">- {eventName}</span>}
          </CardTitle>
          <div className="flex gap-2 flex-wrap">
            {/* Chart type toggle */}
            <Button
              variant={chartType === "scatter" ? "default" : "outline"}
              size="sm"
              onClick={() => setChartType("scatter")}
            >
              Line Plot
            </Button>
            <Button
              variant={chartType === "histogram" ? "default" : "outline"}
              size="sm"
              onClick={() => setChartType("histogram")}
            >
              Histogram
            </Button>
          </div>
        </div>
        
        {/* Controls row */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {/* Selection mode toggle */}
          <Button
            variant={selectionMode ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setSelectionMode(!selectionMode);
              if (!selectionMode) clearSelection();
            }}
          >
            <MousePointer className="h-4 w-4 mr-1" />
            {selectionMode ? "Selection Mode ON" : "Select Range"}
          </Button>
          
          {/* Show/hide excluded */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowExcluded(!showExcluded)}
          >
            {showExcluded ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
            {showExcluded ? "Hide" : "Show"} Excluded
          </Button>
          
          {/* Excluded count badge */}
          {excludedCount > 0 && (
            <Badge variant="secondary">
              {excludedCount} excluded
            </Badge>
          )}
          
          {/* Reset exclusions */}
          {excludedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetExclusions}
              disabled={isExcluding}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset All
            </Button>
          )}
        </div>

        {/* Selection info */}
        {selectionMode && selectedMin !== null && selectedMax !== null && (
          <div className="flex items-center gap-2 mt-2 p-2 bg-muted rounded flex-wrap">
            <span className="text-sm">
              Selected: {selectedMin.toLocaleString()} - {selectedMax.toLocaleString()} 
              ({chartType === "histogram" ? histogramSelectedCount : selectedCount} positions
              {chartType === "histogram" && selectedBars.size > 0 && ` in ${selectedBars.size} bar(s)`})
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleExcludeSelected}
              disabled={isExcluding || (chartType === "histogram" ? histogramSelectedCount === 0 : selectedCount === 0)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Exclude Selected
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearSelection}
            >
              Clear
            </Button>
          </div>
        )}
        
        {selectionMode && !isDragging && selectedMin === null && (
          <CardDescription className="mt-2">
            {chartType === "histogram" 
              ? "Click on histogram bars to select ranges to exclude (click again to deselect)"
              : "Click and drag on the chart to select a range of positions to exclude"
            }
          </CardDescription>
        )}

      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "histogram" ? (
              <BarChart 
                data={histogram}
                onClick={(e) => {
                  if (selectionMode && e && e.activeTooltipIndex !== undefined) {
                    const index = e.activeTooltipIndex;
                    const barData = histogram[index];
                    if (barData) {
                      handleBarClick(barData, index);
                    }
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="bucket"
                  tick={{ fontSize: 10 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                  formatter={(value: number, _name: string, props: { payload?: HistogramData }) => {
                    const payload = props.payload;
                    if (payload) {
                      return [
                        `${value} accounts (${payload.start.toLocaleString()} - ${payload.end.toLocaleString()})`,
                        selectionMode ? "Click to select" : "Position Range"
                      ];
                    }
                    return [value, "Accounts"];
                  }}
                />
                <Bar
                  dataKey="count"
                  radius={[4, 4, 0, 0]}
                  cursor={selectionMode ? "pointer" : "default"}
                >
                  {histogram.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={selectedBars.has(index) 
                        ? "hsl(var(--destructive))" 
                        : "hsl(var(--primary))"
                      }
                      opacity={selectedBars.has(index) ? 0.8 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <LineChart
                data={scatter}
                onMouseDown={selectionMode ? handleMouseDown : undefined}
                onMouseMove={selectionMode ? handleMouseMove : undefined}
                onMouseUp={selectionMode ? handleMouseUp : undefined}
                onMouseLeave={selectionMode ? handleMouseUp : undefined}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="rank"
                  tick={{ fontSize: 12 }}
                  label={{
                    value: "Account Rank",
                    position: "insideBottom",
                    offset: -5,
                  }}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `${Math.round(value / 1000)}k`}
                  label={{
                    value: "Queue Position",
                    angle: -90,
                    position: "insideLeft",
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                  formatter={(value: number) => [
                    `#${value.toLocaleString()}`,
                    "Position",
                  ]}
                  labelFormatter={(label) => `Rank #${label}`}
                />
                <Legend />
                
                {/* Selection area */}
                {selectionMode && selectedMin !== null && selectedMax !== null && (
                  <ReferenceArea
                    y1={selectedMin}
                    y2={selectedMax}
                    fill="hsl(var(--destructive))"
                    fillOpacity={0.2}
                    stroke="hsl(var(--destructive))"
                    strokeDasharray="3 3"
                  />
                )}
                
                {/* Main line */}
                <Line
                  type="monotone"
                  dataKey="position"
                  stroke="hsl(var(--primary))"
                  dot={scatter.length < 100}
                  strokeWidth={2}
                  name="Queue Position"
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Show excluded points as a separate scatter if any */}
        {showExcluded && excludedScatter.length > 0 && chartType === "scatter" && (
          <div className="mt-2 p-2 bg-muted/50 rounded text-sm">
            <span className="font-medium">Excluded positions:</span>{" "}
            {excludedScatter.slice(0, 10).map(p => `#${p.position.toLocaleString()}`).join(", ")}
            {excludedScatter.length > 10 && ` ... and ${excludedScatter.length - 10} more`}
          </div>
        )}

      </CardContent>
    </Card>
  );
}
