"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

// ================================
// REVENUE AREA CHART (30-day trend)
// ================================
interface DailyTrend {
  date: string;
  revenue: number;
  count: number;
  tickets: number;
}

interface RevenueAreaChartProps {
  data: DailyTrend[];
}

export function RevenueAreaChart({ data }: RevenueAreaChartProps) {
  // Format date for display
  const formattedData = data.map((d) => ({
    ...d,
    dateLabel: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Revenue Trend</CardTitle>
        <CardDescription>Daily revenue over the last 30 days</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis 
                dataKey="dateLabel" 
                tick={{ fontSize: 11 }} 
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis 
                tick={{ fontSize: 11 }} 
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                }}
                formatter={(value: number, name: string) => [
                  name === 'revenue' ? formatCurrency(value) : value,
                  name === 'revenue' ? 'Revenue' : 'Purchases'
                ]}
                labelFormatter={(label) => `Date: ${label}`}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--primary))"
                fill="url(#revenueGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ================================
// PROFIT PIE CHART
// ================================
interface ProfitPieChartProps {
  realized: number;
  unrealized: number;
}

const PROFIT_COLORS = {
  realized: "hsl(142, 76%, 36%)", // Green
  unrealized: "hsl(217, 91%, 60%)", // Blue
};

export function ProfitPieChart({ realized, unrealized }: ProfitPieChartProps) {
  const data = [
    { name: "Realized", value: Math.max(0, realized), color: PROFIT_COLORS.realized },
    { name: "Unrealized", value: Math.max(0, unrealized), color: PROFIT_COLORS.unrealized },
  ].filter(d => d.value > 0);

  const total = realized + unrealized;

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Profit Breakdown</CardTitle>
          <CardDescription>Realized vs Unrealized</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex items-center justify-center text-muted-foreground">
            No profit data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Profit Breakdown</CardTitle>
        <CardDescription>Realized vs Unrealized</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                }}
                formatter={(value: number) => [formatCurrency(value), 'Profit']}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-6 mt-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PROFIT_COLORS.realized }} />
            <span className="text-sm text-muted-foreground">Realized</span>
            <span className="text-sm font-medium">{formatCurrency(realized)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PROFIT_COLORS.unrealized }} />
            <span className="text-sm text-muted-foreground">Unrealized</span>
            <span className="text-sm font-medium">{formatCurrency(unrealized)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ================================
// WEEKLY PERFORMANCE CHART
// ================================
interface WeeklyTrend {
  week: string;
  purchases: number;
  revenue: number;
  sales: number;
  salesRevenue: number;
}

interface WeeklyPerformanceChartProps {
  data: WeeklyTrend[];
}

export function WeeklyPerformanceChart({ data }: WeeklyPerformanceChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Weekly Performance</CardTitle>
        <CardDescription>Purchases and sales over the last 8 weeks</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis 
                dataKey="week" 
                tick={{ fontSize: 11 }} 
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                tick={{ fontSize: 11 }} 
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                }}
                formatter={(value: number, name: string) => [
                  value,
                  name === 'purchases' ? 'Purchases' : 'Sales'
                ]}
              />
              <Legend />
              <Bar 
                dataKey="purchases" 
                name="Purchases" 
                fill="hsl(var(--primary))" 
                radius={[4, 4, 0, 0]} 
              />
              <Bar 
                dataKey="sales" 
                name="Sales" 
                fill="hsl(142, 76%, 36%)" 
                radius={[4, 4, 0, 0]} 
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ================================
// EVENT PERFORMANCE CHART (Horizontal Bar)
// ================================
interface EventPerformance {
  id: string;
  name: string;
  profit: number;
  roi: number;
  ticketsBought: number;
  ticketsSold: number;
}

interface EventPerformanceChartProps {
  data: EventPerformance[];
}

export function EventPerformanceChart({ data }: EventPerformanceChartProps) {
  // Truncate long names and sort by profit
  const formattedData = data
    .map((e) => ({
      ...e,
      shortName: e.name.length > 30 ? e.name.substring(0, 27) + '...' : e.name,
    }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 8);

  if (formattedData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Top Events by Profit</CardTitle>
          <CardDescription>Best performing events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[320px] flex items-center justify-center text-muted-foreground">
            No event data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Top Events by Profit</CardTitle>
        <CardDescription>Best performing events</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={formattedData} 
              layout="vertical" 
              margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
              <XAxis 
                type="number" 
                tick={{ fontSize: 11 }} 
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <YAxis 
                type="category" 
                dataKey="shortName" 
                tick={{ fontSize: 10 }} 
                tickLine={false}
                axisLine={false}
                width={120}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                }}
                formatter={(value: number, _name: string, props: { payload?: EventPerformance }) => {
                  const event = props.payload;
                  return [
                    formatCurrency(value),
                    `Profit (${event?.roi || 0}% ROI)`
                  ];
                }}
                labelFormatter={(label) => label}
              />
              <Bar 
                dataKey="profit" 
                fill="hsl(142, 76%, 36%)" 
                radius={[0, 4, 4, 0]}
              >
                {formattedData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.profit >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ================================
// TICKET PIPELINE CHART (Funnel)
// ================================
interface TicketPipelineChartProps {
  purchased: number;
  listed: number;
  sold: number;
}

export function TicketPipelineChart({ purchased, listed, sold }: TicketPipelineChartProps) {
  const data = [
    { name: "Purchased", value: purchased, fill: "hsl(var(--primary))" },
    { name: "Listed", value: listed, fill: "hsl(217, 91%, 60%)" },
    { name: "Sold", value: sold, fill: "hsl(142, 76%, 36%)" },
  ];

  const maxValue = Math.max(purchased, listed, sold, 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Ticket Pipeline</CardTitle>
        <CardDescription>From purchase to sale</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 pt-2">
          {data.map((item, index) => (
            <div key={item.name} className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{item.name}</span>
                <span className="font-medium">{item.value.toLocaleString()}</span>
              </div>
              <div className="h-8 w-full bg-muted rounded-md overflow-hidden relative">
                <div
                  className="h-full rounded-md transition-all duration-500"
                  style={{
                    width: `${(item.value / maxValue) * 100}%`,
                    backgroundColor: item.fill,
                    minWidth: item.value > 0 ? '2rem' : '0',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        
        {/* Conversion rates */}
        <div className="flex justify-between mt-6 pt-4 border-t text-sm">
          <div className="text-center">
            <div className="text-muted-foreground">List Rate</div>
            <div className="font-medium">
              {purchased > 0 ? Math.round((listed / purchased) * 100) : 0}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Sell Rate</div>
            <div className="font-medium">
              {listed > 0 ? Math.round((sold / listed) * 100) : 0}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Overall</div>
            <div className="font-medium">
              {purchased > 0 ? Math.round((sold / purchased) * 100) : 0}%
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ================================
// CARD HEALTH CHART
// ================================
interface CardHealthChartProps {
  health: Record<string, number>;
  total: number;
}

const CARD_STATUS_COLORS: Record<string, string> = {
  AVAILABLE: "hsl(142, 76%, 36%)", // Green
  IN_USE: "hsl(217, 91%, 60%)", // Blue
  DECLINED: "hsl(0, 84%, 60%)", // Red
  EXHAUSTED: "hsl(48, 96%, 53%)", // Yellow
};

const CARD_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Available",
  IN_USE: "In Use",
  DECLINED: "Declined",
  EXHAUSTED: "Exhausted",
};

export function CardHealthChart({ health, total }: CardHealthChartProps) {
  const statuses = ['AVAILABLE', 'IN_USE', 'DECLINED', 'EXHAUSTED'];
  
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Card Health</CardTitle>
        <CardDescription>{total} total cards</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Stacked horizontal bar */}
        <div className="h-10 w-full bg-muted rounded-md overflow-hidden flex">
          {statuses.map((status) => {
            const count = health[status] || 0;
            const percentage = total > 0 ? (count / total) * 100 : 0;
            if (percentage === 0) return null;
            
            return (
              <div
                key={status}
                className="h-full transition-all duration-500"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: CARD_STATUS_COLORS[status],
                }}
                title={`${CARD_STATUS_LABELS[status]}: ${count}`}
              />
            );
          })}
        </div>
        
        {/* Legend */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          {statuses.map((status) => {
            const count = health[status] || 0;
            return (
              <div key={status} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: CARD_STATUS_COLORS[status] }} 
                />
                <span className="text-sm text-muted-foreground">{CARD_STATUS_LABELS[status]}</span>
                <span className="text-sm font-medium ml-auto">{count}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ================================
// OPERATIONS MINI DONUT
// ================================
interface OperationsDonutProps {
  success: number;
  failed: number;
  pending?: number;
  title: string;
  subtitle?: string;
}

export function OperationsDonut({ success, failed, pending = 0, title, subtitle }: OperationsDonutProps) {
  const total = success + failed + pending;
  const successRate = total > 0 ? Math.round((success / total) * 100) : 0;
  
  const data = [
    { name: "Success", value: success, color: "hsl(142, 76%, 36%)" },
    { name: "Failed", value: failed, color: "hsl(0, 84%, 60%)" },
    { name: "Pending", value: pending, color: "hsl(var(--muted))" },
  ].filter(d => d.value > 0);

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {subtitle && <CardDescription className="text-xs">{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent className="pt-2">
        <div className="flex items-center gap-4">
          <div className="h-[80px] w-[80px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={25}
                  outerRadius={38}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold">{successRate}%</span>
            </div>
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-green-600">Success</span>
              <span className="font-medium">{success}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-red-600">Failed</span>
              <span className="font-medium">{failed}</span>
            </div>
            {pending > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pending</span>
                <span className="font-medium">{pending}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
