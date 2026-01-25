"use client";

import { useState, useEffect } from "react";
import { Loader2, CreditCard, User, Link2, Unlink, Save, Trash2, ShoppingCart } from "lucide-react";
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
import { formatCurrency } from "@/lib/utils";

interface AccountOption {
  id: string;
  email: string;
  status: string;
}

interface PurchaseInfo {
  id: string;
  externalJobId: string | null;
  status: string;
  totalPrice: number | null;
  event: { id: string; eventName: string; artistName: string | null } | null;
  createdAt: string;
}

interface CardDetails {
  id: string;
  profileName: string;
  cardType: string;
  cardNumber: string;
  expMonth: string;
  expYear: string;
  cvv: string;
  billingName: string;
  billingPhone: string | null;
  billingAddress: string;
  billingZip: string;
  billingCity: string;
  billingState: string;
  account: { id: string; email: string; status: string } | null;
  purchases: PurchaseInfo[];
  isLinked: boolean;
}

interface CardEditDialogProps {
  cardId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function CardEditDialog({
  cardId,
  open,
  onOpenChange,
  onSaved,
}: CardEditDialogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [card, setCard] = useState<CardDetails | null>(null);
  const [availableAccounts, setAvailableAccounts] = useState<AccountOption[]>([]);

  // Form state
  const [profileName, setProfileName] = useState("");
  const [cardType, setCardType] = useState("");
  const [billingName, setBillingName] = useState("");
  const [billingPhone, setBillingPhone] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [billingZip, setBillingZip] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingState, setBillingState] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  const { toast } = useToast();

  useEffect(() => {
    if (open && cardId) {
      fetchCard();
    }
  }, [open, cardId]);

  const fetchCard = async () => {
    if (!cardId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/cards/${cardId}`);
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setCard(data.card);
      setAvailableAccounts(data.availableAccounts);

      // Set form state
      setProfileName(data.card.profileName);
      setCardType(data.card.cardType);
      setBillingName(data.card.billingName);
      setBillingPhone(data.card.billingPhone || "");
      setBillingAddress(data.card.billingAddress);
      setBillingZip(data.card.billingZip);
      setBillingCity(data.card.billingCity);
      setBillingState(data.card.billingState);
      setSelectedAccountId(data.card.account?.id || "none");
    } catch (error) {
      toast({
        title: "Failed to load card",
        description: String(error),
        variant: "destructive",
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!cardId) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileName,
          cardType,
          billingName,
          billingPhone: billingPhone || null,
          billingAddress,
          billingZip,
          billingCity,
          billingState,
          accountId: selectedAccountId === "none" ? null : selectedAccountId,
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Card updated",
        description: `Updated "${profileName}"`,
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
    if (!cardId || !confirm(`Delete card "${profileName}"? The card will be hidden from the normal view but purchases will remain linked.`)) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/cards/${cardId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Card deleted",
        description: `"${data.deletedProfileName}" has been hidden. ${data.purchasesLinked || 0} purchase(s) remain linked.`,
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
            <CreditCard className="h-5 w-5" />
            Edit Card Profile
            {card && (
              <Badge variant={card.isLinked ? "default" : "secondary"}>
                {card.isLinked ? "Linked" : "Unlinked"}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {card?.cardType} ****{card?.cardNumber.slice(-4)}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : card ? (
          <div className="space-y-6">
            {/* Account Linking */}
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium flex items-center gap-2">
                {card.isLinked ? <Link2 className="h-4 w-4" /> : <Unlink className="h-4 w-4" />}
                Account Linking
              </h4>

              <div className="grid gap-2">
                <Label className="flex items-center gap-2">
                  <User className="h-3 w-3" />
                  Linked Account
                </Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked (unlinked card)</SelectItem>
                    {availableAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Profile Info */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Profile Name</Label>
                <Input
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="e.g., tm #1"
                />
              </div>
              <div className="grid gap-2">
                <Label>Card Type</Label>
                <Select value={cardType} onValueChange={setCardType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Visa">Visa</SelectItem>
                    <SelectItem value="Mastercard">Mastercard</SelectItem>
                    <SelectItem value="Amex">Amex</SelectItem>
                    <SelectItem value="Discover">Discover</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Billing Info */}
            <div className="space-y-4">
              <h4 className="font-medium">Billing Information</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Billing Name</Label>
                  <Input
                    value={billingName}
                    onChange={(e) => setBillingName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Phone</Label>
                  <Input
                    value={billingPhone}
                    onChange={(e) => setBillingPhone(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Address</Label>
                <Input
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label>City</Label>
                  <Input
                    value={billingCity}
                    onChange={(e) => setBillingCity(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>State</Label>
                  <Input
                    value={billingState}
                    onChange={(e) => setBillingState(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>ZIP</Label>
                  <Input
                    value={billingZip}
                    onChange={(e) => setBillingZip(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Purchases */}
            {card.purchases.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  Recent Purchases ({card.purchases.length})
                </h4>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {card.purchases.map((purchase) => (
                    <div
                      key={purchase.id}
                      className="text-sm p-2 bg-muted rounded flex justify-between items-center"
                    >
                      <span>
                        {purchase.event?.artistName || purchase.event?.eventName || "Unknown event"}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={purchase.status === "SUCCESS" ? "success" : "destructive"}
                          className="text-xs"
                        >
                          {purchase.status}
                        </Badge>
                        {purchase.totalPrice && (
                          <span className="text-muted-foreground">
                            {formatCurrency(purchase.totalPrice)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Card not found
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
