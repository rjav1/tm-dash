"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export interface ZoneOption {
  zoneName: string;
  colorHex: string | null;
  minPrice: number | null;
  sectionCount?: number;
}

interface ZoneFilterPanelProps {
  zones: ZoneOption[];
  selectedZones: string[];
  onSelectionChange: (selected: string[]) => void;
  showPrices?: boolean;
  title?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export function ZoneFilterPanel({
  zones,
  selectedZones,
  onSelectionChange,
  showPrices = true,
  title = "Filter by Zone",
  collapsible = true,
  defaultExpanded = true,
}: ZoneFilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleZoneToggle = (zoneName: string) => {
    if (selectedZones.includes(zoneName)) {
      onSelectionChange(selectedZones.filter((z) => z !== zoneName));
    } else {
      onSelectionChange([...selectedZones, zoneName]);
    }
  };

  const handleSelectAll = () => {
    if (selectedZones.length === zones.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(zones.map((z) => z.zoneName));
    }
  };

  const handleClearAll = () => {
    onSelectionChange([]);
  };

  // Calculate summary stats
  const selectedCount = selectedZones.length;
  const totalCount = zones.length;
  const selectedMinPrice = zones
    .filter((z) => selectedZones.includes(z.zoneName) && z.minPrice !== null)
    .map((z) => z.minPrice!)
    .sort((a, b) => a - b)[0] || null;

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className={`flex items-center justify-between p-3 bg-muted/50 ${
          collapsible ? "cursor-pointer hover:bg-muted" : ""
        }`}
        onClick={() => collapsible && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{title}</span>
          {selectedCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
              {selectedCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedMinPrice !== null && (
            <span className="text-xs text-muted-foreground">
              from ${selectedMinPrice}
            </span>
          )}
          {collapsible && (
            isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )
          )}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-3 space-y-3">
          {/* Actions */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
            >
              {selectedZones.length === zones.length ? "Deselect All" : "Select All"}
            </Button>
            {selectedCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
              >
                Clear
              </Button>
            )}
          </div>

          {/* Zone List */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {zones.map((zone) => {
              const isSelected = selectedZones.includes(zone.zoneName);
              
              return (
                <div
                  key={zone.zoneName}
                  className={`flex items-center gap-3 p-2 rounded-md transition-colors ${
                    isSelected ? "bg-primary/5" : "hover:bg-muted"
                  }`}
                >
                  <Checkbox
                    id={`zone-${zone.zoneName}`}
                    checked={isSelected}
                    onCheckedChange={() => handleZoneToggle(zone.zoneName)}
                  />
                  
                  {/* Color indicator */}
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: zone.colorHex || "#9CA3AF",
                    }}
                  />
                  
                  <Label
                    htmlFor={`zone-${zone.zoneName}`}
                    className="flex-1 cursor-pointer text-sm"
                  >
                    {zone.zoneName}
                    {zone.sectionCount !== undefined && zone.sectionCount > 0 && (
                      <span className="text-muted-foreground ml-1">
                        ({zone.sectionCount} sections)
                      </span>
                    )}
                  </Label>
                  
                  {showPrices && zone.minPrice !== null && (
                    <span className="text-xs font-medium text-green-600 dark:text-green-400">
                      ${zone.minPrice}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary */}
          {selectedCount > 0 && (
            <div className="pt-2 border-t text-xs text-muted-foreground">
              {selectedCount} of {totalCount} zones selected
              {selectedMinPrice !== null && (
                <span className="ml-2">
                  | Lowest price: <span className="text-green-600 dark:text-green-400 font-medium">${selectedMinPrice}</span>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
