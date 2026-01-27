"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Tag {
  id: string;
  name: string;
  color?: string | null;
}

interface TagBadgeProps {
  tag: Tag;
  onRemove?: () => void;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Get contrasting text color (black or white) based on background color
 */
function getContrastColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace("#", "");
  
  // Parse RGB values
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}

export function TagBadge({ tag, onRemove, size = "sm", className }: TagBadgeProps) {
  const bgColor = tag.color || "#6B7280";
  const textColor = getContrastColor(bgColor);
  
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        className
      )}
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 transition-colors"
        >
          <X className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} />
        </button>
      )}
    </span>
  );
}

interface TagListProps {
  tags: Tag[];
  onRemove?: (tagId: string) => void;
  maxDisplay?: number;
  size?: "sm" | "md";
  className?: string;
}

export function TagList({ tags, onRemove, maxDisplay = 3, size = "sm", className }: TagListProps) {
  const displayTags = maxDisplay ? tags.slice(0, maxDisplay) : tags;
  const remainingCount = tags.length - displayTags.length;
  
  if (tags.length === 0) {
    return <span className="text-muted-foreground text-xs">-</span>;
  }
  
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {displayTags.map((tag) => (
        <TagBadge
          key={tag.id}
          tag={tag}
          size={size}
          onRemove={onRemove ? () => onRemove(tag.id) : undefined}
        />
      ))}
      {remainingCount > 0 && (
        <span className={cn(
          "inline-flex items-center rounded-full bg-muted text-muted-foreground font-medium",
          size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
        )}>
          +{remainingCount}
        </span>
      )}
    </div>
  );
}
