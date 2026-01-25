"use client";

import { useState, useMemo } from "react";
import { Check, Grid, List, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface ZoneWithSections {
  zoneName: string;
  colorHex: string | null;
  sections: string[];
}

interface SectionSelectionGridProps {
  zones: ZoneWithSections[];
  selectedSections: string[];
  onSelectionChange: (selected: string[]) => void;
  filterByZone?: string | null;
  compact?: boolean;
}

export function SectionSelectionGrid({
  zones,
  selectedSections,
  onSelectionChange,
  filterByZone = null,
  compact = false,
}: SectionSelectionGridProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Filter zones and sections
  const filteredZones = useMemo(() => {
    let result = zones;
    
    // Filter by zone if specified
    if (filterByZone) {
      result = result.filter((z) => z.zoneName === filterByZone);
    }
    
    // Filter sections by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result
        .map((zone) => ({
          ...zone,
          sections: zone.sections.filter((s) => s.toLowerCase().includes(query)),
        }))
        .filter((zone) => zone.sections.length > 0);
    }
    
    return result;
  }, [zones, filterByZone, searchQuery]);

  // Get all sections for selection operations
  const allSections = useMemo(() => {
    return filteredZones.flatMap((z) => z.sections);
  }, [filteredZones]);

  const handleSectionToggle = (section: string) => {
    if (selectedSections.includes(section)) {
      onSelectionChange(selectedSections.filter((s) => s !== section));
    } else {
      onSelectionChange([...selectedSections, section]);
    }
  };

  const handleSelectAllInZone = (zoneName: string) => {
    const zone = zones.find((z) => z.zoneName === zoneName);
    if (!zone) return;
    
    const allSelected = zone.sections.every((s) => selectedSections.includes(s));
    
    if (allSelected) {
      // Deselect all in zone
      onSelectionChange(selectedSections.filter((s) => !zone.sections.includes(s)));
    } else {
      // Select all in zone
      const newSelected = [...new Set([...selectedSections, ...zone.sections])];
      onSelectionChange(newSelected);
    }
  };

  const handleSelectAll = () => {
    if (selectedSections.length === allSections.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange([...new Set(allSections)]);
    }
  };

  const handleClearAll = () => {
    onSelectionChange([]);
  };

  // Count selected per zone
  const getZoneSelectionCount = (zoneName: string) => {
    const zone = zones.find((z) => z.zoneName === zoneName);
    if (!zone) return { selected: 0, total: 0 };
    return {
      selected: zone.sections.filter((s) => selectedSections.includes(s)).length,
      total: zone.sections.length,
    };
  };

  if (zones.length === 0 || allSections.length === 0) {
    return (
      <div className="text-center p-6 border rounded-lg bg-muted/20">
        <p className="text-sm text-muted-foreground">
          No section data available. Sync zone prices to load sections.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search sections..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* View Mode Toggle */}
        <div className="flex border rounded-md">
          <Button
            type="button"
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("grid")}
            className="rounded-r-none"
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="rounded-l-none"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>

        {/* Selection Actions */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSelectAll}
        >
          {selectedSections.length === allSections.length ? "Deselect All" : "Select All"}
        </Button>
        {selectedSections.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
          >
            Clear ({selectedSections.length})
          </Button>
        )}
      </div>

      {/* Sections by Zone */}
      <div className="space-y-4">
        {filteredZones.map((zone) => {
          const { selected, total } = getZoneSelectionCount(zone.zoneName);
          const allZoneSelected = selected === total;
          
          return (
            <div key={zone.zoneName} className="border rounded-lg overflow-hidden">
              {/* Zone Header */}
              <div
                className="flex items-center justify-between p-3 bg-muted/30 cursor-pointer hover:bg-muted/50"
                onClick={() => handleSelectAllInZone(zone.zoneName)}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: zone.colorHex || "#9CA3AF" }}
                  />
                  <span className="font-medium text-sm">{zone.zoneName}</span>
                  <Badge variant="outline" className="text-xs">
                    {total} sections
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {selected > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {selected} selected
                    </span>
                  )}
                  <span
                    className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                      allZoneSelected
                        ? "bg-primary border-primary text-primary-foreground"
                        : selected > 0
                        ? "bg-primary/20 border-primary"
                        : "border-muted-foreground/30"
                    }`}
                  >
                    {allZoneSelected && <Check className="h-3 w-3" />}
                    {!allZoneSelected && selected > 0 && (
                      <span className="w-2 h-2 bg-primary rounded-sm" />
                    )}
                  </span>
                </div>
              </div>

              {/* Sections Grid/List */}
              <div className={`p-3 ${viewMode === "grid" ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2" : "space-y-1"}`}>
                {zone.sections.map((section) => {
                  const isSelected = selectedSections.includes(section);
                  
                  return (
                    <button
                      key={section}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSectionToggle(section);
                      }}
                      className={`
                        flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all text-left w-full
                        ${isSelected
                          ? "bg-primary/10 border-primary border ring-1 ring-primary/30"
                          : "bg-muted/20 border border-transparent hover:border-muted-foreground/20 hover:bg-muted"
                        }
                      `}
                    >
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                          isSelected
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-muted-foreground/30"
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </span>
                      <span className={`truncate ${compact ? "text-xs" : "text-sm"}`}>
                        {section}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selection Summary */}
      {selectedSections.length > 0 && (
        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-sm font-medium mb-2">
            Selected Sections ({selectedSections.length}):
          </p>
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
            {selectedSections.map((section) => (
              <Badge
                key={section}
                variant="secondary"
                className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => handleSectionToggle(section)}
              >
                {section} &times;
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
