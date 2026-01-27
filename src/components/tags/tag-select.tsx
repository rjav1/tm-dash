"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Tag, TagBadge } from "./tag-badge";

// Predefined color palette
const COLOR_PALETTE = [
  "#EF4444", // Red
  "#F97316", // Orange
  "#F59E0B", // Amber
  "#84CC16", // Lime
  "#22C55E", // Green
  "#10B981", // Emerald
  "#14B8A6", // Teal
  "#06B6D4", // Cyan
  "#0EA5E9", // Sky
  "#3B82F6", // Blue
  "#6366F1", // Indigo
  "#8B5CF6", // Violet
  "#A855F7", // Purple
  "#D946EF", // Fuchsia
  "#EC4899", // Pink
  "#6B7280", // Gray
];

interface TagSelectProps {
  type: "account" | "card" | "queue";
  selectedTags: Tag[];
  onTagsChange: (tags: Tag[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function TagSelect({
  type,
  selectedTags,
  onTagsChange,
  placeholder = "Select tags...",
  disabled = false,
  className,
}: TagSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTagColor, setNewTagColor] = useState(COLOR_PALETTE[0]);

  const fetchTags = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tags?type=${type}`);
      const data = await response.json();
      if (data.success) {
        setAvailableTags(data.tags);
      }
    } catch (error) {
      console.error("Failed to fetch tags:", error);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    if (open) {
      fetchTags();
    }
  }, [open, fetchTags]);

  const filteredTags = availableTags.filter((tag) =>
    tag.name.toLowerCase().includes(search.toLowerCase())
  );

  const isSelected = (tagId: string) =>
    selectedTags.some((t) => t.id === tagId);

  const toggleTag = (tag: Tag) => {
    if (isSelected(tag.id)) {
      onTagsChange(selectedTags.filter((t) => t.id !== tag.id));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  const createTag = async () => {
    if (!search.trim()) return;
    
    setCreating(true);
    try {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name: search.trim(),
          color: newTagColor,
        }),
      });
      const data = await response.json();
      
      if (data.success) {
        setAvailableTags((prev) => [...prev, data.tag]);
        onTagsChange([...selectedTags, data.tag]);
        setSearch("");
      }
    } catch (error) {
      console.error("Failed to create tag:", error);
    } finally {
      setCreating(false);
    }
  };

  const showCreateOption = search.trim() && !filteredTags.some(
    (t) => t.name.toLowerCase() === search.toLowerCase()
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-start", className)}
        >
          {selectedTags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {selectedTags.slice(0, 3).map((tag) => (
                <TagBadge key={tag.id} tag={tag} size="sm" />
              ))}
              {selectedTags.length > 3 && (
                <span className="text-xs text-muted-foreground">
                  +{selectedTags.length - 3} more
                </span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="space-y-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search or create..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          {/* Tag List */}
          <div className="max-h-48 overflow-y-auto space-y-1">
            {loading ? (
              <div className="text-center py-4 text-sm text-muted-foreground">
                Loading...
              </div>
            ) : filteredTags.length === 0 && !showCreateOption ? (
              <div className="text-center py-4 text-sm text-muted-foreground">
                No tags found
              </div>
            ) : (
              filteredTags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors",
                    isSelected(tag.id)
                      ? "bg-primary/10"
                      : "hover:bg-muted"
                  )}
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tag.color || "#6B7280" }}
                  />
                  <span className="flex-1 truncate">{tag.name}</span>
                  {isSelected(tag.id) && (
                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Create New Tag */}
          {showCreateOption && (
            <div className="border-t pt-2 space-y-2">
              <p className="text-xs text-muted-foreground">Create new tag:</p>
              <div className="flex gap-1">
                {COLOR_PALETTE.slice(0, 8).map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewTagColor(color)}
                    className={cn(
                      "w-5 h-5 rounded-full transition-transform",
                      newTagColor === color && "ring-2 ring-offset-1 ring-primary scale-110"
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <Button
                size="sm"
                onClick={createTag}
                disabled={creating}
                className="w-full"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create "{search}"
              </Button>
            </div>
          )}

          {/* Selected Tags */}
          {selectedTags.length > 0 && (
            <div className="border-t pt-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>{selectedTags.length} selected</span>
                <button
                  onClick={() => onTagsChange([])}
                  className="hover:text-foreground transition-colors"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {selectedTags.map((tag) => (
                  <TagBadge
                    key={tag.id}
                    tag={tag}
                    size="sm"
                    onRemove={() => toggleTag(tag)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface TagFilterProps {
  type: "account" | "card" | "queue";
  selectedTagIds: string[];
  onTagsChange: (tagIds: string[]) => void;
  className?: string;
}

export function TagFilter({
  type,
  selectedTagIds,
  onTagsChange,
  className,
}: TagFilterProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchTags = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/tags?type=${type}`);
        const data = await response.json();
        if (data.success) {
          setTags(data.tags);
        }
      } catch (error) {
        console.error("Failed to fetch tags:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchTags();
  }, [type]);

  const selectedTags = tags.filter((t) => selectedTagIds.includes(t.id));

  return (
    <TagSelect
      type={type}
      selectedTags={selectedTags}
      onTagsChange={(tags) => onTagsChange(tags.map((t) => t.id))}
      placeholder="Filter by tags..."
      className={className}
    />
  );
}
