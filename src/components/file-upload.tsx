"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: Record<string, string[]>;
  className?: string;
  description?: string;
  disabled?: boolean;
}

export function FileUpload({
  onFileSelect,
  accept = {
    "text/csv": [".csv"],
    "text/plain": [".txt"],
  },
  className,
  description = "CSV or TXT files",
  disabled = false,
}: FileUploadProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0 && !disabled) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect, disabled]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    multiple: false,
    disabled,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
        disabled
          ? "border-muted-foreground/15 bg-muted/50 cursor-not-allowed opacity-60"
          : isDragActive
          ? "border-primary bg-primary/5 cursor-pointer"
          : "border-muted-foreground/25 hover:border-primary/50 cursor-pointer",
        className
      )}
    >
      <input {...getInputProps()} />
      {disabled ? (
        <>
          <Loader2 className="h-10 w-10 mx-auto mb-4 text-muted-foreground animate-spin" />
          <p className="text-sm text-muted-foreground">Processing...</p>
        </>
      ) : isDragActive ? (
        <>
          <Upload className="h-10 w-10 mx-auto mb-4 text-primary" />
          <p className="text-sm text-muted-foreground">Drop the file here...</p>
        </>
      ) : (
        <>
          <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
          <p className="text-sm font-medium">
            Drag & drop a file here, or click to select
          </p>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </>
      )}
    </div>
  );
}
