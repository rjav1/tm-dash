"use client";

import { useState } from "react";
import { Plus, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AddEventDialogProps {
  onCreated: () => void;
}

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface LookupResult {
  success: boolean;
  source: "database" | "api" | "search" | "scrape";
  ticketmaster?: {
    name: string;
    date: string;
    time?: string;
    venue?: {
      name: string;
      city: string;
      state: string;
    } | null;
  } | null;
  scraped?: {
    eventName: string | null;
    artistName: string | null;
    venue: string | null;
    venueCity: string | null;
    venueState: string | null;
    date: string | null;
    time: string | null;
    dayOfWeek: string | null;
    url: string;
    error?: string;
  } | null;
  vividSeats?: {
    getInPrice: number | null;
    url: string | null;
  } | null;
  searchParams?: {
    artistName: string | null;
    venue: string | null;
    date: string | null;
  };
  error?: string;
}

export function AddEventDialog({ onCreated }: AddEventDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  
  // Form fields
  const [tmEventId, setTmEventId] = useState("");
  const [artistName, setArtistName] = useState("");
  const [eventName, setEventName] = useState("");
  const [venue, setVenue] = useState("");
  const [eventDateRaw, setEventDateRaw] = useState("");
  
  // Sync status
  const [syncStatus, setSyncStatus] = useState<"idle" | "success" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  
  const { toast } = useToast();

  const resetForm = () => {
    setTmEventId("");
    setArtistName("");
    setEventName("");
    setVenue("");
    setEventDateRaw("");
    setSyncStatus("idle");
    setSyncMessage("");
    setLookupResult(null);
  };

  const handleSync = async () => {
    if (!artistName && !tmEventId) {
      toast({
        title: "Missing Information",
        description: "Please enter either an Event ID or Artist Name to sync",
        variant: "destructive",
      });
      return;
    }

    setSyncing(true);
    setSyncStatus("idle");
    setSyncMessage("");

    try {
      const response = await fetch("/api/events/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: tmEventId || undefined,
          artistName: artistName || undefined,
          venue: venue || undefined,
          date: eventDateRaw || undefined,
          includeVividSeats: true,
        }),
      });

      const data: LookupResult = await response.json();
      setLookupResult(data);

      // Check if we got data from scraping (source === "scrape") or from API
      if (data.success && (data.ticketmaster || data.scraped)) {
        // Prefer scraped data if available, fall back to Ticketmaster API data
        if (data.scraped && data.scraped.eventName) {
          // Use scraped data from the TM event page
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
          let msg = "Event information synced from Ticketmaster page!";
          if (data.vividSeats?.getInPrice) {
            msg += ` Get-in price: $${data.vividSeats.getInPrice}`;
          }
          setSyncMessage(msg);
        } else if (data.ticketmaster) {
          // Use Ticketmaster API data
          const tm = data.ticketmaster;
          
          if (tm.name && !artistName) {
            setArtistName(tm.name);
          }
          if (tm.name && !eventName) {
            setEventName(tm.name);
          }
          if (tm.venue?.name && !venue) {
            const venueStr = tm.venue.city && tm.venue.state
              ? `${tm.venue.name}, ${tm.venue.city}, ${tm.venue.state}`
              : tm.venue.name;
            setVenue(venueStr);
          }
          if (tm.date && !eventDateRaw) {
            // Parse date and format nicely
            const dateObj = new Date(tm.date + "T12:00:00");
            
            // Format date as "Month Day, Year"
            const formatted = dateObj.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            });
            if (tm.time) {
              const timeFormatted = new Date(`2000-01-01T${tm.time}`).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              });
              setEventDateRaw(`${formatted} at ${timeFormatted}`);
            } else {
              setEventDateRaw(formatted);
            }
          }

          setSyncStatus("success");
          let msg = "Event information synced from Ticketmaster API!";
          if (data.vividSeats?.getInPrice) {
            msg += ` Get-in price: $${data.vividSeats.getInPrice}`;
          }
          setSyncMessage(msg);
        }
      } else {
        setSyncStatus("error");
        setSyncMessage(data.error || "Could not find matching event");
      }
    } catch (error) {
      setSyncStatus("error");
      setSyncMessage(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!tmEventId) {
      toast({
        title: "Missing Event ID",
        description: "Event ID is required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tmEventId,
          artistName: artistName || null,
          eventName: eventName || tmEventId,
          venue: venue || null,
          eventDateRaw: eventDateRaw || null,
          getInPrice: lookupResult?.vividSeats?.getInPrice || null,
          getInPriceUrl: lookupResult?.vividSeats?.url || null,
          getInPriceSource: lookupResult?.vividSeats?.getInPrice ? "vividseats" : null,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast({
          title: "Event Created",
          description: `Created event "${artistName || eventName || tmEventId}"`,
        });
        resetForm();
        setOpen(false);
        onCreated();
      } else {
        toast({
          title: "Creation Failed",
          description: data.error || "Unknown error",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Creation Failed",
        description: "Failed to create event",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Event
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add New Event</DialogTitle>
            <DialogDescription>
              Enter an event ID and optionally sync information from Ticketmaster.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Event ID with Sync Button */}
            <div className="grid gap-2">
              <Label htmlFor="tmEventId">Event ID *</Label>
              <div className="flex gap-2">
                <Input
                  id="tmEventId"
                  value={tmEventId}
                  onChange={(e) => setTmEventId(e.target.value)}
                  placeholder="e.g., 0A006426C2444B31"
                  className="font-mono"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                The Ticketmaster event ID from Discord webhook or queue form
              </p>
            </div>

            {/* Artist Name */}
            <div className="grid gap-2">
              <Label htmlFor="artistName">Artist Name</Label>
              <div className="flex gap-2">
                <Input
                  id="artistName"
                  value={artistName}
                  onChange={(e) => setArtistName(e.target.value)}
                  placeholder="e.g., Bruno Mars"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSync}
                  disabled={syncing || (!artistName && !tmEventId)}
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
                Enter artist name then click "Sync Info" to auto-fill from Ticketmaster
              </p>
            </div>

            {/* Sync Status Alert */}
            {syncStatus !== "idle" && (
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
            {lookupResult?.vividSeats?.getInPrice && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Vivid Seats Get-In Price:</span>
                  <span className="text-lg font-bold text-green-600">
                    ${lookupResult.vividSeats.getInPrice.toFixed(2)}
                  </span>
                </div>
                {lookupResult.vividSeats.url && (
                  <a
                    href={lookupResult.vividSeats.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View on Vivid Seats
                  </a>
                )}
              </div>
            )}

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
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !tmEventId}>
              {loading ? "Creating..." : "Create Event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
