"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: Record<string, string[]>;
  className?: string;
  description?: string;
}

export function FileUpload({
  onFileSelect,
  accept = {
    "text/csv": [".csv"],
    "text/plain": [".txt"],
  },
  className,
  description = "CSV or TXT files",
}: FileUploadProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    multiple: false,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
        isDragActive
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-primary/50",
        className
      )}
    >
      <input {...getInputProps()} />
      <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
      {isDragActive ? (
        <p className="text-sm text-muted-foreground">Drop the file here...</p>
      ) : (
        <>
          <p className="text-sm font-medium">
            Drag & drop a file here, or click to select
          </p>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </>
      )}
    </div>
  );
}
