"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ProgressStatus } from "@/components/ui/progress-bar";

export interface ProgressState {
  /** Current progress (item number or percentage) */
  current: number;
  /** Total items */
  total: number;
  /** Current item label */
  label: string;
  /** Operation status */
  status: ProgressStatus;
  /** When the operation started */
  startTime: Date | null;
  /** Success count */
  successCount: number;
  /** Failure count */
  failureCount: number;
  /** Error message if any */
  errorMessage: string | null;
}

const initialState: ProgressState = {
  current: 0,
  total: 0,
  label: "",
  status: "idle",
  startTime: null,
  successCount: 0,
  failureCount: 0,
  errorMessage: null,
};

export interface UseOperationProgressReturn {
  /** Current progress state */
  progress: ProgressState;
  /** Whether operation is in progress */
  isRunning: boolean;
  /** Calculated percentage (0-100) */
  percentage: number;
  /** Start a new operation */
  start: (total?: number, label?: string) => void;
  /** Update progress manually */
  update: (current: number, label?: string, success?: boolean) => void;
  /** Mark operation as complete */
  complete: (successCount?: number, failureCount?: number) => void;
  /** Mark operation as failed */
  fail: (errorMessage: string) => void;
  /** Cancel the operation */
  cancel: () => void;
  /** Reset to initial state */
  reset: () => void;
  /** Execute an SSE streaming request with automatic progress updates */
  executeStream: (
    url: string,
    options?: RequestInit & { 
      onItem?: (item: unknown) => void;
      onComplete?: (result: { success: number; failed: number }) => void;
      onError?: (error: Error) => void;
    }
  ) => Promise<{ success: number; failed: number }>;
  /** Execute a batch operation with progress updates */
  executeBatch: <T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    options?: {
      getLabel?: (item: T, index: number) => string;
      delayMs?: number;
      onItemComplete?: (item: T, result: R, success: boolean) => void;
    }
  ) => Promise<{ results: R[]; successCount: number; failureCount: number }>;
}

/**
 * Hook for managing operation progress state
 * Supports both SSE streaming and manual batch progress tracking
 */
export function useOperationProgress(): UseOperationProgressReturn {
  const [progress, setProgress] = useState<ProgressState>(initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isCancelledRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const isRunning = progress.status === "running";
  const percentage = progress.total > 0 
    ? Math.round((progress.current / progress.total) * 100) 
    : 0;

  const start = useCallback((total = 0, label = "") => {
    isCancelledRef.current = false;
    setProgress({
      current: 0,
      total,
      label,
      status: "running",
      startTime: new Date(),
      successCount: 0,
      failureCount: 0,
      errorMessage: null,
    });
  }, []);

  const update = useCallback((current: number, label?: string, success = true) => {
    setProgress((prev) => ({
      ...prev,
      current,
      label: label ?? prev.label,
      successCount: success ? prev.successCount + 1 : prev.successCount,
      failureCount: !success ? prev.failureCount + 1 : prev.failureCount,
    }));
  }, []);

  const complete = useCallback((successCount?: number, failureCount?: number) => {
    setProgress((prev) => ({
      ...prev,
      current: prev.total,
      status: "success",
      successCount: successCount ?? prev.successCount,
      failureCount: failureCount ?? prev.failureCount,
    }));
  }, []);

  const fail = useCallback((errorMessage: string) => {
    setProgress((prev) => ({
      ...prev,
      status: "error",
      errorMessage,
    }));
  }, []);

  const cancel = useCallback(() => {
    isCancelledRef.current = true;
    abortControllerRef.current?.abort();
    setProgress((prev) => ({
      ...prev,
      status: "cancelled",
    }));
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    isCancelledRef.current = false;
    setProgress(initialState);
  }, []);

  /**
   * Execute an SSE streaming request and update progress automatically
   */
  const executeStream = useCallback(async (
    url: string,
    options?: RequestInit & {
      onItem?: (item: unknown) => void;
      onComplete?: (result: { success: number; failed: number }) => void;
      onError?: (error: Error) => void;
    }
  ): Promise<{ success: number; failed: number }> => {
    const { onItem, onComplete, onError, ...fetchOptions } = options || {};
    
    abortControllerRef.current = new AbortController();
    isCancelledRef.current = false;
    
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response stream available");
      }

      let successCount = 0;
      let failedCount = 0;
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        if (isCancelledRef.current) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              
              switch (data.type) {
                case "start":
                  start(data.total, data.label || "Starting...");
                  break;
                  
                case "progress":
                  setProgress((prev) => ({
                    ...prev,
                    current: data.current,
                    total: data.total || prev.total,
                    label: data.label || prev.label,
                    successCount: data.success !== undefined ? successCount : prev.successCount,
                    failureCount: data.failed !== undefined ? failedCount : prev.failureCount,
                  }));
                  if (data.success !== undefined) successCount = data.success;
                  if (data.failed !== undefined) failedCount = data.failed;
                  if (data.item && onItem) onItem(data.item);
                  break;
                  
                case "complete":
                  successCount = data.success ?? successCount;
                  failedCount = data.failed ?? failedCount;
                  complete(successCount, failedCount);
                  if (onComplete) onComplete({ success: successCount, failed: failedCount });
                  break;
                  
                case "error":
                  fail(data.message || "Operation failed");
                  if (onError) onError(new Error(data.message));
                  break;
              }
            } catch {
              // Ignore JSON parse errors for partial data
            }
          }
        }
      }

      return { success: successCount, failed: failedCount };
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return { success: progress.successCount, failed: progress.failureCount };
      }
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      fail(errorMessage);
      if (onError) onError(error instanceof Error ? error : new Error(errorMessage));
      throw error;
    }
  }, [start, complete, fail, progress.successCount, progress.failureCount]);

  /**
   * Execute a batch operation with progress updates
   */
  const executeBatch = useCallback(async <T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    options?: {
      getLabel?: (item: T, index: number) => string;
      delayMs?: number;
      onItemComplete?: (item: T, result: R, success: boolean) => void;
    }
  ): Promise<{ results: R[]; successCount: number; failureCount: number }> => {
    const { getLabel, delayMs = 0, onItemComplete } = options || {};
    
    start(items.length, getLabel ? getLabel(items[0], 0) : "Starting...");
    
    const results: R[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < items.length; i++) {
      if (isCancelledRef.current) break;
      
      const item = items[i];
      const label = getLabel ? getLabel(item, i) : `Processing ${i + 1} of ${items.length}`;
      
      try {
        const result = await processor(item, i);
        results.push(result);
        successCount++;
        update(i + 1, label, true);
        if (onItemComplete) onItemComplete(item, result, true);
      } catch (error) {
        failureCount++;
        update(i + 1, label, false);
        if (onItemComplete) onItemComplete(item, error as R, false);
      }

      if (delayMs > 0 && i < items.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    if (!isCancelledRef.current) {
      complete(successCount, failureCount);
    }

    return { results, successCount, failureCount };
  }, [start, update, complete]);

  return {
    progress,
    isRunning,
    percentage,
    start,
    update,
    complete,
    fail,
    cancel,
    reset,
    executeStream,
    executeBatch,
  };
}
