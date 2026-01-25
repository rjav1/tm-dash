"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, CreditCard, User, Calendar, Link2, Save, Trash2, DollarSign, AlertCircle, RefreshCw, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { SectionMapSelector, type ZoneInfo } from "@/components/section-map-selector";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Helper to format relative time
function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Helper to get freshness color
function getFreshnessColor(isoDate: string): { color: string; label: string } {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  
  if (diffMins < 30) return { color: "bg-green-500", label: "Fresh (< 30 min)" };
  if (diffHours < 6) return { color: "bg-yellow-500", label: "Recent (< 6 hours)" };
  if (diffHours < 24) return { color: "bg-orange-500", label: "Older (< 24 hours)" };
  return { color: "bg-red-500", label: "Stale (> 24 hours)" };
}

// Data freshness indicator dot
function DataFreshnessDot({ scrapedAt }: { scrapedAt: string }) {
  const { color, label } = getFreshnessColor(scrapedAt);
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`w-2 h-2 rounded-full ${color} inline-block`} />
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(scrapedAt).toLocaleString()}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface CardOption {
  id: string;
  label: string;
  accountEmail: string;
}

interface EventOption {
  id: string;
  label: string;
  tmEventId: string;
  zonePrices?: Array<{ zoneName: string; minPrice: number; colorHex?: string | null; sections?: string[] }>;
  getInPrice?: number | null;
}

interface AccountOption {
  id: string;
  email: string;
  status: string;
}

interface PurchaseDetails {
  id: string;
  externalJobId: string | null;
  status: string;
  quantity: number;
  priceEach: number | null;
  totalPrice: number | null;
  section: string | null;
  row: string | null;
  seats: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  checkoutUrl: string | null;
  confirmationUrl: string | null;
  createdAt: string;
  completedAt: string | null;
  attemptCount: number;
  // Price override fields
  priceOverrideType: string | null;
  priceOverrideZone: string | null;
  priceOverrideValue: number | null;
  account: { id: string; email: string };
  event: { id: string; eventName: string; tmEventId: string; getInPrice?: number | null; zonePrices?: Array<{ zoneName: string; minPrice: number }> } | null;
  card: { id: string; cardType: string; cardNumber: string; billingName: string } | null;
}

interface PurchaseEditDialogProps {
  purchaseId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function PurchaseEditDialog({
  purchaseId,
  open,
  onOpenChange,
  onSaved,
}: PurchaseEditDialogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [purchase, setPurchase] = useState<PurchaseDetails | null>(null);
  const [availableCards, setAvailableCards] = useState<CardOption[]>([]);
  const [availableEvents, setAvailableEvents] = useState<EventOption[]>([]);
  const [availableAccounts, setAvailableAccounts] = useState<AccountOption[]>([]);
  
  // Form state
  const [selectedCardId, setSelectedCardId] = useState<string>("");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [priceEach, setPriceEach] = useState<string>("");
  const [totalPrice, setTotalPrice] = useState<string>("");
  const [section, setSection] = useState<string>("");
  const [row, setRow] = useState<string>("");
  const [seats, setSeats] = useState<string>("");
  
  // Price override state
  const [priceOverrideType, setPriceOverrideType] = useState<string>("auto");
  const [priceOverrideZone, setPriceOverrideZone] = useState<string>("");
  const [priceOverrideValue, setPriceOverrideValue] = useState<string>("");
  
  // Zone price fetching state
  const [loadingZonePrice, setLoadingZonePrice] = useState(false);
  const [fetchedZonePrice, setFetchedZonePrice] = useState<number | null>(null);
  const [zonePriceError, setZonePriceError] = useState<string | null>(null);
  const [zonePriceSource, setZonePriceSource] = useState<string | null>(null);
  const [eventZonePrices, setEventZonePrices] = useState<Array<{ zoneName: string; minPrice: number; colorHex?: string | null; sections?: string[] }>>([]);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  
  // Section map selector state
  const [sectionMapOpen, setSectionMapOpen] = useState(false);
  const [venueMapUrl, setVenueMapUrl] = useState<string | null>(null);
  const [venueName, setVenueName] = useState<string>("");
  const [zonePricesScrapedAt, setZonePricesScrapedAt] = useState<string | null>(null);
  const [syncingEvent, setSyncingEvent] = useState(false);
  
  const { toast } = useToast();

  // Fetch zone sections data for an event
  const fetchZoneSections = useCallback(async (eventId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/zone-sections`);
      const data = await response.json();
      
      if (data.success && data.zones) {
        setEventZonePrices(data.zones.map((z: { zoneName: string; minPrice: number | null; colorHex: string | null; sections: string[] }) => ({
          zoneName: z.zoneName,
          minPrice: z.minPrice || 0,
          colorHex: z.colorHex,
          sections: z.sections || []
        })));
        
        // Store venue map info for section selector
        if (data.staticMapUrl) {
          setVenueMapUrl(data.staticMapUrl);
        }
        if (data.venueName) {
          setVenueName(data.venueName);
        }
        // Store the scraped timestamp for freshness indicator
        if (data.scrapedAt) {
          setZonePricesScrapedAt(data.scrapedAt);
        }
      }
    } catch (error) {
      console.error("Failed to fetch zone sections:", error);
    }
  }, []);
  
  // Sync event data (zone prices and sections)
  const syncEventData = useCallback(async (eventId: string) => {
    if (!eventId || eventId === "none") return;
    
    setSyncingEvent(true);
    try {
      const response = await fetch(`/api/events/${eventId}/sync-prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRefresh: true }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to sync event");
      }
      
      toast({
        title: "Event synced",
        description: `Loaded ${data.zoneCount || 0} zones with section data`,
      });
      
      // Refresh zone sections data
      await fetchZoneSections(eventId);
      
    } catch (error) {
      toast({
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Failed to sync event",
        variant: "destructive",
      });
    } finally {
      setSyncingEvent(false);
    }
  }, [toast, fetchZoneSections]);
  
  // Fetch zone price when zone is selected
  const fetchZonePrice = useCallback(async (eventId: string, zoneName: string, forceRefresh = false) => {
    if (!eventId || eventId === "none" || !zoneName) return;
    
    setLoadingZonePrice(true);
    setZonePriceError(null);
    
    try {
      const response = await fetch(`/api/events/${eventId}/zone-price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zoneName, forceRefresh }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch zone price");
      }
      
      if (data.minPrice !== null) {
        setFetchedZonePrice(data.minPrice);
        setZonePriceSource(data.source);
        
        // Update local zone prices if we got new data
        if (data.allZones && data.allZones.length > 0) {
          setEventZonePrices(data.allZones);
        }
      } else {
        setFetchedZonePrice(null);
        setZonePriceError(data.message || `Zone "${zoneName}" not available`);
      }
    } catch (error) {
      setZonePriceError(error instanceof Error ? error.message : "Failed to fetch zone price");
      setFetchedZonePrice(null);
    } finally {
      setLoadingZonePrice(false);
    }
  }, []);

  // Trigger zone price fetch when zone selection changes
  useEffect(() => {
    if (priceOverrideType === "zone" && priceOverrideZone && selectedEventId && selectedEventId !== "none") {
      // Clear previous state
      setFetchedZonePrice(null);
      setZonePriceError(null);
      
      // Debounce the API call
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      
      debounceRef.current = setTimeout(() => {
        fetchZonePrice(selectedEventId, priceOverrideZone);
      }, 300);
    }
    
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [priceOverrideType, priceOverrideZone, selectedEventId, fetchZonePrice]);

  useEffect(() => {
    if (open && purchaseId) {
      fetchPurchase();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, purchaseId]);

  // Fetch zone sections when event changes
  useEffect(() => {
    if (selectedEventId && selectedEventId !== "none") {
      fetchZoneSections(selectedEventId);
    }
  }, [selectedEventId, fetchZoneSections]);

  // Auto-calculate priceEach when totalPrice or quantity changes
  useEffect(() => {
    if (totalPrice && quantity > 0) {
      const total = parseFloat(totalPrice);
      if (!isNaN(total)) {
        const unitCost = total / quantity;
        setPriceEach(unitCost.toFixed(2));
      }
    } else {
      setPriceEach("");
    }
  }, [totalPrice, quantity]);

  const fetchPurchase = async () => {
    if (!purchaseId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/purchases/${purchaseId}`);
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setPurchase(data.purchase);
      setAvailableCards(data.availableCards);
      setAvailableEvents(data.availableEvents);
      setAvailableAccounts(data.availableAccounts);
      
      // Set form state
      setSelectedCardId(data.purchase.card?.id || "none");
      setSelectedEventId(data.purchase.event?.id || "none");
      setSelectedAccountId(data.purchase.account.id);
      setStatus(data.purchase.status);
      setQuantity(data.purchase.quantity);
      setPriceEach(data.purchase.priceEach?.toString() || "");
      setTotalPrice(data.purchase.totalPrice?.toString() || "");
      setSection(data.purchase.section || "");
      setRow(data.purchase.row || "");
      setSeats(data.purchase.seats || "");
      
      // Set price override state
      const overrideType = data.purchase.priceOverrideType || "auto";
      setPriceOverrideType(overrideType);
      
      // Handle sections stored as comma-separated
      if (overrideType === "section" && data.purchase.priceOverrideZone) {
        setSelectedSections(data.purchase.priceOverrideZone.split(",").filter(Boolean));
        setPriceOverrideZone("");
      } else {
        setPriceOverrideZone(data.purchase.priceOverrideZone || "");
        setSelectedSections([]);
      }
      
      setPriceOverrideValue(data.purchase.priceOverrideValue?.toString() || "");
      
      // Set initial zone prices from event (without sections)
      if (data.purchase.event?.zonePrices) {
        setEventZonePrices(data.purchase.event.zonePrices);
      }
      
      // Explicitly fetch zone sections with full section data
      // This ensures we get the latest data even if selectedEventId didn't change
      if (data.purchase.event?.id) {
        fetchZoneSections(data.purchase.event.id);
      }
      
      // Reset zone price fetch state
      setFetchedZonePrice(null);
      setZonePriceError(null);
      setZonePriceSource(null);
    } catch (error) {
      toast({
        title: "Failed to load purchase",
        description: String(error),
        variant: "destructive",
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!purchaseId) return;
    
    setSaving(true);
    try {
      const response = await fetch(`/api/purchases/${purchaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: selectedCardId === "none" ? null : selectedCardId,
          eventId: selectedEventId === "none" ? null : selectedEventId,
          accountId: selectedAccountId,
          status,
          quantity,
          priceEach: priceEach ? parseFloat(priceEach) : null,
          totalPrice: totalPrice ? parseFloat(totalPrice) : null,
          section: section || null,
          row: row || null,
          seats: seats || null,
          // Price override fields
          priceOverrideType: priceOverrideType === "auto" ? null : priceOverrideType,
          priceOverrideZone: priceOverrideType === "zone" ? priceOverrideZone : 
                             priceOverrideType === "section" ? selectedSections.join(",") : null,
          priceOverrideValue: priceOverrideType === "manual" && priceOverrideValue 
            ? parseFloat(priceOverrideValue) 
            : null,
        }),
      });
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      toast({
        title: "Purchase updated",
        description: "Changes saved successfully",
      });
      
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Failed to save",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!purchaseId || !confirm("Are you sure you want to delete this purchase?")) return;
    
    setSaving(true);
    try {
      const response = await fetch(`/api/purchases/${purchaseId}`, {
        method: "DELETE",
      });
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      toast({
        title: "Purchase deleted",
      });
      
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Failed to delete",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit Purchase
            {purchase && (
              <Badge variant={status === "SUCCESS" ? "success" : "destructive"}>
                {status}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {purchase?.externalJobId && `Job #${purchase.externalJobId} • `}
            {purchase && formatDateTime(purchase.createdAt)}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : purchase ? (
          <div className="space-y-6">
            {/* Link Section */}
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Linked Records
              </h4>
              
              {/* Account */}
              <div className="grid gap-2">
                <Label className="flex items-center gap-2">
                  <User className="h-3 w-3" />
                  Account
                </Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Card */}
              <div className="grid gap-2">
                <Label className="flex items-center gap-2">
                  <CreditCard className="h-3 w-3" />
                  Card
                </Label>
                <Select value={selectedCardId} onValueChange={setSelectedCardId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select card..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No card linked</SelectItem>
                    {availableCards.map((card) => (
                      <SelectItem key={card.id} value={card.id}>
                        {card.label} ({card.accountEmail})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Event */}
              <div className="grid gap-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  Event
                </Label>
                <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select event..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No event linked</SelectItem>
                    {availableEvents.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        {event.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status */}
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUCCESS">SUCCESS</SelectItem>
                  <SelectItem value="FAILED">FAILED</SelectItem>
                  <SelectItem value="NEEDS_REVIEW">NEEDS_REVIEW</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Ticket Details */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  min={1}
                />
              </div>
              <div className="grid gap-2">
                <Label>Price Each (with fees, auto-calculated)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={priceEach}
                  readOnly
                  disabled
                  placeholder="Calculated from Total / Quantity"
                  className="bg-muted"
                />
              </div>
              <div className="grid gap-2">
                <Label>Total Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={totalPrice}
                  onChange={(e) => setTotalPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Seat Details */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label>Section</Label>
                <Input
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  placeholder="e.g., N110"
                />
              </div>
              <div className="grid gap-2">
                <Label>Row</Label>
                <Input
                  value={row}
                  onChange={(e) => setRow(e.target.value)}
                  placeholder="e.g., 23"
                />
              </div>
              <div className="grid gap-2">
                <Label>Seats</Label>
                <Input
                  value={seats}
                  onChange={(e) => setSeats(e.target.value)}
                  placeholder="e.g., 1-2"
                />
              </div>
            </div>

            {/* Price Comparison Override */}
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Price Comparison
              </h4>
              
              <div className="grid gap-2">
                <Label>Comparison Price Source</Label>
                <Select value={priceOverrideType} onValueChange={setPriceOverrideType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (Zone Match)</SelectItem>
                    <SelectItem value="get_in">Use Get-In Price</SelectItem>
                    <SelectItem value="zone">Select Specific Zone</SelectItem>
                    <SelectItem value="section">Select Specific Section(s)</SelectItem>
                    <SelectItem value="manual">Manual Price</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {priceOverrideType === "auto" && "Automatically matches your section to a zone price, falls back to get-in price"}
                  {priceOverrideType === "get_in" && "Uses the overall get-in (cheapest) price for the event"}
                  {priceOverrideType === "zone" && "Select a specific zone to compare against"}
                  {priceOverrideType === "section" && "Select specific section(s) - will use the lowest price from selected sections"}
                  {priceOverrideType === "manual" && "Enter a custom price for comparison"}
                </p>
              </div>
              
              {/* Zone selector - only show when zone type selected */}
              {priceOverrideType === "zone" && (
                <div className="space-y-3">
                  <div className="grid gap-2">
                    <Label>Zone</Label>
                    <div className="flex gap-2">
                      <Select value={priceOverrideZone} onValueChange={setPriceOverrideZone}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select zone..." />
                        </SelectTrigger>
                        <SelectContent>
                          {eventZonePrices.length > 0 ? (
                            eventZonePrices.map((zp) => (
                              <SelectItem key={zp.zoneName} value={zp.zoneName}>
                                {zp.zoneName} - ${zp.minPrice}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="" disabled>
                              No zones available - sync event prices first
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      {priceOverrideZone && selectedEventId && selectedEventId !== "none" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => fetchZonePrice(selectedEventId, priceOverrideZone, true)}
                          disabled={loadingZonePrice}
                          title="Refresh zone price"
                        >
                          {loadingZonePrice ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {/* Zone price result display */}
                  {priceOverrideZone && (
                    <div className="flex items-center gap-2">
                      {loadingZonePrice ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Fetching price for {priceOverrideZone}...</span>
                        </div>
                      ) : zonePriceError ? (
                        <div className="flex items-center gap-2 text-sm text-destructive">
                          <AlertCircle className="h-4 w-4" />
                          <span>{zonePriceError}</span>
                        </div>
                      ) : fetchedZonePrice !== null ? (
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-green-600">
                            ${fetchedZonePrice.toFixed(0)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            ({zonePriceSource === "cached" ? "cached" : "just scraped"})
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
              
              {/* Section selector - only show when section type selected */}
              {priceOverrideType === "section" && (
                <div className="space-y-3">
                  <div className="grid gap-2">
                    <Label>Select Sections</Label>
                    {eventZonePrices.some(zp => zp.sections && zp.sections.length > 0) ? (
                      <div className="space-y-3">
                        {/* Data freshness indicator and sync button */}
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            {zonePricesScrapedAt && (
                              <>
                                <DataFreshnessDot scrapedAt={zonePricesScrapedAt} />
                                <span className="text-muted-foreground">
                                  Data from {formatRelativeTime(zonePricesScrapedAt)}
                                </span>
                              </>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => selectedEventId && syncEventData(selectedEventId)}
                            disabled={syncingEvent}
                            className="h-6 px-2 text-xs"
                          >
                            {syncingEvent ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Refresh
                              </>
                            )}
                          </Button>
                        </div>
                        
                        {/* Open map selector button */}
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full justify-start gap-2"
                          onClick={() => setSectionMapOpen(true)}
                        >
                          <MapPin className="h-4 w-4" />
                          Open Section Map Selector
                          {selectedSections.length > 0 && (
                            <Badge variant="secondary" className="ml-auto">
                              {selectedSections.length} selected
                            </Badge>
                          )}
                        </Button>
                        
                        {/* Show selected sections */}
                        {selectedSections.length > 0 && (
                          <div className="border rounded-md p-2 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Selected Sections:</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedSections([])}
                              >
                                Clear All
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                              {selectedSections.map((sec) => (
                                <Badge
                                  key={sec}
                                  variant="secondary"
                                  className="cursor-pointer text-xs hover:bg-destructive hover:text-destructive-foreground"
                                  onClick={() => setSelectedSections(selectedSections.filter(s => s !== sec))}
                                >
                                  {sec} ×
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="border rounded-md p-4 space-y-3 bg-muted/30">
                        <p className="text-sm text-muted-foreground">
                          No section data available for this event.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => selectedEventId && syncEventData(selectedEventId)}
                          disabled={syncingEvent || !selectedEventId}
                          className="w-full"
                        >
                          {syncingEvent ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Syncing Event Data...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Sync Event to Load Sections
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Manual price input - only show when manual type selected */}
              {priceOverrideType === "manual" && (
                <div className="grid gap-2">
                  <Label>Manual Comparison Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={priceOverrideValue}
                    onChange={(e) => setPriceOverrideValue(e.target.value)}
                    placeholder="e.g., 250.00"
                  />
                </div>
              )}
              
              {/* Show current zone prices if available */}
              {eventZonePrices.length > 0 && (
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">Available zone prices:</p>
                  <div className="flex flex-wrap gap-2">
                    {eventZonePrices.map((zp) => (
                      <Badge 
                        key={zp.zoneName} 
                        variant={priceOverrideType === "zone" && priceOverrideZone === zp.zoneName ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => {
                          if (priceOverrideType !== "zone") {
                            setPriceOverrideType("zone");
                          }
                          setPriceOverrideZone(zp.zoneName);
                        }}
                      >
                        {zp.zoneName}: ${zp.minPrice}
                      </Badge>
                    ))}
                  </div>
                  {purchase.event?.getInPrice && (
                    <p className="text-muted-foreground mt-1">
                      Get-in price: ${purchase.event.getInPrice}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Error Info (read-only for reference) */}
            {purchase.errorCode && purchase.errorCode !== "NONE" && (
              <div className="p-3 bg-destructive/10 rounded-lg">
                <Label className="text-destructive">Error Info</Label>
                <p className="text-sm font-mono mt-1">{purchase.errorCode}</p>
                {purchase.errorMessage && (
                  <p className="text-sm text-muted-foreground mt-1">{purchase.errorMessage}</p>
                )}
              </div>
            )}

            {/* URLs */}
            {(purchase.checkoutUrl || purchase.confirmationUrl) && (
              <div className="space-y-2 text-sm">
                {purchase.confirmationUrl && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground">Confirmation:</span>
                    <a 
                      href={purchase.confirmationUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline truncate"
                    >
                      {purchase.confirmationUrl}
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Purchase not found
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={saving || loading}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
      
      {/* Section Map Selector Modal */}
      <SectionMapSelector
        open={sectionMapOpen}
        onOpenChange={setSectionMapOpen}
        zones={eventZonePrices.map(zp => ({
          zoneName: zp.zoneName,
          colorHex: zp.colorHex || null,
          minPrice: zp.minPrice,
          sections: zp.sections || [],
        })) as ZoneInfo[]}
        staticMapUrl={venueMapUrl}
        venueName={venueName || "Venue"}
        selectedSections={selectedSections}
        onSelectionChange={setSelectedSections}
      />
    </Dialog>
  );
}
