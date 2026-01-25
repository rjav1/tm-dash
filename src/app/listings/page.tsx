"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  DollarSign,
  Ticket,
  Package,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatsCard } from "@/components/stats-card";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { PaginationControls } from "@/components/pagination-controls";

interface Listing {
  id: string;
  ticketGroupId: number;
  eventName: string;
  venueName: string | null;
  venueCity: string | null;
  eventDateTime: string | null;
  section: string;
  row: string;
  startSeat: number;
  endSeat: number;
  quantity: number;
  cost: number;
  price: number;
  accountEmail: string | null;
  internalNote: string | null;
  extPONumber: string | null;
  isMatched: boolean;
  barcodesCount: number;
  pdfsCount: number;
  linksCount: number;
  pdfStatus: string | null;
  vividEventId: number | null;
  stubhubEventId: number | null;
  seatgeekEventId: number | null;
  tmEventId: string | null;
  lastSyncedAt: string;
  purchaseId: string | null;
  // Account sync metadata
  accountLastCheckedAt: string | null;
  accountSyncStatus: string | null;
}

interface ListingsStats {
  total: number;
  matched: number;
  unmatched: number;
  ours: number;
  totalValue: number;
  totalCost: number;
}

export default function ListingsPage() {
  const { toast } = useToast();
  const [listings, setListings] = useState<Listing[]>([]);
  const [stats, setStats] = useState<ListingsStats | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [matchingId, setMatchingId] = useState<string | null>(null);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState<string>("");
  const [savingPrice, setSavingPrice] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [matchFilter, setMatchFilter] = useState<string>("all");
  const [ownershipFilter, setOwnershipFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  // Fetch listings
  const fetchListings = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", limit.toString());

      if (search) params.set("search", search);
      if (matchFilter === "matched") params.set("isMatched", "true");
      if (matchFilter === "unmatched") params.set("isMatched", "false");
      if (ownershipFilter === "ours") params.set("hasExtPO", "true");
      if (eventFilter !== "all") params.set("eventName", eventFilter);

      const response = await fetch(`/api/listings?${params}`);
      const data = await response.json();

      if (data.success) {
        setListings(data.listings);
        setStats(data.stats);
        setTotalPages(data.pagination.pages);
        setTotal(data.pagination.total);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch listings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [page, search, matchFilter, ownershipFilter, eventFilter, toast]);

  // Fetch events for filter
  const fetchEvents = useCallback(async () => {
    try {
      const response = await fetch("/api/listings/events");
      const data = await response.json();
      if (data.success) {
        setEvents(data.events);
      }
    } catch (error) {
      console.error("Failed to fetch events:", error);
    }
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Sync from POS
  const handleSync = async () => {
    try {
      setSyncing(true);
      const response = await fetch("/api/listings", { method: "POST" });
      const data = await response.json();

      if (data.success) {
        toast({
          title: "Sync Complete",
          description: `${data.synced} listings synced (${data.created} new, ${data.updated} updated, ${data.linked} linked)`,
        });
        fetchListings();
        fetchEvents();
      } else {
        toast({
          title: "Sync Failed",
          description: data.error,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to sync listings",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  // Trigger match
  const handleMatch = async (listingId: string) => {
    try {
      setMatchingId(listingId);
      const response = await fetch(`/api/listings/${listingId}/match`, {
        method: "POST",
      });
      const data = await response.json();

      if (data.success) {
        toast({
          title: "Sync Triggered",
          description: `Account sync started for ${data.accountEmail}. Check back in a few minutes.`,
        });
      } else {
        toast({
          title: "Match Failed",
          description: data.error,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to trigger match",
        variant: "destructive",
      });
    } finally {
      setMatchingId(null);
    }
  };

  // Start editing price
  const startEditPrice = (listing: Listing) => {
    setEditingPriceId(listing.id);
    setEditingPrice(listing.price.toString());
  };

  // Save price
  const savePrice = async (listingId: string) => {
    try {
      setSavingPrice(true);
      const response = await fetch(`/api/listings/${listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: parseFloat(editingPrice) }),
      });
      const data = await response.json();

      if (data.success) {
        toast({
          title: "Price Updated",
          description: data.message,
        });
        setEditingPriceId(null);
        fetchListings();
      } else {
        toast({
          title: "Update Failed",
          description: data.error,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update price",
        variant: "destructive",
      });
    } finally {
      setSavingPrice(false);
    }
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingPriceId(null);
    setEditingPrice("");
  };

  // Handle price input keydown
  const handlePriceKeyDown = (e: React.KeyboardEvent, listingId: string) => {
    if (e.key === "Enter") {
      savePrice(listingId);
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: text,
    });
  };

  // Format seats display
  const formatSeats = (listing: Listing) => {
    if (listing.startSeat === listing.endSeat) {
      return listing.startSeat.toString();
    }
    return `${listing.startSeat}-${listing.endSeat}`;
  };

  // Get Vivid Seats link
  const getVividLink = (listing: Listing) => {
    if (!listing.vividEventId) return null;
    return `https://www.vividseats.com/production/${listing.vividEventId}`;
  };

  // Format time since last account sync
  const formatTimeSince = (dateString: string | null): string => {
    if (!dateString) return "-";
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Listings</h1>
          <p className="text-muted-foreground">
            POS inventory synced from TicketVault
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing}>
          {syncing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Sync from POS
            </>
          )}
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <StatsCard
            title="Total Listings"
            value={stats.total.toString()}
            icon={Package}
          />
          <StatsCard
            title="Matched"
            value={stats.matched.toString()}
            icon={CheckCircle2}
            description={`${stats.unmatched} unmatched`}
          />
          <StatsCard
            title="Our Tickets"
            value={stats.ours.toString()}
            icon={Ticket}
            description="With Ext PO#"
          />
          <StatsCard
            title="Total Cost"
            value={formatCurrency(stats.totalCost)}
            icon={DollarSign}
            description="Our tickets only"
          />
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search section, row, email, PO#..."
                  className="pl-8"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>

            <Select
              value={ownershipFilter}
              onValueChange={(v) => {
                setOwnershipFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Ownership" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tickets</SelectItem>
                <SelectItem value="ours">Our Tickets</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={matchFilter}
              onValueChange={(v) => {
                setMatchFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Match Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="matched">Matched</SelectItem>
                <SelectItem value="unmatched">Unmatched</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={eventFilter}
              onValueChange={(v) => {
                setEventFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Event" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                {events.map((event) => (
                  <SelectItem key={event} value={event}>
                    {event}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Listings Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Venue</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Row</TableHead>
                  <TableHead>Seats</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Cost/ea</TableHead>
                  <TableHead>Total Cost</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Last Matched</TableHead>
                  <TableHead>Ext PO#</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Links</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={15} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : listings.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={15}
                      className="text-center py-8 text-muted-foreground"
                    >
                      {stats?.total === 0
                        ? "No listings found. Click 'Sync from POS' to import."
                        : "No listings match your filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  listings.map((listing) => (
                    <TableRow key={listing.id}>
                      {/* Event */}
                      <TableCell>
                        <div className="max-w-[150px]">
                          <p
                            className="font-medium truncate"
                            title={listing.eventName}
                          >
                            {listing.eventName}
                          </p>
                        </div>
                      </TableCell>

                      {/* Venue */}
                      <TableCell>
                        <div className="max-w-[120px]">
                          <p className="truncate" title={listing.venueName || ""}>
                            {listing.venueName || "-"}
                          </p>
                          {listing.venueCity && (
                            <p className="text-xs text-muted-foreground truncate">
                              {listing.venueCity}
                            </p>
                          )}
                        </div>
                      </TableCell>

                      {/* Date */}
                      <TableCell>
                        {listing.eventDateTime ? (
                          <div className="text-sm">
                            {formatDateTime(listing.eventDateTime)}
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>

                      {/* Section */}
                      <TableCell className="font-medium">
                        {listing.section}
                      </TableCell>

                      {/* Row */}
                      <TableCell>{listing.row}</TableCell>

                      {/* Seats */}
                      <TableCell>{formatSeats(listing)}</TableCell>

                      {/* Quantity */}
                      <TableCell>{listing.quantity}</TableCell>

                      {/* Cost per ticket */}
                      <TableCell>{formatCurrency(listing.cost)}</TableCell>

                      {/* Total Cost (cost * quantity) */}
                      <TableCell className="font-medium">
                        {formatCurrency(listing.cost * listing.quantity)}
                      </TableCell>

                      {/* Price (editable) */}
                      <TableCell>
                        {editingPriceId === listing.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              step="0.01"
                              className="w-20 h-8 text-sm"
                              value={editingPrice}
                              onChange={(e) => setEditingPrice(e.target.value)}
                              onKeyDown={(e) =>
                                handlePriceKeyDown(e, listing.id)
                              }
                              disabled={savingPrice}
                              autoFocus
                            />
                            {savingPrice ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  onClick={() => savePrice(listing.id)}
                                >
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  onClick={cancelEdit}
                                >
                                  <XCircle className="h-4 w-4 text-red-500" />
                                </Button>
                              </>
                            )}
                          </div>
                        ) : (
                          <button
                            className="hover:underline cursor-pointer"
                            onClick={() => startEditPrice(listing)}
                            title="Click to edit"
                          >
                            {formatCurrency(listing.price)}
                          </button>
                        )}
                      </TableCell>

                      {/* Account Email */}
                      <TableCell>
                        {listing.accountEmail ? (
                          <button
                            className="text-sm text-muted-foreground hover:text-foreground truncate max-w-[150px] block"
                            onClick={() =>
                              copyToClipboard(listing.accountEmail!)
                            }
                            title={`${listing.accountEmail} (click to copy)`}
                          >
                            {listing.accountEmail}
                          </button>
                        ) : (
                          "-"
                        )}
                      </TableCell>

                      {/* Last Matched (Account Sync Time) */}
                      <TableCell>
                        <span 
                          className="text-sm text-muted-foreground"
                          title={listing.accountLastCheckedAt 
                            ? new Date(listing.accountLastCheckedAt).toLocaleString() 
                            : "Not synced"}
                        >
                          {formatTimeSince(listing.accountLastCheckedAt)}
                        </span>
                      </TableCell>

                      {/* Ext PO# */}
                      <TableCell>
                        {listing.extPONumber ? (
                          <Badge variant="secondary">
                            {listing.extPONumber}
                          </Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>

                      {/* Match Status */}
                      <TableCell>
                        {listing.isMatched ? (
                          <Badge
                            variant="default"
                            className="bg-green-500 hover:bg-green-600"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Matched
                          </Badge>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Badge variant="destructive">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Unmatched
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => handleMatch(listing.id)}
                              disabled={matchingId === listing.id}
                            >
                              {matchingId === listing.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Match"
                              )}
                            </Button>
                          </div>
                        )}
                      </TableCell>

                      {/* Marketplace Links */}
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {getVividLink(listing) && (
                            <a
                              href={getVividLink(listing)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-700"
                              title="View on Vivid Seats"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <PaginationControls
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={total}
          itemsPerPage={limit}
        />
      )}
    </div>
  );
}
