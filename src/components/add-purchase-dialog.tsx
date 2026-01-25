"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface Account {
  id: string;
  email: string;
}

interface Event {
  id: string;
  name: string;
  eventDate: string | null;
  venue: string | null;
}

interface Card {
  id: string;
  profileName: string;
  cardType: string;
  last4: string;
}

interface AddPurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function AddPurchaseDialog({
  open,
  onOpenChange,
  onCreated,
}: AddPurchaseDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [cards, setCards] = useState<Card[]>([]);

  // Form state
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [selectedCardId, setSelectedCardId] = useState<string>("");
  const [status, setStatus] = useState<string>("SUCCESS");
  const [quantity, setQuantity] = useState<string>("1");
  const [totalPrice, setTotalPrice] = useState<string>("");
  const [section, setSection] = useState<string>("");
  const [row, setRow] = useState<string>("");
  const [seats, setSeats] = useState<string>("");
  const [confirmationUrl, setConfirmationUrl] = useState<string>("");

  // Search filters
  const [accountSearch, setAccountSearch] = useState("");
  const [eventSearch, setEventSearch] = useState("");

  const { toast } = useToast();

  // Fetch data when dialog opens
  useEffect(() => {
    if (open) {
      fetchData();
      // Reset form
      setSelectedAccountId("");
      setSelectedEventId("");
      setSelectedCardId("");
      setStatus("SUCCESS");
      setQuantity("1");
      setTotalPrice("");
      setSection("");
      setRow("");
      setSeats("");
      setConfirmationUrl("");
      setAccountSearch("");
      setEventSearch("");
    }
  }, [open]);

  // Fetch cards when account changes
  useEffect(() => {
    if (selectedAccountId) {
      fetchCardsForAccount(selectedAccountId);
    } else {
      setCards([]);
      setSelectedCardId("");
    }
  }, [selectedAccountId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch accounts and events in parallel
      const [accountsRes, eventsRes] = await Promise.all([
        fetch("/api/accounts?limit=1000"),
        fetch("/api/events?limit=1000"),
      ]);

      const accountsData = await accountsRes.json();
      const eventsData = await eventsRes.json();

      setAccounts(
        accountsData.accounts?.map((a: { id: string; email: string }) => ({
          id: a.id,
          email: a.email,
        })) || []
      );

      setEvents(
        eventsData.events?.map((e: { id: string; eventName: string; artistName: string | null; eventDateRaw: string | null; venue: string | null }) => ({
          id: e.id,
          name: e.artistName || e.eventName,
          eventDate: e.eventDateRaw,
          venue: e.venue,
        })) || []
      );
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast({
        title: "Error",
        description: "Failed to load data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCardsForAccount = async (accountId: string) => {
    try {
      // Fetch cards linked to this account
      const res = await fetch(`/api/cards?linked=true&search=&limit=1000`);
      const data = await res.json();

      // Filter cards that belong to this account
      const accountCards = data.cards?.filter((c: { account?: { id: string } }) => c.account?.id === accountId) || [];

      setCards(
        accountCards.map((c: { id: string; profileName: string; cardType: string; cardNumber: string }) => ({
          id: c.id,
          profileName: c.profileName,
          cardType: c.cardType,
          last4: c.cardNumber.slice(-4),
        }))
      );
    } catch (error) {
      console.error("Failed to fetch cards:", error);
    }
  };

  const handleSubmit = async () => {
    if (!selectedAccountId) {
      toast({
        title: "Validation Error",
        description: "Please select an account",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccountId,
          eventId: selectedEventId || null,
          cardId: selectedCardId || null,
          status,
          quantity: parseInt(quantity) || 1,
          totalPrice: totalPrice ? parseFloat(totalPrice) : null,
          section: section || null,
          row: row || null,
          seats: seats || null,
          confirmationUrl: confirmationUrl || null,
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Purchase Created",
        description: `Added purchase for ${data.purchase.account}`,
      });

      onCreated?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Error",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Filter accounts by search
  const filteredAccounts = useMemo(() => {
    if (!accountSearch) return accounts.slice(0, 100); // Show first 100 if no search
    const searchLower = accountSearch.toLowerCase();
    return accounts.filter(a => a.email.toLowerCase().includes(searchLower)).slice(0, 100);
  }, [accounts, accountSearch]);

  // Filter events by search
  const filteredEvents = useMemo(() => {
    if (!eventSearch) return events.slice(0, 100); // Show first 100 if no search
    const searchLower = eventSearch.toLowerCase();
    return events.filter(e => 
      e.name.toLowerCase().includes(searchLower) || 
      (e.venue && e.venue.toLowerCase().includes(searchLower))
    ).slice(0, 100);
  }, [events, eventSearch]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Manual Purchase
          </DialogTitle>
          <DialogDescription>
            Create a new purchase record manually
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Account Selection (Required) */}
            <div className="space-y-2">
              <Label>Account *</Label>
              <Input
                placeholder="Search accounts..."
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                className="mb-2"
              />
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {filteredAccounts.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">No accounts found</div>
                  ) : (
                    filteredAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.email}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {accounts.length > 100 && !accountSearch && (
                <p className="text-xs text-muted-foreground">Showing first 100 accounts. Use search to find more.</p>
              )}
            </div>

            {/* Event Selection (Optional) */}
            <div className="space-y-2">
              <Label>Event</Label>
              <Input
                placeholder="Search events..."
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                className="mb-2"
              />
              <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select event..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="none">No event</SelectItem>
                  {filteredEvents.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.name} {event.venue ? `- ${event.venue}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {events.length > 100 && !eventSearch && (
                <p className="text-xs text-muted-foreground">Showing first 100 events. Use search to find more.</p>
              )}
            </div>

            {/* Card Selection (Optional, filtered by account) */}
            <div className="space-y-2">
              <Label>Card Profile</Label>
              <Select 
                value={selectedCardId} 
                onValueChange={setSelectedCardId}
                disabled={!selectedAccountId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={selectedAccountId ? "Select card..." : "Select account first"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No card</SelectItem>
                  {cards.map((card) => (
                    <SelectItem key={card.id} value={card.id}>
                      {card.profileName} ({card.cardType} ****{card.last4})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedAccountId && cards.length === 0 && (
                <p className="text-xs text-muted-foreground">No cards linked to this account.</p>
              )}
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label>Status *</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUCCESS">Success</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                  <SelectItem value="NEEDS_REVIEW">Needs Review</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Quantity and Total Price */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="1"
                />
              </div>
              <div className="space-y-2">
                <Label>Total Price ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalPrice}
                  onChange={(e) => setTotalPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Section, Row, Seats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Section</Label>
                <Input
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  placeholder="e.g., 101"
                />
              </div>
              <div className="space-y-2">
                <Label>Row</Label>
                <Input
                  value={row}
                  onChange={(e) => setRow(e.target.value)}
                  placeholder="e.g., A"
                />
              </div>
              <div className="space-y-2">
                <Label>Seats</Label>
                <Input
                  value={seats}
                  onChange={(e) => setSeats(e.target.value)}
                  placeholder="e.g., 1-4"
                />
              </div>
            </div>

            {/* Confirmation URL */}
            <div className="space-y-2">
              <Label>Confirmation URL</Label>
              <Input
                value={confirmationUrl}
                onChange={(e) => setConfirmationUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Purchase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
