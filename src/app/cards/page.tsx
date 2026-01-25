"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Download, ArrowUpDown, Link2, Unlink, Pencil, X, Settings2, Trash2, RotateCcw, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { maskCardNumber } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { CardEditDialog } from "@/components/card-edit-dialog";
import { PaginationControls } from "@/components/pagination-controls";

// Column definitions
type ColumnKey = 
  | "profile" 
  | "status" 
  | "email" 
  | "cardType" 
  | "cardNumber" 
  | "expiry" 
  | "cvv" 
  | "billingName" 
  | "city" 
  | "state" 
  | "zip" 
  | "phone" 
  | "purchases";

const COLUMN_LABELS: Record<ColumnKey, string> = {
  profile: "Profile",
  status: "Status",
  email: "Account Email",
  cardType: "Card Type",
  cardNumber: "Card Number",
  expiry: "Expiry",
  cvv: "CVV",
  billingName: "Billing Name",
  city: "City",
  state: "State",
  zip: "Zip",
  phone: "Phone",
  purchases: "Purchases",
};

// Default visible columns (cardType hidden by default)
const DEFAULT_VISIBLE_COLUMNS: Set<ColumnKey> = new Set([
  "profile",
  "status",
  "email",
  "cardNumber",
  "expiry",
  "cvv",
  "billingName",
  "city",
  "state",
  "zip",
  "phone",
  "purchases",
]);

interface CardData {
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
  deletedAt: string | null;
  account: {
    id: string;
    email: string;
    status: string;
  } | null;
  purchaseCount: number;
  isLinked: boolean;
  isDeleted: boolean;
}

interface Stats {
  total: number;
  linked: number;
  unlinked: number;
  deleted: number;
}

type SortField = "profileName" | "cardType" | "billingName" | "createdAt" | "expYear";
type SortOrder = "asc" | "desc";

function SortHeader({ 
  field, 
  children, 
  sortBy, 
  sortOrder, 
  onClick 
}: { 
  field: SortField; 
  children: React.ReactNode; 
  sortBy: SortField;
  sortOrder: SortOrder;
  onClick: (field: SortField) => void;
}) {
  return (
    <TableHead
      className="cursor-pointer hover:bg-muted/50"
      onClick={() => onClick(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={`h-3 w-3 ${sortBy === field ? "opacity-100" : "opacity-30"}`} />
      </div>
    </TableHead>
  );
}

export default function CardsPage() {
  const [cards, setCards] = useState<CardData[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [linkedFilter, setLinkedFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortField>("profileName");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [showNumbers, setShowNumbers] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  
  // Edit dialog state
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(DEFAULT_VISIBLE_COLUMNS);
  
  // Show deleted cards toggle
  const [showDeleted, setShowDeleted] = useState(false);
  
  const { toast } = useToast();

  const toggleColumn = (column: ColumnKey) => {
    setVisibleColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(column)) {
        newSet.delete(column);
      } else {
        newSet.add(column);
      }
      return newSet;
    });
  };

  const isColumnVisible = (column: ColumnKey) => visibleColumns.has(column);

  // Copy to clipboard helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: "Copied",
        description: `${label} copied to clipboard`,
      });
    }).catch(() => {
      toast({
        title: "Copy Failed",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    });
  };

  const fetchCards = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (linkedFilter !== "all") params.set("linked", linkedFilter);
      if (showDeleted) params.set("includeDeleted", "true");
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      params.set("page", page.toString());
      params.set("limit", pageSize.toString());

      const response = await fetch(`/api/cards?${params}`);
      const data = await response.json();
      setCards(data.cards || []);
      setStats(data.stats || null);
      setTotalPages(data.pagination?.pages || 1);
      setTotalItems(data.pagination?.total || 0);
    } catch (error) {
      console.error("Failed to fetch cards:", error);
    } finally {
      setLoading(false);
    }
  }, [search, linkedFilter, showDeleted, sortBy, sortOrder, page, pageSize]);

  // Soft delete/restore cards
  const handleDeleteCards = async (cardIds: string[], action: "delete" | "restore") => {
    try {
      const response = await fetch("/api/cards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds, action }),
      });
      
      if (!response.ok) throw new Error("Failed to update cards");
      
      const data = await response.json();
      toast({
        title: action === "delete" ? "Cards Deleted" : "Cards Restored",
        description: `${data.updated} card(s) ${action === "delete" ? "deleted" : "restored"}`,
      });
      
      setSelectedIds(new Set());
      fetchCards();
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${action} cards`,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(cards.map((c) => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const handleExportAll = async () => {
    try {
      const response = await fetch("/api/export/profiles");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `profiles_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export Successful",
        description: "All profiles exported",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export profiles",
        variant: "destructive",
      });
    }
  };

  const handleExportSelected = () => {
    if (selectedIds.size === 0) {
      toast({
        title: "No cards selected",
        description: "Select cards to export",
        variant: "destructive",
      });
      return;
    }

    const selectedCards = cards.filter((c) => selectedIds.has(c.id));
    
    // Build CSV
    const headers = [
      "Email Address",
      "Profile Name",
      "Card Type",
      "Card Number",
      "Expiration Month",
      "Expiration Year",
      "CVV",
      "Billing Name",
      "Billing Phone",
      "Billing Address",
      "Billing Post Code",
      "Billing City",
      "Billing State",
    ];

    const rows = selectedCards.map((card) => [
      card.account?.email || "",
      card.profileName,
      card.cardType,
      card.cardNumber,
      card.expMonth,
      card.expYear,
      "", // CVV not exposed in list
      card.billingName,
      card.billingPhone || "",
      card.billingAddress,
      card.billingZip,
      card.billingCity,
      card.billingState,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `profiles_selected_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    toast({
      title: "Export Successful",
      description: `Exported ${selectedIds.size} profiles`,
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCards();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cards</h1>
          <p className="text-muted-foreground">
            Manage payment methods and profiles
          </p>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Settings2 className="h-4 w-4 mr-2" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(Object.keys(COLUMN_LABELS) as ColumnKey[]).map((col) => (
                <DropdownMenuCheckboxItem
                  key={col}
                  checked={isColumnVisible(col)}
                  onCheckedChange={() => toggleColumn(col)}
                >
                  {COLUMN_LABELS[col]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" onClick={() => setShowNumbers(!showNumbers)}>
            {showNumbers ? "Hide Numbers" : "Show Numbers"}
          </Button>
          <Button 
            variant={showDeleted ? "default" : "outline"} 
            onClick={() => setShowDeleted(!showDeleted)}
          >
            {showDeleted ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
            {showDeleted ? "Showing Deleted" : "Show Deleted"}
            {stats?.deleted ? ` (${stats.deleted})` : ""}
          </Button>
          {selectedIds.size > 0 && (
            <>
              {/* Check if any selected cards are deleted for restore option */}
              {cards.some(c => selectedIds.has(c.id) && c.isDeleted) ? (
                <Button variant="outline" onClick={() => handleDeleteCards(Array.from(selectedIds), "restore")}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restore ({selectedIds.size})
                </Button>
              ) : (
                <Button variant="destructive" onClick={() => handleDeleteCards(Array.from(selectedIds), "delete")}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete ({selectedIds.size})
                </Button>
              )}
            </>
          )}
          {selectedIds.size > 0 ? (
            <Button onClick={handleExportSelected}>
              <Download className="h-4 w-4 mr-2" />
              Export Selected ({selectedIds.size})
            </Button>
          ) : (
            <Button onClick={handleExportAll}>
              <Download className="h-4 w-4 mr-2" />
              Export All
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-sm text-muted-foreground">Active Cards</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold flex items-center gap-2">
                <Link2 className="h-5 w-5 text-green-500" />
                {stats.linked}
              </div>
              <p className="text-sm text-muted-foreground">Linked to Accounts</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold flex items-center gap-2">
                <Unlink className="h-5 w-5 text-orange-500" />
                {stats.unlinked}
              </div>
              <p className="text-sm text-muted-foreground">Unlinked Cards</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-red-500" />
                {stats.deleted}
              </div>
              <p className="text-sm text-muted-foreground">Deleted Cards</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search & Filters */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[250px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by profile name, email, or card number..."
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
            <Select value={linkedFilter} onValueChange={setLinkedFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Link Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cards</SelectItem>
                <SelectItem value="true">Linked Only</SelectItem>
                <SelectItem value="false">Unlinked Only</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit">Search</Button>
          </form>
        </CardContent>
      </Card>

      {/* Cards Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            Card Profiles ({cards.length})
          </CardTitle>
          {selectedIds.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear Selection
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading cards...
            </div>
          ) : cards.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No cards found
            </div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={selectedIds.size === cards.length && cards.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  {isColumnVisible("profile") && (
                    <SortHeader field="profileName" sortBy={sortBy} sortOrder={sortOrder} onClick={handleSort}>Profile</SortHeader>
                  )}
                  {isColumnVisible("status") && <TableHead>Status</TableHead>}
                  {isColumnVisible("email") && <TableHead>Account Email</TableHead>}
                  {isColumnVisible("cardType") && (
                    <SortHeader field="cardType" sortBy={sortBy} sortOrder={sortOrder} onClick={handleSort}>Card Type</SortHeader>
                  )}
                  {isColumnVisible("cardNumber") && <TableHead>Card Number</TableHead>}
                  {isColumnVisible("expiry") && (
                    <SortHeader field="expYear" sortBy={sortBy} sortOrder={sortOrder} onClick={handleSort}>Expiry</SortHeader>
                  )}
                  {isColumnVisible("cvv") && <TableHead>CVV</TableHead>}
                  {isColumnVisible("billingName") && (
                    <SortHeader field="billingName" sortBy={sortBy} sortOrder={sortOrder} onClick={handleSort}>Billing Name</SortHeader>
                  )}
                  {isColumnVisible("city") && <TableHead>City</TableHead>}
                  {isColumnVisible("state") && <TableHead>State</TableHead>}
                  {isColumnVisible("zip") && <TableHead>Zip</TableHead>}
                  {isColumnVisible("phone") && <TableHead>Phone</TableHead>}
                  {isColumnVisible("purchases") && <TableHead>Purchases</TableHead>}
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cards.map((card) => (
                  <TableRow
                    key={card.id}
                    className={`cursor-pointer hover:bg-muted/50 ${card.isDeleted ? "opacity-50 bg-red-50 dark:bg-red-950/20" : ""}`}
                    onClick={() => {
                      setEditingCardId(card.id);
                      setEditDialogOpen(true);
                    }}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(card.id)}
                        onCheckedChange={(checked) => handleSelectOne(card.id, !!checked)}
                      />
                    </TableCell>
                    {isColumnVisible("profile") && (
                      <TableCell className="font-medium">
                        {card.profileName}
                      </TableCell>
                    )}
                    {isColumnVisible("status") && (
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {card.isDeleted && (
                            <Badge variant="destructive" className="gap-1">
                              <Trash2 className="h-3 w-3" />
                              Deleted
                            </Badge>
                          )}
                          {card.isLinked ? (
                            <Badge variant="default" className="gap-1">
                              <Link2 className="h-3 w-3" />
                              Linked
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <Unlink className="h-3 w-3" />
                              Unlinked
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    )}
                    {isColumnVisible("email") && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {card.account?.email ? (
                          <span
                            className="cursor-pointer hover:text-primary hover:underline"
                            onClick={() => copyToClipboard(card.account!.email, "Email")}
                            title="Click to copy"
                          >
                            {card.account.email}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                    {isColumnVisible("cardType") && (
                      <TableCell>{card.cardType}</TableCell>
                    )}
                    {isColumnVisible("cardNumber") && (
                      <TableCell className="font-mono text-sm" onClick={(e) => e.stopPropagation()}>
                        <span
                          className="cursor-pointer hover:text-primary hover:underline"
                          onClick={() => copyToClipboard(card.cardNumber, "Card number")}
                          title="Click to copy"
                        >
                          {showNumbers
                            ? card.cardNumber
                            : maskCardNumber(card.cardNumber)}
                        </span>
                      </TableCell>
                    )}
                    {isColumnVisible("expiry") && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <span
                          className="cursor-pointer hover:text-primary hover:underline"
                          onClick={() => copyToClipboard(`${card.expMonth}/${card.expYear}`, "Expiry")}
                          title="Click to copy"
                        >
                          {card.expMonth}/{card.expYear}
                        </span>
                      </TableCell>
                    )}
                    {isColumnVisible("cvv") && (
                      <TableCell className="font-mono" onClick={(e) => e.stopPropagation()}>
                        <span
                          className="cursor-pointer hover:text-primary hover:underline"
                          onClick={() => copyToClipboard(card.cvv, "CVV")}
                          title="Click to copy"
                        >
                          {showNumbers ? card.cvv : "***"}
                        </span>
                      </TableCell>
                    )}
                    {isColumnVisible("billingName") && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <span
                          className="cursor-pointer hover:text-primary hover:underline"
                          onClick={() => copyToClipboard(card.billingName, "Name")}
                          title="Click to copy"
                        >
                          {card.billingName}
                        </span>
                      </TableCell>
                    )}
                    {isColumnVisible("city") && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <span
                          className="cursor-pointer hover:text-primary hover:underline"
                          onClick={() => copyToClipboard(card.billingCity, "City")}
                          title="Click to copy"
                        >
                          {card.billingCity}
                        </span>
                      </TableCell>
                    )}
                    {isColumnVisible("state") && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <span
                          className="cursor-pointer hover:text-primary hover:underline"
                          onClick={() => copyToClipboard(card.billingState, "State")}
                          title="Click to copy"
                        >
                          {card.billingState}
                        </span>
                      </TableCell>
                    )}
                    {isColumnVisible("zip") && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <span
                          className="cursor-pointer hover:text-primary hover:underline"
                          onClick={() => copyToClipboard(card.billingZip, "Zip")}
                          title="Click to copy"
                        >
                          {card.billingZip}
                        </span>
                      </TableCell>
                    )}
                    {isColumnVisible("phone") && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {card.billingPhone ? (
                          <span
                            className="cursor-pointer hover:text-primary hover:underline"
                            onClick={() => copyToClipboard(card.billingPhone!, "Phone")}
                            title="Click to copy"
                          >
                            {card.billingPhone}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                    {isColumnVisible("purchases") && (
                      <TableCell>
                        {card.purchaseCount > 0 ? (
                          <Badge variant="outline">{card.purchaseCount}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingCardId(card.id);
                          setEditDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
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

      {/* Edit Dialog */}
      <CardEditDialog
        cardId={editingCardId}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSaved={() => {
          fetchCards();
        }}
      />
    </div>
  );
}
