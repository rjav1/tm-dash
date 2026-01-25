"use client";

import { useEffect, useState } from "react";
import {
  RefreshCw,
  Trash2,
  Database,
  FolderSync,
  AlertTriangle,
  CheckCircle2,
  Settings,
  Upload,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface DbCounts {
  counts: {
    accounts: number;
    cards: number;
    proxies: number;
    accountProxies: number;
    events: number;
    queuePositions: number;
    purchases: number;
    imapCredentials: number;
  };
  total: number;
}

interface SyncStatus {
  generatorPath: string;
  checkoutPath: string;
  files: { path: string; exists: boolean; size?: number }[];
}

export default function SettingsPage() {
  const [dbCounts, setDbCounts] = useState<DbCounts | null>(null);
  const [generatorStatus, setGeneratorStatus] = useState<SyncStatus | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState<{ exportFiles: { name: string; size: number }[]; profilesExists: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [wiping, setWiping] = useState(false);
  const [wipeDialogOpen, setWipeDialogOpen] = useState(false);
  const [marketplaceFee, setMarketplaceFee] = useState("7");
  const [savingFee, setSavingFee] = useState(false);
  const { toast } = useToast();

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const [dbRes, genRes, checkoutRes, settingsRes] = await Promise.all([
        fetch("/api/admin/wipe"),
        fetch("/api/sync/tm-generator"),
        fetch("/api/sync/tm-checkout"),
        fetch("/api/settings"),
      ]);

      if (dbRes.ok) setDbCounts(await dbRes.json());
      if (genRes.ok) setGeneratorStatus(await genRes.json());
      if (checkoutRes.ok) setCheckoutStatus(await checkoutRes.json());
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setMarketplaceFee(settingsData.settings.marketplace_fee_percentage || "7");
      }
    } catch (error) {
      console.error("Failed to fetch status:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSync = async (source: "tm-generator" | "tm-checkout") => {
    setSyncing(source);
    try {
      const response = await fetch(`/api/sync/${source}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (data.success) {
        const results = data.results;
        let message = "";

        if (source === "tm-generator") {
          message = `Accounts: ${results.accounts.imported} imported, ${results.accounts.updated} updated. IMAP: ${results.imap.imported} imported, ${results.imap.updated} updated.`;
        } else {
          message = `Purchases: ${results.purchases.imported} imported, ${results.purchases.eventsCreated} events created. Profiles: ${results.profiles.accounts} synced.`;
        }

        toast({
          title: "Sync Successful",
          description: message,
        });

        // Refresh status
        fetchStatus();
      } else {
        toast({
          title: "Sync Failed",
          description: data.error || "Unknown error",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Sync Failed",
        description: "Failed to connect to sync endpoint",
        variant: "destructive",
      });
    } finally {
      setSyncing(null);
    }
  };

  const handleWipe = async () => {
    setWiping(true);
    try {
      const response = await fetch("/api/admin/wipe?confirm=yes", {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Data Wiped",
          description: `Deleted ${data.totalDeleted} records from all tables`,
        });
        setWipeDialogOpen(false);
        fetchStatus();
      } else {
        toast({
          title: "Wipe Failed",
          description: data.error || "Unknown error",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Wipe Failed",
        description: "Failed to wipe data",
        variant: "destructive",
      });
    } finally {
      setWiping(false);
    }
  };

  const handleSaveMarketplaceFee = async () => {
    setSavingFee(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "marketplace_fee_percentage",
          value: marketplaceFee,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: "Setting Saved",
          description: `Marketplace fee set to ${marketplaceFee}%`,
        });
      } else {
        toast({
          title: "Save Failed",
          description: data.error || "Failed to save setting",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Failed to update marketplace fee",
        variant: "destructive",
      });
    } finally {
      setSavingFee(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage data sync, imports, and database operations
        </p>
      </div>

      {/* Application Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Application Settings
          </CardTitle>
          <CardDescription>
            Configure profit calculations and business metrics
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-xs">
              <label htmlFor="marketplace-fee" className="text-sm font-medium block mb-2">
                Marketplace Fee Percentage
              </label>
              <div className="relative">
                <input
                  id="marketplace-fee"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={marketplaceFee}
                  onChange={(e) => setMarketplaceFee(e.target.value)}
                  className="w-full px-3 py-2 pr-8 border border-input rounded-md bg-background"
                  placeholder="7"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  %
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Fee taken by marketplace when selling (used in profit calculations)
              </p>
            </div>
            <Button 
              onClick={handleSaveMarketplaceFee} 
              disabled={savingFee || loading}
            >
              {savingFee ? "Saving..." : "Save Fee"}
            </Button>
          </div>
          <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
            <strong>Formula:</strong> Profit = (Sale Price × (1 - {marketplaceFee}%)) - Cost
          </div>
        </CardContent>
      </Card>

      {/* Database Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Status
          </CardTitle>
          <CardDescription>
            Current record counts in the database
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : dbCounts ? (
            <div className="grid gap-4 md:grid-cols-4">
              <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                <span className="text-sm">Accounts</span>
                <Badge variant="secondary">{dbCounts.counts.accounts}</Badge>
              </div>
              <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                <span className="text-sm">Cards</span>
                <Badge variant="secondary">{dbCounts.counts.cards}</Badge>
              </div>
              <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                <span className="text-sm">Purchases</span>
                <Badge variant="secondary">{dbCounts.counts.purchases}</Badge>
              </div>
              <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                <span className="text-sm">Queue Positions</span>
                <Badge variant="secondary">{dbCounts.counts.queuePositions}</Badge>
              </div>
              <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                <span className="text-sm">Events</span>
                <Badge variant="secondary">{dbCounts.counts.events}</Badge>
              </div>
              <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                <span className="text-sm">Proxies</span>
                <Badge variant="secondary">{dbCounts.counts.proxies}</Badge>
              </div>
              <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                <span className="text-sm">IMAP Credentials</span>
                <Badge variant="secondary">{dbCounts.counts.imapCredentials}</Badge>
              </div>
              <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg">
                <span className="text-sm font-medium">Total Records</span>
                <Badge>{dbCounts.total}</Badge>
              </div>
            </div>
          ) : (
            <p className="text-destructive">Failed to load database status</p>
          )}

          <div className="mt-6 flex gap-2">
            <Button variant="outline" onClick={fetchStatus} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Dialog open={wipeDialogOpen} onOpenChange={setWipeDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Wipe All Data
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    Confirm Data Wipe
                  </DialogTitle>
                  <DialogDescription>
                    This will permanently delete ALL data from the database including accounts, cards, purchases, queues, events, and proxies. This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setWipeDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleWipe} disabled={wiping}>
                    {wiping ? "Wiping..." : "Yes, Wipe All Data"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Sync Sources */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* tm-generator Sync */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderSync className="h-5 w-5" />
              tm-generator Sync
            </CardTitle>
            <CardDescription>
              Sync accounts and IMAP config from tm-generator
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {generatorStatus && (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground truncate">
                  Path: {generatorStatus.generatorPath}
                </p>
                <div className="space-y-1">
                  {generatorStatus.files?.map((file) => (
                    <div key={file.path} className="flex items-center gap-2">
                      {file.exists ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      )}
                      <span>{file.path}</span>
                      {file.size && (
                        <Badge variant="outline" className="ml-auto">
                          {(file.size / 1024).toFixed(1)} KB
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={() => handleSync("tm-generator")}
              disabled={syncing === "tm-generator"}
              className="w-full"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing === "tm-generator" ? "animate-spin" : ""}`} />
              {syncing === "tm-generator" ? "Syncing..." : "Sync Accounts & IMAP"}
            </Button>
          </CardContent>
        </Card>

        {/* tm-checkout Sync */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderSync className="h-5 w-5" />
              tm-checkout Sync
            </CardTitle>
            <CardDescription>
              Sync purchases and profiles from tm-checkout
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {checkoutStatus && (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  {checkoutStatus.profilesExists ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  )}
                  <span>profiles.csv</span>
                </div>
                <p className="text-muted-foreground">
                  {checkoutStatus.exportFiles?.length || 0} export files found
                </p>
                {checkoutStatus.exportFiles?.slice(0, 3).map((file) => (
                  <div key={file.name} className="flex items-center gap-2 text-xs">
                    <span className="truncate">{file.name}</span>
                    <Badge variant="outline" className="ml-auto">
                      {(file.size / 1024).toFixed(1)} KB
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            <Button
              onClick={() => handleSync("tm-checkout")}
              disabled={syncing === "tm-checkout"}
              className="w-full"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing === "tm-checkout" ? "animate-spin" : ""}`} />
              {syncing === "tm-checkout" ? "Syncing..." : "Sync Purchases & Profiles"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href="/import">
                <Upload className="h-4 w-4 mr-2" />
                Manual Import
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href="/api/export/profiles" download="profiles.csv">
                Export Profiles CSV
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
