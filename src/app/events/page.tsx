"use client";

import { useEffect, useState, useCallback } from "react";
import { BarChart3, ShoppingCart, Search, ArrowUpDown, X, RefreshCw, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EditEventDialog } from "@/components/edit-event-dialog";
import { AddEventDialog } from "@/components/add-event-dialog";
import { formatDateWithDay, getDayOfWeek } from "@/lib/utils";
import { PaginationControls } from "@/components/pagination-controls";
import { useToast } from "@/hooks/use-toast";

interface Event {
  id: string;
  tmEventId: string;
  artistName: string | null;
  eventName: string;
  venue: string | null;
  eventDate: string | null;
  dayOfWeek: string | null;
  eventDateRaw: string | null;
  createdAt: string;
  getInPrice: number | null;
  getInPriceUrl: string | null;
  getInPriceSource: string | null;
  getInPriceUpdatedAt: string | null;
  stats: {
    queueTests: number;
    purchases: number;
    successfulPurchases: number;
    avgQueuePosition: number;
  };
}

// Extended event type that includes all editable fields for the dialog
type EditableEvent = Event;

type SortField = "eventName" | "artistName" | "venue" | "eventDate" | "updatedAt" | "getInPrice" | "queueTests" | "purchases";
type SortOrder = "asc" | "desc";

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [sortBy, setSortBy] = useState<SortField>("updatedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [syncingInfo, setSyncingInfo] = useState(false);
  const [syncingPrices, setSyncingPrices] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const { toast } = useToast();

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      params.set("page", page.toString());
      params.set("limit", pageSize.toString());
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);

      const response = await fetch(`/api/events?${params}`);
      const data = await response.json();
      setEvents(data.events || []);
      setTotalPages(data.pagination?.pages || 1);
      setTotalItems(data.pagination?.total || 0);
    } catch (error) {
      console.error("Failed to fetch events:", error);
    } finally {
      setLoading(false);
    }
  }, [search, page, pageSize, sortBy, sortOrder]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchEvents();
  };

  const handleSyncAllInfo = async () => {
    const eventIds = selectedEventIds.size > 0 
      ? Array.from(selectedEventIds) 
      : events.map(e => e.id);
    
    if (eventIds.length === 0) {
      toast({
        title: "No Events",
        description: "No events to sync",
        variant: "destructive",
      });
      return;
    }

    setSyncingInfo(true);
    setSyncProgress({ current: 0, total: eventIds.length });

    try {
      const response = await fetch("/api/events/sync-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventIds }),
      });

      if (!response.ok) {
        throw new Error("Sync failed");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response stream");
      }

      let synced = 0;
      let failed = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === "progress") {
              setSyncProgress({ current: data.current, total: data.total });
              if (data.success) {
                synced++;
              } else {
                failed++;
              }
            } else if (data.type === "complete") {
              toast({
                title: "Sync Complete",
                description: `Synced ${data.synced} events, ${data.failed} failed`,
              });
            }
          }
        }
      }

      fetchEvents();
      setSelectedEventIds(new Set());
    } catch (error) {
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Network error",
        variant: "destructive",
      });
    } finally {
      setSyncingInfo(false);
      setSyncProgress({ current: 0, total: 0 });
    }
  };

  const handleSyncAllPrices = async () => {
    const eventIds = selectedEventIds.size > 0 
      ? Array.from(selectedEventIds) 
      : events.map(e => e.id);
    
    if (eventIds.length === 0) {
      toast({
        title: "No Events",
        description: "No events to sync",
        variant: "destructive",
      });
      return;
    }

    setSyncingPrices(true);
    setSyncProgress({ current: 0, total: eventIds.length });

    try {
      const response = await fetch("/api/events/sync-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventIds }),
      });

      if (!response.ok) {
        throw new Error("Sync failed");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response stream");
      }

      let synced = 0;
      let failed = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === "progress") {
              setSyncProgress({ current: data.current, total: data.total });
              if (data.success) {
                synced++;
              } else {
                failed++;
              }
            } else if (data.type === "complete") {
              toast({
                title: "Price Sync Complete",
                description: `Updated ${data.synced} prices, ${data.failed} failed, ${data.skipped} skipped`,
              });
            }
          }
        }
      }

      fetchEvents();
      setSelectedEventIds(new Set());
    } catch (error) {
      toast({
        title: "Price Sync Failed",
        description: error instanceof Error ? error.message : "Network error",
        variant: "destructive",
      });
    } finally {
      setSyncingPrices(false);
      setSyncProgress({ current: 0, total: 0 });
    }
  };

  const handleToggleAll = () => {
    if (selectedEventIds.size === events.length) {
      setSelectedEventIds(new Set());
    } else {
      setSelectedEventIds(new Set(events.map(e => e.id)));
    }
  };

  const handleToggleEvent = (eventId: string) => {
    const newSelected = new Set(selectedEventIds);
    if (newSelected.has(eventId)) {
      newSelected.delete(eventId);
    } else {
      newSelected.add(eventId);
    }
    setSelectedEventIds(newSelected);
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer hover:bg-muted/50"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={`h-3 w-3 ${sortBy === field ? "opacity-100" : "opacity-30"}`} />
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Events</h1>
          <p className="text-muted-foreground">
            Track events and their performance metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedEventIds.size > 0 && (
            <Badge variant="secondary" className="text-sm">
              {selectedEventIds.size} selected
            </Badge>
          )}
          <Button
            variant="outline"
            onClick={handleSyncAllInfo}
            disabled={syncingInfo || syncingPrices}
          >
            {syncingInfo ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {selectedEventIds.size > 0 
              ? `Sync ${selectedEventIds.size} Event${selectedEventIds.size > 1 ? 's' : ''} Info`
              : "Sync All Info"
            }
          </Button>
          <Button
            variant="outline"
            onClick={handleSyncAllPrices}
            disabled={syncingInfo || syncingPrices}
          >
            {syncingPrices ? (
              <DollarSign className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <DollarSign className="h-4 w-4 mr-2" />
            )}
            {selectedEventIds.size > 0 
              ? `Sync ${selectedEventIds.size} Price${selectedEventIds.size > 1 ? 's' : ''}`
              : "Sync All Prices"
            }
          </Button>
          <AddEventDialog onCreated={fetchEvents} />
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1 min-w-[250px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by event name, artist, venue..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
                {search && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setSearch("")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <Button type="submit">Search</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Events ({totalItems.toLocaleString()})</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Progress Bar */}
          {(syncingInfo || syncingPrices) && syncProgress.total > 0 && (
            <div className="mb-4 p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  {syncingInfo ? "Syncing Event Info..." : "Syncing Prices..."}
                </span>
                <span className="text-sm text-muted-foreground">
                  {syncProgress.current} / {syncProgress.total}
                </span>
              </div>
              <div className="w-full bg-background rounded-full h-2.5">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                ></div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground text-right">
                {Math.round((syncProgress.current / syncProgress.total) * 100)}%
              </div>
            </div>
          )}
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading events...
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No events found. Import queue data to create events.
            </div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <input
                      type="checkbox"
                      checked={selectedEventIds.size === events.length && events.length > 0}
                      onChange={handleToggleAll}
                      className="cursor-pointer h-4 w-4"
                    />
                  </TableHead>
                  <SortHeader field="artistName">Artist</SortHeader>
                  <SortHeader field="eventName">Event Name</SortHeader>
                  <TableHead>Event ID</TableHead>
                  <SortHeader field="venue">Venue</SortHeader>
                  <SortHeader field="eventDate">Date</SortHeader>
                  <SortHeader field="getInPrice">Get-In Price</SortHeader>
                  <SortHeader field="queueTests">Queue Tests</SortHeader>
                  <SortHeader field="purchases">Purchases</SortHeader>
                  <TableHead className="w-[50px]">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id} className="hover:bg-muted/50">
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedEventIds.has(event.id)}
                        onChange={() => handleToggleEvent(event.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="cursor-pointer h-4 w-4"
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {event.artistName || "-"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {event.eventName}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {event.tmEventId}
                      </code>
                    </TableCell>
                    <TableCell>{event.venue || "-"}</TableCell>
                    <TableCell>
                      {event.eventDateRaw ? (
                        <div>
                          {event.eventDate && <span className="font-medium">{getDayOfWeek(event.eventDate)}, </span>}
                          {event.eventDateRaw}
                        </div>
                      ) : "-"}
                    </TableCell>
                    <TableCell>
                      {event.getInPrice ? (
                        event.getInPriceUrl ? (
                          <a
                            href={event.getInPriceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-green-600 hover:underline"
                          >
                            ${event.getInPrice.toFixed(0)}
                          </a>
                        ) : (
                          <span className="font-semibold text-green-600">
                            ${event.getInPrice.toFixed(0)}
                          </span>
                        )
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                        {event.stats.queueTests.toLocaleString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {event.stats.successfulPurchases}/{event.stats.purchases}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <EditEventDialog event={event} onUpdate={fetchEvents} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            <PaginationControls
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={totalItems}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
