"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PaginationControlsProps {
  // Support both naming conventions
  page?: number;
  currentPage?: number;
  totalPages: number;
  pageSize?: number;
  itemsPerPage?: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export function PaginationControls({
  page,
  currentPage,
  totalPages = 1,
  pageSize,
  itemsPerPage,
  totalItems = 0,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
}: PaginationControlsProps) {
  // Support both naming conventions with fallbacks
  const safePageSize = pageSize || itemsPerPage || 25;
  const safePage = page || currentPage || 1;
  const safeTotalItems = totalItems || 0;
  
  const startItem = safeTotalItems === 0 ? 0 : (safePage - 1) * safePageSize + 1;
  const endItem = Math.min(safePage * safePageSize, safeTotalItems);

  return (
    <div className="flex items-center justify-between flex-wrap gap-4 mt-4">
      {/* Items info */}
      <div className="text-sm text-muted-foreground">
        Showing {startItem.toLocaleString()}-{endItem.toLocaleString()} of{" "}
        {safeTotalItems.toLocaleString()} items
      </div>

      <div className="flex items-center gap-4">
        {/* Page size selector - only show if onPageSizeChange is provided */}
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Per page:</span>
            <Select
              value={safePageSize.toString()}
              onValueChange={(value) => onPageSizeChange(parseInt(value, 10))}
            >
              <SelectTrigger className="w-[80px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Page navigation */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Page {safePage} of {Math.max(1, totalPages || 1)}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(safePage - 1)}
              disabled={safePage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(safePage + 1)}
              disabled={safePage >= (totalPages || 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
