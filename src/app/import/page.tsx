"use client";

import { useState, useCallback } from "react";
import { Upload, Users, CreditCard, BarChart3, ShoppingCart, CheckCircle2, Unlink, Mail } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileUpload } from "@/components/file-upload";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { EmailCsvImportDialog } from "@/components/email-csv-import-dialog";
import { ProgressBar, ProgressStatus } from "@/components/ui/progress-bar";
import { parseSSEStream, StreamProgressEvent } from "@/lib/utils/streaming";

interface ImportResult {
  success: boolean;
  imported: number;
  updated?: number;
  skipped: number;
  total: number;
  eventsCreated?: number;
}

interface ProgressState {
  current: number;
  total: number;
  label: string;
  status: ProgressStatus;
  startTime: Date | null;
  successCount: number;
  failedCount: number;
  message: string | null;
}

const initialProgress: ProgressState = {
  current: 0,
  total: 0,
  label: "",
  status: "idle",
  startTime: null,
  successCount: 0,
  failedCount: 0,
  message: null,
};

export default function ImportPage() {
  const [progress, setProgress] = useState<Record<string, ProgressState>>({});
  const [results, setResults] = useState<Record<string, ImportResult>>({});
  const [emailCsvDialogOpen, setEmailCsvDialogOpen] = useState(false);
  const { toast } = useToast();

  const handleImport = useCallback(async (
    file: File,
    endpoint: string,
    type: string
  ) => {
    // Initialize progress
    setProgress(prev => ({
      ...prev,
      [type]: { ...initialProgress, status: "running", startTime: new Date(), label: `Uploading ${file.name}...` }
    }));

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("streaming", "true");

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Import failed");
      }

      // Check if response is SSE stream
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("text/event-stream")) {
        // Parse SSE stream
        await parseSSEStream(response, (event: StreamProgressEvent) => {
          switch (event.type) {
            case "start":
              setProgress(prev => ({
                ...prev,
                [type]: {
                  ...prev[type],
                  total: event.total || 0,
                  label: event.label || "Starting...",
                }
              }));
              break;
            case "progress":
              setProgress(prev => ({
                ...prev,
                [type]: {
                  ...prev[type],
                  current: event.current || 0,
                  total: event.total || prev[type]?.total || 0,
                  label: event.label || prev[type]?.label || "",
                  successCount: event.success || 0,
                  failedCount: event.failed || 0,
                }
              }));
              break;
            case "complete":
              setProgress(prev => ({
                ...prev,
                [type]: {
                  ...prev[type],
                  current: event.total || prev[type]?.total || 0,
                  status: "success",
                  successCount: event.success || 0,
                  failedCount: event.failed || 0,
                  message: event.message || "Complete",
                }
              }));
              setResults(prev => ({
                ...prev,
                [type]: {
                  success: true,
                  imported: event.success || 0,
                  skipped: event.failed || 0,
                  total: event.total || 0,
                }
              }));
              toast({
                title: "Import Complete",
                description: event.message || `Imported ${event.success} records`,
              });
              break;
            case "error":
              setProgress(prev => ({
                ...prev,
                [type]: {
                  ...prev[type],
                  status: "error",
                  message: event.message || "Import failed",
                }
              }));
              toast({
                title: "Import Failed",
                description: event.message || "Unknown error",
                variant: "destructive",
              });
              break;
          }
        });
      } else {
        // Fallback for non-streaming response
        const data = await response.json();
        if (data.success) {
          setProgress(prev => ({
            ...prev,
            [type]: {
              ...prev[type],
              current: data.total,
              total: data.total,
              status: "success",
              successCount: (data.imported || 0) + (data.updated || 0),
              failedCount: data.skipped || 0,
              message: `Imported ${data.imported} records`,
            }
          }));
          setResults(prev => ({ ...prev, [type]: data }));
          toast({
            title: "Import Successful",
            description: `Imported ${data.imported} records (${data.skipped} skipped)`,
          });
        } else {
          throw new Error(data.error || "Import failed");
        }
      }
    } catch (error) {
      setProgress(prev => ({
        ...prev,
        [type]: {
          ...prev[type],
          status: "error",
          message: error instanceof Error ? error.message : "Import failed",
        }
      }));
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive",
      });
    }
  }, [toast]);

  const getProgress = (type: string) => progress[type] || initialProgress;

  const ImportProgress = ({ type }: { type: string }) => {
    const p = getProgress(type);
    if (p.status === "idle") return null;

    return (
      <div className="mt-4">
        <ProgressBar
          current={p.current}
          total={p.total}
          label={p.label}
          status={p.status}
          showElapsedTime={p.status === "running"}
          startTime={p.startTime || undefined}
          showEstimate={p.status === "running"}
          successMessage={p.message || undefined}
          errorMessage={p.message || undefined}
        />
      </div>
    );
  };

  const ImportResultBadge = ({ type }: { type: string }) => {
    const result = results[type];
    const p = getProgress(type);
    
    // Only show if completed and not showing progress
    if (!result || p.status === "running") return null;
    if (p.status === "success" || p.status === "error") return null; // Progress bar handles this

    return (
      <div className="flex items-center gap-2 mt-4 p-3 bg-muted rounded-lg">
        <CheckCircle2 className="h-5 w-5 text-green-600" />
        <div className="text-sm">
          <span className="font-medium">{result.imported}</span> imported
          {result.updated !== undefined && (
            <>, <span className="font-medium">{result.updated}</span> updated</>
          )}
          , <span className="text-muted-foreground">{result.skipped} skipped</span>
          {result.eventsCreated !== undefined && (
            <>, <span className="font-medium">{result.eventsCreated}</span> events created</>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Import Data</h1>
        <p className="text-muted-foreground">
          Import data from tm-generator, tm-checkout, and Encore
        </p>
      </div>

      <Tabs defaultValue="profiles" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="profiles" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Profiles
          </TabsTrigger>
          <TabsTrigger value="card-profiles" className="flex items-center gap-2">
            <Unlink className="h-4 w-4" />
            Unlinked Cards
          </TabsTrigger>
          <TabsTrigger value="accounts" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Accounts
          </TabsTrigger>
          <TabsTrigger value="queues" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Queues
          </TabsTrigger>
          <TabsTrigger value="purchases" className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Purchases
          </TabsTrigger>
          <TabsTrigger value="email-receipts" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email Receipts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profiles">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Import Profiles (Accounts + Cards)
              </CardTitle>
              <CardDescription>
                Import from tm-checkout profiles.csv. This creates accounts and links cards to them.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Expected Format</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  CSV with headers:
                </p>
                <code className="text-xs bg-background p-2 rounded block overflow-x-auto">
                  Email Address,Profile Name,Card Type,Card Number,Expiration Month,Expiration Year,CVV,Billing Name,Billing Phone,Billing Address,Billing Post Code,Billing City,Billing State
                </code>
                <div className="text-xs text-muted-foreground mt-2">
                  Source: <Badge variant="outline">tm-checkout/discord-bot/extensions/profiles.csv</Badge>
                </div>
              </div>

              <FileUpload
                onFileSelect={(file) => handleImport(file, "/api/import/profiles", "profiles")}
                description="CSV file with account emails and card details"
                disabled={getProgress("profiles").status === "running"}
              />

              <ImportProgress type="profiles" />
              <ImportResultBadge type="profiles" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="card-profiles">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Unlink className="h-5 w-5" />
                Import Unlinked Card Profiles
              </CardTitle>
              <CardDescription>
                Import cards without email linking. These cards can be linked to accounts later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Expected Format</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  CSV with headers (NO Email column):
                </p>
                <code className="text-xs bg-background p-2 rounded block overflow-x-auto">
                  Profile Name,Card Type,Card Number,Expiration Month,Expiration Year,CVV,Billing Name,Billing Phone,Billing Address,Billing Post Code,Billing City,Billing State
                </code>
                <div className="text-xs text-muted-foreground mt-2">
                  Source: <Badge variant="outline">tm-checkout/discord-bot/extensions/card_profiles.csv</Badge>
                </div>
              </div>

              <FileUpload
                onFileSelect={(file) => handleImport(file, "/api/import/card-profiles", "card-profiles")}
                description="CSV file with card profiles (no email column)"
                disabled={getProgress("card-profiles").status === "running"}
              />

              <ImportProgress type="card-profiles" />
              <ImportResultBadge type="card-profiles" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accounts">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Import Accounts
              </CardTitle>
              <CardDescription>
                Import accounts from tm-generator output with passwords and IMAP providers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Expected Format</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  CSV with headers:
                </p>
                <code className="text-xs bg-background p-2 rounded block">
                  email,password,imap
                </code>
                <div className="text-xs text-muted-foreground mt-2">
                  Source: <Badge variant="outline">tm-generator/output/success.csv</Badge>
                </div>
              </div>

              <FileUpload
                onFileSelect={(file) => handleImport(file, "/api/import/accounts", "accounts")}
                description="CSV file with email, password, and IMAP provider"
                disabled={getProgress("accounts").status === "running"}
              />

              <ImportProgress type="accounts" />
              <ImportResultBadge type="accounts" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queues">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Import Queue Positions
              </CardTitle>
              <CardDescription>
                Import queue position data from Encore output files.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Expected Format</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Tab-separated file (no headers):
                </p>
                <code className="text-xs bg-background p-2 rounded block">
                  email@example.com	0A006426C2444B31	43789
                </code>
                <div className="text-xs text-muted-foreground mt-2">
                  Format: <Badge variant="outline">email &lt;TAB&gt; event_id &lt;TAB&gt; position</Badge>
                </div>
              </div>

              <FileUpload
                onFileSelect={(file) => handleImport(file, "/api/import/queues", "queues")}
                description="Tab-separated file from Encore queue output"
                accept={{ "text/plain": [".txt"], "text/csv": [".csv"] }}
                disabled={getProgress("queues").status === "running"}
              />

              <ImportProgress type="queues" />
              <ImportResultBadge type="queues" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="purchases">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Import Purchases
              </CardTitle>
              <CardDescription>
                Import checkout history from tm-checkout export files.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Expected Format</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  CSV export from tm-checkout with headers:
                </p>
                <code className="text-xs bg-background p-2 rounded block overflow-x-auto">
                  Job ID,Status,Profile ID,Card Last 4,Event Name,Event Date,Venue,Quantity,Price Each,Total Price,Section,Row,Seats,Account Email,...
                </code>
                <div className="text-xs text-muted-foreground mt-2">
                  Source: <Badge variant="outline">tm-checkout/discord-bot/exports/*.csv</Badge>
                </div>
              </div>

              <FileUpload
                onFileSelect={(file) => handleImport(file, "/api/import/purchases", "purchases")}
                description="CSV export file from tm-checkout"
                disabled={getProgress("purchases").status === "running"}
              />

              <ImportProgress type="purchases" />
              <ImportResultBadge type="purchases" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email-receipts">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Import Email Receipts
              </CardTitle>
              <CardDescription>
                Import purchase data from AYCD scraped email CSV files. Automatically matches events, links cards, and detects duplicates.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Expected Format</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  AYCD scraped email CSV with headers:
                </p>
                <code className="text-xs bg-background p-2 rounded block overflow-x-auto">
                  Template ID,Template Name,Mail Credentials,ticketmaster order number,event name,event date,event venue and location,seat information,card used,total price
                </code>
                <div className="text-xs text-muted-foreground mt-2">
                  Source: <Badge variant="outline">AYCD scraped emails</Badge>
                </div>
              </div>

              <div className="bg-blue-500/10 p-4 rounded-lg">
                <h4 className="font-medium mb-2 text-blue-600">Features</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Automatic event matching/creation from event name, date, and venue</li>
                  <li>• Card matching by last 4 digits with conflict detection</li>
                  <li>• Auto-linking of unlinked cards to accounts</li>
                  <li>• Duplicate detection by TM order number</li>
                  <li>• Quantity calculation from seat information</li>
                </ul>
              </div>

              <button
                onClick={() => setEmailCsvDialogOpen(true)}
                className="w-full border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors border-muted-foreground/25 hover:border-primary/50"
              >
                <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm font-medium">
                  Click to import email receipts
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  AYCD scraped email CSV files
                </p>
              </button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Email CSV Import Dialog */}
      <EmailCsvImportDialog
        open={emailCsvDialogOpen}
        onOpenChange={setEmailCsvDialogOpen}
        onImportComplete={() => {
          toast({
            title: "Import Complete",
            description: "Email receipts have been imported successfully",
          });
        }}
      />
    </div>
  );
}
