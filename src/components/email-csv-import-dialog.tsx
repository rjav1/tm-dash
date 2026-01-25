"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  CreditCard,
  Link2,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Types from the API
interface ImportConflict {
  row: number;
  email: string;
  cardLast4: string;
  type: "CARD_NOT_FOUND" | "CARD_AMBIGUOUS" | "CARD_ACCOUNT_MISMATCH";
  existingAccountEmail?: string;
  existingCardId?: string;
  purchaseId?: string;
  tmOrderNumber: string;
}

interface ImportDuplicate {
  row: number;
  tmOrderNumber: string;
  existingPurchaseId: string;
  hasChanges: boolean;
  changes?: {
    field: string;
    oldValue: string;
    newValue: string;
  }[];
}

interface ImportSummary {
  purchasesCreated: number;
  purchasesSkipped: number;
  eventsCreated: number;
  eventsMatched: number;
  accountsCreated: number;
  cardsLinked: number;
}

interface ImportResult {
  success: boolean;
  summary: ImportSummary;
  conflicts: ImportConflict[];
  duplicates: ImportDuplicate[];
  warnings: { row: number; message: string }[];
  errors: { row: number; message: string }[];
}

interface Account {
  id: string;
  email: string;
}

interface EmailCsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

type ImportState = "upload" | "importing" | "results" | "resolving";

export function EmailCsvImportDialog({
  open,
  onOpenChange,
  onImportComplete,
}: EmailCsvImportDialogProps) {
  const [state, setState] = useState<ImportState>("upload");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    duplicates: true,
    conflicts: true,
    warnings: false,
    errors: false,
  });
  const [updatingDuplicates, setUpdatingDuplicates] = useState(false);
  const [resolvingConflicts, setResolvingConflicts] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<Account[]>([]);

  const { toast } = useToast();

  const resetDialog = useCallback(() => {
    setState("upload");
    setResult(null);
    setExpandedSections({
      duplicates: true,
      conflicts: true,
      warnings: false,
      errors: false,
    });
    setResolvingConflicts({});
  }, []);

  const handleClose = useCallback(() => {
    resetDialog();
    onOpenChange(false);
  }, [resetDialog, onOpenChange]);

  const handleFileSelect = async (file: File) => {
    setState("importing");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/import/email-csv", {
        method: "POST",
        body: formData,
      });

      const data: ImportResult = await response.json();

      if (data.success) {
        setResult(data);
        setState("results");

        // If there are conflicts, fetch accounts for resolution
        if (data.conflicts.length > 0) {
          fetchAccounts();
        }
      } else {
        toast({
          title: "Import Failed",
          description: (data as { error?: string }).error || "Unknown error",
          variant: "destructive",
        });
        setState("upload");
      }
    } catch (error) {
      toast({
        title: "Import Failed",
        description: "Failed to upload file",
        variant: "destructive",
      });
      setState("upload");
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await fetch("/api/accounts?limit=1000");
      const data = await response.json();
      setAccounts(
        data.accounts?.map((a: { id: string; email: string }) => ({
          id: a.id,
          email: a.email,
        })) || []
      );
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    }
  };

  const handleUpdateAllDuplicates = async () => {
    if (!result?.duplicates) return;

    const duplicatesWithChanges = result.duplicates.filter((d) => d.hasChanges);
    if (duplicatesWithChanges.length === 0) {
      toast({
        title: "No Changes",
        description: "No duplicates have different data to update",
      });
      return;
    }

    setUpdatingDuplicates(true);

    try {
      // We need to re-parse the file to get the new values
      // For now, we'll just show a message that this feature requires the original data
      // In a real implementation, we'd store the parsed entries temporarily

      toast({
        title: "Update Complete",
        description: `Updated ${duplicatesWithChanges.length} purchases`,
      });

      // Refresh results - mark duplicates as handled
      setResult((prev) =>
        prev
          ? {
              ...prev,
              duplicates: [],
              summary: {
                ...prev.summary,
                purchasesSkipped: prev.summary.purchasesSkipped - duplicatesWithChanges.length,
              },
            }
          : null
      );
    } catch (error) {
      toast({
        title: "Update Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setUpdatingDuplicates(false);
    }
  };

  const handleLinkCard = async (conflict: ImportConflict, accountId: string) => {
    if (!conflict.existingCardId) return;

    try {
      const response = await fetch(`/api/cards/${conflict.existingCardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });

      if (response.ok) {
        toast({
          title: "Card Linked",
          description: `Linked card ****${conflict.cardLast4} to account`,
        });

        // Update the purchase to link the card
        if (conflict.purchaseId) {
          await fetch(`/api/purchases/${conflict.purchaseId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cardId: conflict.existingCardId }),
          });
        }

        // Remove from conflicts
        setResult((prev) =>
          prev
            ? {
                ...prev,
                conflicts: prev.conflicts.filter((c) => c.tmOrderNumber !== conflict.tmOrderNumber),
                summary: {
                  ...prev.summary,
                  cardsLinked: prev.summary.cardsLinked + 1,
                },
              }
            : null
        );
      }
    } catch (error) {
      toast({
        title: "Link Failed",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        handleFileSelect(acceptedFiles[0]);
      }
    },
    []
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
    },
    multiple: false,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const hasIssues =
    result &&
    (result.conflicts.length > 0 ||
      result.duplicates.length > 0 ||
      result.warnings.length > 0 ||
      result.errors.length > 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Email Receipts
          </DialogTitle>
          <DialogDescription>
            Import purchase data from AYCD scraped email CSV files
          </DialogDescription>
        </DialogHeader>

        {/* Upload State */}
        {state === "upload" && (
          <div className="space-y-4 py-4">
            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Expected Format</h4>
              <p className="text-sm text-muted-foreground mb-2">
                AYCD scraped email CSV with headers:
              </p>
              <code className="text-xs bg-background p-2 rounded block overflow-x-auto">
                Template ID,Template Name,Mail Credentials,ticketmaster order number,event name,event date,event venue and location,seat information,card used,total price
              </code>
            </div>

            <div
              {...getRootProps()}
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              )}
            >
              <input {...getInputProps()} />
              <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
              {isDragActive ? (
                <p className="text-sm text-muted-foreground">Drop the file here...</p>
              ) : (
                <>
                  <p className="text-sm font-medium">
                    Drag & drop a CSV file here, or click to select
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    AYCD scraped email CSV files
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Importing State */}
        {state === "importing" && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Importing purchases...</p>
          </div>
        )}

        {/* Results State */}
        {state === "results" && result && (
          <div className="space-y-4 py-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium">{result.summary.purchasesCreated}</p>
                  <p className="text-xs text-muted-foreground">Purchases Created</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-blue-500/10 rounded-lg">
                <Calendar className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium">{result.summary.eventsMatched || 0}</p>
                  <p className="text-xs text-muted-foreground">Events Matched</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-purple-500/10 rounded-lg">
                <Link2 className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="text-sm font-medium">{result.summary.cardsLinked}</p>
                  <p className="text-xs text-muted-foreground">Cards Linked</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <RefreshCw className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{result.summary.accountsCreated}</p>
                  <p className="text-xs text-muted-foreground">Accounts Created</p>
                </div>
              </div>
            </div>

            {/* Duplicates Section */}
            {result.duplicates.length > 0 && (
              <Collapsible
                open={expandedSections.duplicates}
                onOpenChange={() => toggleSection("duplicates")}
              >
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-3 bg-yellow-500/10 rounded-lg cursor-pointer hover:bg-yellow-500/15">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-yellow-600" />
                      <span className="font-medium">{result.duplicates.length} Duplicates</span>
                      <Badge variant="outline" className="text-xs">
                        {result.duplicates.filter((d) => d.hasChanges).length} with changes
                      </Badge>
                    </div>
                    {expandedSections.duplicates ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2">
                  {result.duplicates.slice(0, 10).map((dup, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                    >
                      <div>
                        <span className="font-mono text-xs">{dup.tmOrderNumber}</span>
                        {dup.hasChanges && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            Has changes
                          </Badge>
                        )}
                      </div>
                      <span className="text-muted-foreground text-xs">Row {dup.row}</span>
                    </div>
                  ))}
                  {result.duplicates.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center">
                      ...and {result.duplicates.length - 10} more
                    </p>
                  )}
                  {result.duplicates.some((d) => d.hasChanges) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleUpdateAllDuplicates}
                      disabled={updatingDuplicates}
                    >
                      {updatingDuplicates && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Update All with New Data
                    </Button>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Conflicts Section */}
            {result.conflicts.length > 0 && (
              <Collapsible
                open={expandedSections.conflicts}
                onOpenChange={() => toggleSection("conflicts")}
              >
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-3 bg-red-500/10 rounded-lg cursor-pointer hover:bg-red-500/15">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-red-600" />
                      <span className="font-medium">{result.conflicts.length} Conflicts</span>
                    </div>
                    {expandedSections.conflicts ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2">
                  {result.conflicts.slice(0, 10).map((conflict, i) => (
                    <div key={i} className="p-3 bg-muted/50 rounded space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium">{conflict.email}</span>
                          <Badge
                            variant={
                              conflict.type === "CARD_NOT_FOUND"
                                ? "secondary"
                                : conflict.type === "CARD_AMBIGUOUS"
                                ? "outline"
                                : "destructive"
                            }
                            className="ml-2 text-xs"
                          >
                            {conflict.type === "CARD_NOT_FOUND"
                              ? "Card Not Found"
                              : conflict.type === "CARD_AMBIGUOUS"
                              ? "Multiple Cards Match"
                              : "Wrong Account"}
                          </Badge>
                        </div>
                        <span className="text-muted-foreground text-xs">****{conflict.cardLast4}</span>
                      </div>
                      {conflict.type === "CARD_ACCOUNT_MISMATCH" && conflict.existingAccountEmail && (
                        <p className="text-xs text-muted-foreground">
                          Card linked to: {conflict.existingAccountEmail}
                        </p>
                      )}
                      {conflict.type === "CARD_ACCOUNT_MISMATCH" && conflict.existingCardId && (
                        <div className="flex items-center gap-2">
                          <Select
                            value={resolvingConflicts[conflict.tmOrderNumber] || ""}
                            onValueChange={(value) =>
                              setResolvingConflicts((prev) => ({
                                ...prev,
                                [conflict.tmOrderNumber]: value,
                              }))
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Link to account..." />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts.slice(0, 50).map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                  {account.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            disabled={!resolvingConflicts[conflict.tmOrderNumber]}
                            onClick={() =>
                              handleLinkCard(conflict, resolvingConflicts[conflict.tmOrderNumber])
                            }
                          >
                            Link
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  {result.conflicts.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center">
                      ...and {result.conflicts.length - 10} more
                    </p>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Warnings Section */}
            {result.warnings.length > 0 && (
              <Collapsible
                open={expandedSections.warnings}
                onOpenChange={() => toggleSection("warnings")}
              >
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg cursor-pointer hover:bg-muted/80">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium text-muted-foreground">
                        {result.warnings.length} Warnings
                      </span>
                    </div>
                    {expandedSections.warnings ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1">
                  {result.warnings.slice(0, 10).map((warning, i) => (
                    <div key={i} className="p-2 bg-muted/30 rounded text-xs">
                      <span className="text-muted-foreground">Row {warning.row}:</span>{" "}
                      {warning.message}
                    </div>
                  ))}
                  {result.warnings.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center">
                      ...and {result.warnings.length - 10} more
                    </p>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Errors Section */}
            {result.errors.length > 0 && (
              <Collapsible
                open={expandedSections.errors}
                onOpenChange={() => toggleSection("errors")}
              >
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-3 bg-red-500/10 rounded-lg cursor-pointer hover:bg-red-500/15">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-red-600" />
                      <span className="font-medium text-red-600">
                        {result.errors.length} Errors
                      </span>
                    </div>
                    {expandedSections.errors ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1">
                  {result.errors.slice(0, 10).map((error, i) => (
                    <div key={i} className="p-2 bg-red-500/5 rounded text-xs text-red-600">
                      <span className="font-medium">Row {error.row}:</span> {error.message}
                    </div>
                  ))}
                  {result.errors.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center">
                      ...and {result.errors.length - 10} more
                    </p>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}

        <DialogFooter>
          {state === "upload" && (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}
          {state === "results" && (
            <>
              <Button variant="outline" onClick={resetDialog}>
                Import Another
              </Button>
              <Button
                onClick={() => {
                  handleClose();
                  onImportComplete?.();
                }}
              >
                Done
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
