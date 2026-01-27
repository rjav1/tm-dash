"use client";

import { useState, useEffect } from "react";
import { Pencil, Trash2, RefreshCw, CheckCircle2, AlertCircle, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { VenueMap, VenueZoneData } from "@/components/venue-map";
import { ZoneFilterPanel, ZoneOption } from "@/components/zone-filter-panel";

interface Event {
  id: string;
  tmEventId: string;
  artistName?: string | null;
  eventName: string;
  venue?: string | null;
  venueId?: string | null;
  eventDate?: string | null;
  dayOfWeek?: string | null;
  eventDateRaw?: string | null;
  getInPriceUrl?: string | null;
}

interface ZoneSectionsData {
  eventId: string;
  eventName: string;
  venueId: string | null;
  venueName: string | null;
  staticMapUrl: string | null;
  zones: Array<{
    zoneName: string;
    colorHex: string | null;
    sections: string[];
    minPrice: number | null;
  }>;
  source: string;
}

interface EditEventDialogProps {
  event: Event;
  onUpdate: () => void;
}

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function EditEventDialog({ event, onUpdate }: EditEventDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [artistName, setArtistName] = useState(event.artistName || "");
  const [eventName, setEventName] = useState(event.eventName);
  const [venue, setVenue] = useState(event.venue || "");
  const [eventDateRaw, setEventDateRaw] = useState(event.eventDateRaw || "");
  const [getInPriceUrl, setGetInPriceUrl] = useState(event.getInPriceUrl || "");
  
  // Sync status
  const [syncStatus, setSyncStatus] = useState<"idle" | "success" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [syncProgress, setSyncProgress] = useState<{ percent: number; message: string } | null>(null);
  const [vividSeatsPrice, setVividSeatsPrice] = useState<number | null>(null);
  const [vividSeatsUrl, setVividSeatsUrl] = useState<string | null>(null);
  
  // Zone and venue map data
  const [zoneSectionsData, setZoneSectionsData] = useState<ZoneSectionsData | null>(null);
  const [loadingZones, setLoadingZones] = useState(false);
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  const [refreshingZones, setRefreshingZones] = useState(false);
  
  const { toast } = useToast();

  // Reset form when dialog opens or event changes
  useEffect(() => {
    if (open) {
      setArtistName(event.artistName || "");
      setEventName(event.eventName);
      setVenue(event.venue || "");
      setEventDateRaw(event.eventDateRaw || "");
      setGetInPriceUrl(event.getInPriceUrl || "");
      setSyncStatus("idle");
      setSyncMessage("");
      setSyncProgress(null);
      setVividSeatsPrice(null);
      setVividSeatsUrl(null);
      setZoneSectionsData(null);
      setSelectedZones([]);
      
      // Fetch zone data
      fetchZoneSections();
    }
  }, [open, event]);

  // Fetch zone sections data
  const fetchZoneSections = async () => {
    setLoadingZones(true);
    try {
      const response = await fetch(`/api/events/${event.id}/zone-sections`);
      const data = await response.json();
      
      if (data.success) {
        setZoneSectionsData(data);
      }
    } catch (error) {
      console.error("Failed to fetch zone sections:", error);
    } finally {
      setLoadingZones(false);
    }
  };

  // Refresh zone prices from Vivid Seats
  const handleRefreshZones = async () => {
    if (!getInPriceUrl && !event.getInPriceUrl) {
      toast({
        title: "No Vivid Seats URL",
        description: "Please enter a Vivid Seats URL first",
        variant: "destructive",
      });
      return;
    }
    
    setRefreshingZones(true);
    try {
      const response = await fetch(`/api/events/${event.id}/zone-price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zoneName: "all",
          forceRefresh: true,
        }),
      });
      
      const data = await response.json();
      
      if (data.success || data.allZones) {
        toast({
          title: "Zones Updated",
          description: `Found ${data.allZones?.length || 0} zones from Vivid Seats`,
        });
        // Refresh zone sections data
        await fetchZoneSections();
      } else {
        toast({
          title: "Refresh Failed",
          description: data.error || "Could not fetch zone prices",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Refresh Failed",
        description: "Failed to fetch zone prices",
        variant: "destructive",
      });
    } finally {
      setRefreshingZones(false);
    }
  };

  const handleSync = async () => {
    // Can sync with just event ID (will scrape TM page) or with artist name (will use API)
    if (!artistName && !event.tmEventId) {
      toast({
        title: "Missing Information",
        description: "Please enter an artist name or ensure event has an ID to sync",
        variant: "destructive",
      });
      return;
    }

    setSyncing(true);
    setSyncStatus("idle");
    setSyncMessage("");
    setSyncProgress({ percent: 0, message: "Starting..." });

    try {
      // Use streaming endpoint for live progress
      const response = await fetch("/api/events/lookup-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.tmEventId,
          artistName: artistName || undefined,
          venue: venue || undefined,
          date: eventDateRaw || undefined,
          includeVividSeats: true,
        }),
      });

      if (!response.body) {
        throw new Error("No response stream");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((line) => line.trim());

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));

              if (event.type === "progress") {
                setSyncProgress({
                  percent: event.percent || 0,
                  message: event.message || "Processing...",
                });
              } else if (event.type === "complete") {
                const data = event.data;
                
                // Extract Vivid Seats price if available
                if (data.vividSeats?.getInPrice) {
                  setVividSeatsPrice(data.vividSeats.getInPrice);
                  setVividSeatsUrl(data.vividSeats.url);
                }

                if (data.success && data.scraped) {
                  const sc = data.scraped;
                  
                  if (sc.artistName) {
                    setArtistName(sc.artistName);
                  }
                  if (sc.eventName) {
                    setEventName(sc.eventName);
                  }
                  if (sc.venue) {
                    const venueParts = [sc.venue];
                    if (sc.venueCity) venueParts.push(sc.venueCity);
                    if (sc.venueState) venueParts.push(sc.venueState);
                    setVenue(venueParts.join(", "));
                  }
                  if (sc.date) {
                    let dateStr = sc.date;
                    if (sc.time) {
                      dateStr += ` at ${sc.time}`;
                    }
                    setEventDateRaw(dateStr);
                  }

                  setSyncStatus("success");
                  let msg = data.source === "database" 
                    ? "Event information loaded from database!"
                    : "Event information synced from Ticketmaster!";
                  if (data.vividSeats?.getInPrice) {
                    msg += ` Get-in price: $${data.vividSeats.getInPrice}`;
                  }
                  setSyncMessage(msg);
                } else {
                  setSyncStatus("error");
                  setSyncMessage("Could not find matching event");
                }
              } else if (event.type === "error") {
                setSyncStatus("error");
                setSyncMessage(event.error || "Sync failed");
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      setSyncStatus("error");
      setSyncMessage(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`/api/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistName: artistName || null,
          eventName,
          venue: venue || null,
          eventDateRaw: eventDateRaw || null,
          getInPriceUrl: getInPriceUrl || null,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Event Updated",
          description: `Updated "${artistName || eventName}"`,
        });
        setOpen(false);
        onUpdate();
      } else {
        toast({
          title: "Update Failed",
          description: data.error || "Unknown error",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Update Failed",
        description: "Failed to update event",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete event "${artistName || eventName}"? This will also delete associated queue positions.`)) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/events/${event.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Event Deleted",
          description: `Deleted "${data.deletedEventName}"`,
        });
        setOpen(false);
        onUpdate();
      } else {
        toast({
          title: "Delete Failed",
          description: data.error || "Unknown error",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Delete Failed",
        description: "Failed to delete event",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
            <DialogDescription>
              Update event details, sync from Ticketmaster, or view venue zones.
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="details" className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Event Details</TabsTrigger>
              <TabsTrigger value="zones" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Venue & Zones
                {zoneSectionsData?.zones?.length ? (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/10 rounded">
                    {zoneSectionsData.zones.length}
                  </span>
                ) : null}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4 py-4">
              {/* Event ID (read-only) with Sync Button */}
              <div className="grid gap-2">
                <Label>Event ID</Label>
                <div className="flex gap-2">
                  <Input
                    value={event.tmEventId}
                    readOnly
                    className="font-mono bg-muted"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSync}
                    disabled={syncing}
                    title="Sync event details from Ticketmaster"
                  >
                    {syncing ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    <span className="ml-2">Sync Info</span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Click "Sync Info" to load event details from checkout data. For new events without checkout history, enter details manually.
                </p>
              </div>

              {/* Live Progress Bar */}
              {syncing && syncProgress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{syncProgress.message}</span>
                    <span className="font-mono text-xs">{syncProgress.percent}%</span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-300 ease-out"
                      style={{ width: `${syncProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Sync Status Alert */}
              {syncStatus !== "idle" && !syncing && (
                <Alert variant={syncStatus === "success" ? "default" : "destructive"}>
                  {syncStatus === "success" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  <AlertDescription>{syncMessage}</AlertDescription>
                </Alert>
              )}

              {/* Vivid Seats Price Display */}
              {vividSeatsPrice && (
                <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Vivid Seats Get-In Price:</span>
                    <span className="text-xl font-bold text-green-600 dark:text-green-400">
                      ${vividSeatsPrice.toFixed(0)}
                    </span>
                  </div>
                  {vividSeatsUrl && (
                    <a
                      href={vividSeatsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      View on Vivid Seats →
                    </a>
                  )}
                </div>
              )}

              {/* Artist Name */}
              <div className="grid gap-2">
                <Label htmlFor="artistName">Artist Name</Label>
                <Input
                  id="artistName"
                  value={artistName}
                  onChange={(e) => setArtistName(e.target.value)}
                  placeholder="e.g., Bruno Mars"
                />
              </div>

              {/* Event/Tour Name */}
              <div className="grid gap-2">
                <Label htmlFor="eventName">Event/Tour Name</Label>
                <Input
                  id="eventName"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="e.g., The Romantic Tour"
                />
              </div>

              {/* Venue */}
              <div className="grid gap-2">
                <Label htmlFor="venue">Venue</Label>
                <Input
                  id="venue"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder="e.g., SoFi Stadium, Los Angeles, CA"
                />
              </div>

              {/* Date */}
              <div className="grid gap-2">
                <Label htmlFor="eventDateRaw">Date</Label>
                <Input
                  id="eventDateRaw"
                  value={eventDateRaw}
                  onChange={(e) => setEventDateRaw(e.target.value)}
                  placeholder="e.g., October 7, 2026 at 7:00 PM"
                />
                <p className="text-xs text-muted-foreground">
                  Day of week is automatically derived from the date.
                </p>
              </div>

              {/* Vivid Seats URL */}
              <div className="grid gap-2">
                <Label htmlFor="getInPriceUrl">Vivid Seats URL</Label>
                <Input
                  id="getInPriceUrl"
                  value={getInPriceUrl}
                  onChange={(e) => setGetInPriceUrl(e.target.value)}
                  placeholder="e.g., https://www.vividseats.com/..."
                />
                <p className="text-xs text-muted-foreground">
                  Used when syncing prices. If blank, will search for the event automatically.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="zones" className="space-y-4 py-4">
              {/* Venue Map and Zones */}
              {loadingZones ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">Loading zones...</span>
                </div>
              ) : zoneSectionsData ? (
                <>
                  {/* Venue Map */}
                  <VenueMap
                    venueName={zoneSectionsData.venueName || venue}
                    staticMapUrl={zoneSectionsData.staticMapUrl}
                    zones={zoneSectionsData.zones.map((z) => ({
                      zoneName: z.zoneName,
                      colorHex: z.colorHex,
                      sections: z.sections,
                      minPrice: z.minPrice,
                    }))}
                    selectedZones={selectedZones}
                    onZoneSelect={(zoneName) => {
                      if (selectedZones.includes(zoneName)) {
                        setSelectedZones(selectedZones.filter((z) => z !== zoneName));
                      } else {
                        setSelectedZones([...selectedZones, zoneName]);
                      }
                    }}
                    showPrices={true}
                    loading={refreshingZones}
                    onRefresh={handleRefreshZones}
                  />

                  {/* Zone Filter Panel */}
                  {zoneSectionsData.zones.length > 0 && (
                    <ZoneFilterPanel
                      zones={zoneSectionsData.zones.map((z) => ({
                        zoneName: z.zoneName,
                        colorHex: z.colorHex,
                        minPrice: z.minPrice,
                        sectionCount: z.sections.length,
                      }))}
                      selectedZones={selectedZones}
                      onSelectionChange={setSelectedZones}
                      showPrices={true}
                      title="Select Zones for Price Comparison"
                      collapsible={true}
                      defaultExpanded={false}
                    />
                  )}

                  {/* Data Source Info */}
                  <div className="text-xs text-muted-foreground text-center">
                    Data source: {zoneSectionsData.source === "venue_map" ? "Cached venue map" : "Event zone prices"}
                  </div>
                </>
              ) : (
                <div className="text-center py-8 space-y-4">
                  <MapPin className="h-12 w-12 mx-auto text-muted-foreground/30" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      No zone data available for this venue.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {getInPriceUrl || event.getInPriceUrl
                        ? "Click refresh to fetch zones from Vivid Seats"
                        : "Add a Vivid Seats URL in Event Details first"}
                    </p>
                  </div>
                  {(getInPriceUrl || event.getInPriceUrl) && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRefreshZones}
                      disabled={refreshingZones}
                    >
                      {refreshingZones ? (
                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Fetch Zones
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
          
          <DialogFooter className="gap-2 mt-4">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={loading}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
            <div className="flex-1" />
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
