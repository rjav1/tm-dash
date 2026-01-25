"use client";

import { useState } from "react";
import Image from "next/image";
import { MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface VenueZoneData {
  zoneName: string;
  colorHex: string | null;
  sections: string[];
  minPrice: number | null;
}

interface VenueMapProps {
  venueId?: string;
  venueName?: string;
  staticMapUrl: string | null;
  zones: VenueZoneData[];
  selectedZones?: string[];
  onZoneSelect?: (zoneName: string) => void;
  showPrices?: boolean;
  loading?: boolean;
  onRefresh?: () => void;
}

export function VenueMap({
  venueName,
  staticMapUrl,
  zones,
  selectedZones = [],
  onZoneSelect,
  showPrices = true,
  loading = false,
  onRefresh,
}: VenueMapProps) {
  const [imageError, setImageError] = useState(false);
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);

  const isZoneSelected = (zoneName: string) => selectedZones.includes(zoneName);

  const handleZoneClick = (zoneName: string) => {
    if (onZoneSelect) {
      onZoneSelect(zoneName);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">{venueName || "Venue Map"}</CardTitle>
          </div>
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          )}
        </div>
        <CardDescription>
          {zones.length > 0
            ? `${zones.length} zones available`
            : "No zone data available"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Static Map Image */}
        {staticMapUrl && !imageError ? (
          <div className="relative w-full aspect-[4/3] mb-4 rounded-lg overflow-hidden bg-muted">
            <Image
              src={staticMapUrl}
              alt={`${venueName || "Venue"} seating map`}
              fill
              className="object-contain"
              onError={() => setImageError(true)}
            />
          </div>
        ) : (
          <div className="w-full aspect-[4/3] mb-4 rounded-lg bg-muted flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MapPin className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No venue map available</p>
            </div>
          </div>
        )}

        {/* Zone List */}
        {zones.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Click zones to select for price comparison:
            </p>
            <div className="flex flex-wrap gap-2">
              {zones.map((zone) => {
                const selected = isZoneSelected(zone.zoneName);
                const hovered = hoveredZone === zone.zoneName;
                
                return (
                  <button
                    key={zone.zoneName}
                    type="button"
                    onClick={() => handleZoneClick(zone.zoneName)}
                    onMouseEnter={() => setHoveredZone(zone.zoneName)}
                    onMouseLeave={() => setHoveredZone(null)}
                    className={`
                      flex items-center gap-2 px-3 py-2 rounded-lg border transition-all
                      ${selected 
                        ? "border-primary bg-primary/10 ring-2 ring-primary ring-offset-1" 
                        : "border-border hover:border-primary/50 hover:bg-muted"
                      }
                      ${hovered ? "shadow-sm" : ""}
                    `}
                  >
                    {/* Color indicator */}
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: zone.colorHex || "#9CA3AF",
                      }}
                    />
                    
                    {/* Zone name */}
                    <span className="text-sm font-medium">{zone.zoneName}</span>
                    
                    {/* Price badge */}
                    {showPrices && zone.minPrice !== null && (
                      <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded">
                        ${zone.minPrice}
                      </span>
                    )}
                    
                    {/* Section count */}
                    {zone.sections.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ({zone.sections.length})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Zone data will be available after syncing prices
          </p>
        )}

        {/* Selected Zone Details */}
        {selectedZones.length > 0 && (
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <p className="text-sm font-medium mb-2">
              Selected Zones ({selectedZones.length}):
            </p>
            <div className="flex flex-wrap gap-1">
              {selectedZones.map((zoneName) => {
                const zone = zones.find(z => z.zoneName === zoneName);
                return (
                  <span
                    key={zoneName}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-primary/10 text-primary rounded"
                  >
                    {zone?.colorHex && (
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: zone.colorHex }}
                      />
                    )}
                    {zoneName}
                    {zone?.minPrice && <span className="text-muted-foreground">(${zone.minPrice})</span>}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
