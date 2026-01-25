"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { formatCurrency } from "@/lib/utils";

// Split type options matching TicketVault API
const SPLIT_TYPES = {
  NONE: 0,
  PAIRS: 2,
  AVOID_SINGLES: 3,
  ANY: 4,
} as const;

const SPLIT_TYPE_LABELS: Record<number, string> = {
  [SPLIT_TYPES.NONE]: "None (All or Nothing)",
  [SPLIT_TYPES.PAIRS]: "Pairs (Multiples of 2)",
  [SPLIT_TYPES.AVOID_SINGLES]: "Avoid Singles",
  [SPLIT_TYPES.ANY]: "Any Quantity",
};

// Default split type
const DEFAULT_SPLIT_TYPE = SPLIT_TYPES.PAIRS;
const DEFAULT_LISTING_PRICE = 9999;

interface Purchase {
  id: string;
  tmOrderNumber: string | null;
  section: string | null;
  row: string | null;
  seats: string | null;
  quantity: number;
  priceEach: number;
  totalPrice: number;
  event: {
    eventName: string;
    venue: string | null;
  } | null;
  account: {
    email: string;
  } | null;
}

interface PurchaseExportItem {
  purchaseId: string;
  splitType: number;
  listingPrice: number;
}

interface PosExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchases: Purchase[];
  onConfirm: (items: PurchaseExportItem[]) => Promise<void>;
}

export function PosExportModal({
  open,
  onOpenChange,
  purchases,
  onConfirm,
}: PosExportModalProps) {
  // State for per-purchase settings
  const [exportItems, setExportItems] = useState<
    Map<string, { splitType: number; listingPrice: number }>
  >(new Map());
  const [isExporting, setIsExporting] = useState(false);

  // Initialize export items when purchases change
  useEffect(() => {
    const newItems = new Map<string, { splitType: number; listingPrice: number }>();
    purchases.forEach((p) => {
      newItems.set(p.id, {
        splitType: DEFAULT_SPLIT_TYPE,
        listingPrice: DEFAULT_LISTING_PRICE,
      });
    });
    setExportItems(newItems);
  }, [purchases]);

  // Update split type for a purchase
  const updateSplitType = (purchaseId: string, splitType: number) => {
    setExportItems((prev) => {
      const newItems = new Map(prev);
      const existing = newItems.get(purchaseId) || {
        splitType: DEFAULT_SPLIT_TYPE,
        listingPrice: DEFAULT_LISTING_PRICE,
      };
      newItems.set(purchaseId, { ...existing, splitType });
      return newItems;
    });
  };

  // Update listing price for a purchase
  const updateListingPrice = (purchaseId: string, price: number) => {
    setExportItems((prev) => {
      const newItems = new Map(prev);
      const existing = newItems.get(purchaseId) || {
        splitType: DEFAULT_SPLIT_TYPE,
        listingPrice: DEFAULT_LISTING_PRICE,
      };
      newItems.set(purchaseId, { ...existing, listingPrice: price });
      return newItems;
    });
  };

  // Set all split types at once
  const setAllSplitTypes = (splitType: number) => {
    setExportItems((prev) => {
      const newItems = new Map(prev);
      purchases.forEach((p) => {
        const existing = newItems.get(p.id) || {
          splitType: DEFAULT_SPLIT_TYPE,
          listingPrice: DEFAULT_LISTING_PRICE,
        };
        newItems.set(p.id, { ...existing, splitType });
      });
      return newItems;
    });
  };

  // Handle confirm
  const handleConfirm = async () => {
    setIsExporting(true);
    try {
      const items: PurchaseExportItem[] = [];
      exportItems.forEach((settings, purchaseId) => {
        items.push({
          purchaseId,
          splitType: settings.splitType,
          listingPrice: settings.listingPrice,
        });
      });
      await onConfirm(items);
    } finally {
      setIsExporting(false);
    }
  };

  // Calculate totals
  const totalQuantity = purchases.reduce((sum, p) => sum + p.quantity, 0);
  const totalCost = purchases.reduce((sum, p) => sum + (p.totalPrice || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Export to POS - Review & Confirm</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {/* Bulk Actions */}
          <div className="flex items-center gap-4 mb-4 p-3 bg-muted/50 rounded-lg">
            <span className="text-sm font-medium">Set All Split Types:</span>
            <div className="flex gap-2">
              {Object.entries(SPLIT_TYPE_LABELS).map(([value, label]) => (
                <Button
                  key={value}
                  variant="outline"
                  size="sm"
                  onClick={() => setAllSplitTypes(parseInt(value, 10))}
                >
                  {label.split(" ")[0]}
                </Button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="p-3 bg-muted/50 rounded-lg text-center">
              <div className="text-2xl font-bold">{purchases.length}</div>
              <div className="text-sm text-muted-foreground">Purchases</div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg text-center">
              <div className="text-2xl font-bold">{totalQuantity}</div>
              <div className="text-sm text-muted-foreground">Total Tickets</div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg text-center">
              <div className="text-2xl font-bold">{formatCurrency(totalCost)}</div>
              <div className="text-sm text-muted-foreground">Total Cost</div>
            </div>
          </div>

          {/* Purchases Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Row</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Split Type</TableHead>
                <TableHead>List Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.map((purchase) => {
                const settings = exportItems.get(purchase.id) || {
                  splitType: DEFAULT_SPLIT_TYPE,
                  listingPrice: DEFAULT_LISTING_PRICE,
                };
                return (
                  <TableRow key={purchase.id}>
                    <TableCell>
                      <div className="max-w-[200px]">
                        <p className="font-medium truncate" title={purchase.event?.eventName || ""}>
                          {purchase.event?.eventName || "No Event"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {purchase.event?.venue}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{purchase.section || "-"}</TableCell>
                    <TableCell>{purchase.row || "-"}</TableCell>
                    <TableCell>{purchase.quantity}</TableCell>
                    <TableCell>{formatCurrency(purchase.totalPrice)}</TableCell>
                    <TableCell>
                      <Select
                        value={settings.splitType.toString()}
                        onValueChange={(v) =>
                          updateSplitType(purchase.id, parseInt(v, 10))
                        }
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(SPLIT_TYPE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="w-[100px]"
                        value={settings.listingPrice}
                        onChange={(e) =>
                          updateListingPrice(
                            purchase.id,
                            parseInt(e.target.value, 10) || DEFAULT_LISTING_PRICE
                          )
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              `Confirm Export (${purchases.length})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
