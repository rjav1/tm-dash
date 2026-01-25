"use client";

import { useState, useMemo, useCallback } from "react";
import { X, Check, MapPin, Search, Grid, List, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export interface SectionDetail {
  sectionName: string;
  zoneName: string;
  zoneId: string;
  colorHex?: string;
  minPrice: number;
  imageUrl?: string;
  mapboxId?: string;
  rowRange?: string;
}

export interface ZoneInfo {
  zoneName: string;
  colorHex: string | null;
  minPrice: number | null;
  sections: string[];
  zoneId?: string;
}

interface SectionMapSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zones: ZoneInfo[];
  staticMapUrl: string | null;
  venueName: string;
  selectedSections: string[];
  onSelectionChange: (sections: string[]) => void;
  sectionDetails?: SectionDetail[];
}

export function SectionMapSelector({
  open,
  onOpenChange,
  zones,
  staticMapUrl,
  venueName,
  selectedSections,
  onSelectionChange,
  sectionDetails = [],
}: SectionMapSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());

  // Build section details map for quick lookup
  const sectionDetailsMap = useMemo(() => {
    const map = new Map<string, SectionDetail>();
    for (const detail of sectionDetails) {
      map.set(detail.sectionName, detail);
    }
    return map;
  }, [sectionDetails]);

  // Get all sections
  const allSections = useMemo(() => {
    return zones.flatMap((z) => z.sections);
  }, [zones]);

  // Filter zones and sections by search
  const filteredZones = useMemo(() => {
    if (!searchQuery) return zones;
    
    const query = searchQuery.toLowerCase();
    return zones
      .map((zone) => ({
        ...zone,
        sections: zone.sections.filter((s) => 
          s.toLowerCase().includes(query) || 
          zone.zoneName.toLowerCase().includes(query)
        ),
      }))
      .filter((zone) => zone.sections.length > 0);
  }, [zones, searchQuery]);

  // Get hovered section details
  const hoveredSectionDetail = useMemo(() => {
    if (!hoveredSection) return null;
    return sectionDetailsMap.get(hoveredSection) || null;
  }, [hoveredSection, sectionDetailsMap]);

  const toggleSection = useCallback((section: string) => {
    if (selectedSections.includes(section)) {
      onSelectionChange(selectedSections.filter((s) => s !== section));
    } else {
      onSelectionChange([...selectedSections, section]);
    }
  }, [selectedSections, onSelectionChange]);

  const toggleZone = useCallback((zoneName: string) => {
    const zone = zones.find((z) => z.zoneName === zoneName);
    if (!zone) return;
    
    const allSelected = zone.sections.every((s) => selectedSections.includes(s));
    if (allSelected) {
      onSelectionChange(selectedSections.filter((s) => !zone.sections.includes(s)));
    } else {
      onSelectionChange([...new Set([...selectedSections, ...zone.sections])]);
    }
  }, [zones, selectedSections, onSelectionChange]);

  const toggleZoneExpanded = useCallback((zoneName: string) => {
    setExpandedZones((prev) => {
      const next = new Set(prev);
      if (next.has(zoneName)) {
        next.delete(zoneName);
      } else {
        next.add(zoneName);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    onSelectionChange([...new Set(allSections)]);
  }, [allSections, onSelectionChange]);

  const clearAll = useCallback(() => {
    onSelectionChange([]);
  }, [onSelectionChange]);

  const handleConfirm = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1400px] h-[90vh] max-h-[900px] p-0 gap-0">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Select Sections - {venueName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-1 overflow-hidden">
          {/* Left side - Map */}
          <div className="w-1/2 border-r flex flex-col">
            <div className="p-3 border-b bg-muted/30">
              <p className="text-sm text-muted-foreground">
                Venue Map - Click sections in the list or use the map for reference
              </p>
            </div>
            <div className="flex-1 relative overflow-hidden bg-slate-100">
              {staticMapUrl ? (
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <img
                    src={staticMapUrl}
                    alt={`${venueName} seating map`}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                  />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  <p>No map available</p>
                </div>
              )}
              
              {/* Section preview overlay */}
              {hoveredSectionDetail?.imageUrl && (
                <div className="absolute bottom-4 right-4 w-64 bg-white rounded-lg shadow-xl border overflow-hidden">
                  <div className="p-2 bg-muted/50 border-b">
                    <p className="font-medium text-sm">{hoveredSectionDetail.sectionName}</p>
                    <p className="text-xs text-muted-foreground">
                      {hoveredSectionDetail.zoneName} • ${hoveredSectionDetail.minPrice}
                    </p>
                  </div>
                  <img 
                    src={hoveredSectionDetail.imageUrl} 
                    alt={`View from ${hoveredSectionDetail.sectionName}`}
                    className="w-full h-32 object-cover"
                  />
                </div>
              )}
            </div>
            
            {/* Zone legend */}
            <div className="p-3 border-t bg-muted/30">
              <p className="text-xs font-medium mb-2">Zone Legend:</p>
              <div className="flex flex-wrap gap-2">
                {zones.map((zone) => (
                  <div
                    key={zone.zoneName}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <span
                      className="w-3 h-3 rounded-full border"
                      style={{ backgroundColor: zone.colorHex || "#9CA3AF" }}
                    />
                    <span>{zone.zoneName}</span>
                    {zone.minPrice && (
                      <span className="text-muted-foreground">${zone.minPrice}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          {/* Right side - Section selection */}
          <div className="w-1/2 flex flex-col">
            {/* Controls */}
            <div className="p-3 border-b space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search sections..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                
                <div className="flex border rounded-md">
                  <Button
                    type="button"
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("grid")}
                    className="rounded-r-none h-9"
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("list")}
                    className="rounded-l-none h-9"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectAll}
                  >
                    Select All
                  </Button>
                  {selectedSections.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearAll}
                    >
                      Clear ({selectedSections.length})
                    </Button>
                  )}
                </div>
                <Badge variant="secondary">
                  {selectedSections.length} / {allSections.length} selected
                </Badge>
              </div>
            </div>
            
            {/* Sections list */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-3 space-y-3">
                {filteredZones.map((zone) => {
                  const isExpanded = expandedZones.has(zone.zoneName) || searchQuery.length > 0;
                  const selectedCount = zone.sections.filter((s) => 
                    selectedSections.includes(s)
                  ).length;
                  const allSelected = selectedCount === zone.sections.length;
                  
                  return (
                    <div
                      key={zone.zoneName}
                      className="border rounded-lg overflow-hidden"
                    >
                      {/* Zone header */}
                      <div
                        className="flex items-center justify-between p-3 bg-muted/30 cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleZoneExpanded(zone.zoneName)}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-4 h-4 rounded-full border"
                            style={{ backgroundColor: zone.colorHex || "#9CA3AF" }}
                          />
                          <span className="font-medium">{zone.zoneName}</span>
                          <Badge variant="outline" className="text-xs">
                            {zone.sections.length} sections
                          </Badge>
                          {zone.minPrice && (
                            <span className="text-sm text-muted-foreground">
                              from ${zone.minPrice}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {selectedCount > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {selectedCount} selected
                            </span>
                          )}
                          <Button
                            type="button"
                            variant={allSelected ? "default" : "outline"}
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleZone(zone.zoneName);
                            }}
                          >
                            {allSelected ? "Deselect Zone" : "Select Zone"}
                          </Button>
                        </div>
                      </div>
                      
                      {/* Sections grid */}
                      {isExpanded && (
                        <div className={`p-3 ${
                          viewMode === "grid" 
                            ? "grid grid-cols-2 sm:grid-cols-3 gap-2" 
                            : "space-y-1"
                        }`}>
                          {zone.sections.map((section) => {
                            const isSelected = selectedSections.includes(section);
                            const detail = sectionDetailsMap.get(section);
                            
                            return (
                              <button
                                key={section}
                                type="button"
                                onClick={() => toggleSection(section)}
                                onMouseEnter={() => setHoveredSection(section)}
                                onMouseLeave={() => setHoveredSection(null)}
                                className={`
                                  flex items-center gap-2 px-3 py-2 rounded-md text-sm 
                                  transition-all text-left w-full relative
                                  ${isSelected
                                    ? "bg-primary/10 border-primary border-2 ring-1 ring-primary/30"
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
                                <div className="flex-1 min-w-0">
                                  <span className="truncate block">{section}</span>
                                  {detail && detail.minPrice > 0 && (
                                    <span className="text-xs text-muted-foreground">
                                      ${detail.minPrice}
                                      {detail.rowRange && ` • Rows ${detail.rowRange}`}
                                    </span>
                                  )}
                                </div>
                                {detail?.imageUrl && (
                                  <Eye className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Selected summary */}
            {selectedSections.length > 0 && (
              <div className="p-3 border-t bg-muted/50">
                <p className="text-sm font-medium mb-2">
                  Selected ({selectedSections.length}):
                </p>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {selectedSections.slice(0, 20).map((section) => (
                    <Badge
                      key={section}
                      variant="secondary"
                      className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => toggleSection(section)}
                    >
                      {section} ×
                    </Badge>
                  ))}
                  {selectedSections.length > 20 && (
                    <Badge variant="outline">
                      +{selectedSections.length - 20} more
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter className="p-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Confirm Selection ({selectedSections.length} sections)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
