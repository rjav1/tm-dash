"use client";

import { useState, useEffect } from "react";
import { Loader2, User, CreditCard, Save, Trash2, Mail, Key, FileText, Phone, ShoppingCart, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { formatDate, formatCurrency } from "@/lib/utils";

interface CardOption {
  id: string;
  profileName: string;
  cardType: string;
  cardNumber: string;
}

interface PurchaseInfo {
  id: string;
  status: string;
  quantity: number;
  totalPrice: number | null;
  section: string | null;
  row: string | null;
  seats: string | null;
  createdAt: string;
  event: { 
    id: string;
    tmEventId: string;
    eventName: string; 
    artistName: string | null;
    venue: string | null;
    eventDate: string | null;
    eventDateRaw: string | null;
  } | null;
}

interface QueueInfo {
  id: string;
  position: number;
  percentile: number | null;
  totalParticipants: number;
  testedAt: string;
  excluded: boolean;
  event: { 
    id: string;
    tmEventId: string;
    eventName: string; 
    artistName: string | null;
    venue: string | null;
    eventDate: string | null;
    eventDateRaw: string | null;
  };
}

interface AccountDetails {
  id: string;
  email: string;
  password: string | null;
  status: string;
  imapProvider: string | null;
  phoneNumber: string | null;
  notes: string | null;
  createdAt: string;
  cards: {
    id: string;
    profileName: string;
    cardType: string;
    cardNumber: string;
    expMonth: string;
    expYear: string;
    billingName: string;
  }[];
  purchases: PurchaseInfo[];
  queuePositions: QueueInfo[];
}

interface AccountEditDialogProps {
  accountId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const STATUS_OPTIONS = ["ACTIVE", "BANNED", "SUSPENDED", "INACTIVE", "PENDING"];

const statusColors: Record<string, "default" | "success" | "destructive" | "warning" | "secondary"> = {
  ACTIVE: "success",
  BANNED: "destructive",
  SUSPENDED: "warning",
  INACTIVE: "secondary",
  PENDING: "default",
};

export function AccountEditDialog({
  accountId,
  open,
  onOpenChange,
  onSaved,
}: AccountEditDialogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [account, setAccount] = useState<AccountDetails | null>(null);
  const [availableCards, setAvailableCards] = useState<CardOption[]>([]);

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [imapProvider, setImapProvider] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedCardId, setSelectedCardId] = useState<string>("none");

  const { toast } = useToast();

  useEffect(() => {
    if (open && accountId) {
      fetchAccount();
    }
  }, [open, accountId]);

  const fetchAccount = async () => {
    if (!accountId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/accounts/${accountId}`);
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setAccount(data.account);
      setAvailableCards(data.availableCards || []);

      // Set form state
      setEmail(data.account.email);
      setPassword(data.account.password || "");
      setStatus(data.account.status);
      setImapProvider(data.account.imapProvider || "");
      setPhoneNumber(data.account.phoneNumber || "");
      setNotes(data.account.notes || "");
      // Use first linked card if available
      const firstCard = data.account.cards?.[0];
      setSelectedCardId(firstCard?.id || "none");
    } catch (error) {
      toast({
        title: "Failed to load account",
        description: String(error),
        variant: "destructive",
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!accountId) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: password || null,
          status,
          imapProvider: imapProvider || null,
          phoneNumber: phoneNumber || null,
          notes: notes || null,
          cardId: selectedCardId === "none" ? null : selectedCardId,
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Account updated",
        description: `Updated "${email}"`,
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
    if (!accountId || !confirm(`Delete account "${email}"? This will also delete all associated purchases and queue data.`)) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/accounts/${accountId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Account deleted",
        description: `Deleted "${data.deletedEmail}"`,
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Edit Account
            {account && (
              <Badge variant={statusColors[account.status] || "default"}>
                {account.status}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {account?.email}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : account ? (
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Details
              </TabsTrigger>
              <TabsTrigger value="purchases" className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Purchases ({account.purchases.length})
              </TabsTrigger>
              <TabsTrigger value="queues" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Queues ({account.queuePositions.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-6 mt-4">
              {/* Account Info */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label className="flex items-center gap-2">
                    <Mail className="h-3 w-3" />
                    Email
                  </Label>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="flex items-center gap-2">
                    <Key className="h-3 w-3" />
                    Password
                  </Label>
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="(leave blank to keep current)"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          <div className="flex items-center gap-2">
                            <Badge variant={statusColors[s] || "default"} className="text-xs">
                              {s}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>IMAP Provider</Label>
                  <Input
                    value={imapProvider}
                    onChange={(e) => setImapProvider(e.target.value)}
                    placeholder="gmail, outlook, aycd..."
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label className="flex items-center gap-2">
                  <Phone className="h-3 w-3" />
                  Phone Number
                </Label>
                <Input
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+1234567890"
                />
              </div>

              <div className="grid gap-2">
                <Label className="flex items-center gap-2">
                  <FileText className="h-3 w-3" />
                  Notes
                </Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about this account..."
                  rows={3}
                />
              </div>

              {/* Card Linking */}
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Linked Cards {account.cards && account.cards.length > 0 && `(${account.cards.length})`}
                </h4>
                <Select value={selectedCardId} onValueChange={setSelectedCardId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select card..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No card linked</SelectItem>
                    {availableCards.map((card) => (
                      <SelectItem key={card.id} value={card.id}>
                        {card.profileName} - {card.cardType} {card.cardNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {account.cards.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">All Linked Cards:</div>
                    {account.cards.map((card) => (
                      <div key={card.id} className="text-sm text-muted-foreground pl-2 border-l-2 border-muted">
                        {card.profileName} - {card.cardType} {card.cardNumber} - {card.billingName} - Exp {card.expMonth}/{card.expYear}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="purchases" className="mt-4">
              {account.purchases.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No purchases for this account
                </div>
              ) : (
                <div className="max-h-[400px] overflow-y-auto space-y-2">
                  {account.purchases.map((purchase) => (
                    <div
                      key={purchase.id}
                      className="p-3 bg-muted rounded-lg flex justify-between items-center"
                    >
                      <div className="flex-1 min-w-0 mr-2">
                        <div className="font-medium text-sm truncate">
                          {purchase.event?.artistName || purchase.event?.eventName || "Unknown Event"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {purchase.event?.eventDateRaw || (purchase.event?.eventDate ? formatDate(purchase.event.eventDate) : "")}
                          {purchase.event?.venue && ` • ${purchase.event.venue}`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {purchase.section && `Sec ${purchase.section}`}
                          {purchase.row && `, Row ${purchase.row}`}
                          {purchase.seats && `, Seats ${purchase.seats}`}
                          {" - "}{formatDate(purchase.createdAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge
                          variant={purchase.status === "SUCCESS" ? "success" : "destructive"}
                        >
                          {purchase.status}
                        </Badge>
                        {purchase.totalPrice && (
                          <span className="text-sm font-medium">
                            {formatCurrency(Number(purchase.totalPrice))}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="queues" className="mt-4">
              {account.queuePositions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No queue tests for this account
                </div>
              ) : (
                <div className="max-h-[400px] overflow-y-auto space-y-2">
                  {account.queuePositions.map((queue) => (
                    <div
                      key={queue.id}
                      className={`p-3 bg-muted rounded-lg flex justify-between items-center ${queue.excluded ? "opacity-60" : ""}`}
                    >
                      <div className="flex-1 min-w-0 mr-2">
                        <div className="font-medium text-sm truncate flex items-center gap-2">
                          {queue.event.artistName || queue.event.eventName}
                          {queue.excluded && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              Excluded
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {queue.event.eventDateRaw || (queue.event.eventDate ? formatDate(queue.event.eventDate) : "")}
                          {queue.event.venue && ` • ${queue.event.venue}`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Tested: {formatDate(queue.testedAt)}
                          {!queue.excluded && queue.totalParticipants > 0 && (
                            <span className="ml-2">
                              • {queue.totalParticipants.toLocaleString()} total
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className={`text-lg font-mono ${queue.excluded ? "line-through" : ""}`}>
                          #{queue.position.toLocaleString()}
                        </Badge>
                        {!queue.excluded && queue.percentile != null && (
                          <Badge 
                            variant={queue.percentile <= 20 ? "success" : queue.percentile <= 50 ? "default" : "secondary"}
                            className="text-sm"
                          >
                            {queue.percentile}%
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Account not found
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
    </Dialog>
  );
}
