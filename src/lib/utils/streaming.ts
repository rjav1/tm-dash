/**
 * Server-Sent Events (SSE) Streaming Utilities
 * 
 * Provides utilities for creating streaming API responses with progress updates.
 * Used by bulk import, sync, and other long-running operations.
 */

export interface StreamProgressEvent {
  type: "start" | "progress" | "complete" | "error";
  current?: number;
  total?: number;
  label?: string;
  success?: number;
  failed?: number;
  message?: string;
  item?: unknown;
}

/**
 * Create SSE-formatted data string
 */
export function formatSSE(data: StreamProgressEvent): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Get headers for SSE streaming response
 */
export function getStreamHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no", // Disable nginx buffering
  };
}

/**
 * Create a streaming response with progress updates
 * 
 * @param processor - Async generator that yields progress events
 * @returns Response object with SSE stream
 */
export function createStreamingResponse(
  processor: () => AsyncGenerator<StreamProgressEvent, void, unknown>
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      try {
        for await (const event of processor()) {
          controller.enqueue(encoder.encode(formatSSE(event)));
        }
      } catch (error) {
        const errorEvent: StreamProgressEvent = {
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        };
        controller.enqueue(encoder.encode(formatSSE(errorEvent)));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: getStreamHeaders(),
  });
}

/**
 * Helper to create a batch processor with streaming progress
 * 
 * @param items - Array of items to process
 * @param processor - Function to process each item
 * @param options - Processing options
 */
export async function* createBatchProcessor<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options?: {
    getLabel?: (item: T, index: number) => string;
    onSuccess?: (item: T, result: R, index: number) => void;
    onError?: (item: T, error: Error, index: number) => void;
  }
): AsyncGenerator<StreamProgressEvent, void, unknown> {
  const { getLabel, onSuccess, onError } = options || {};
  const total = items.length;
  
  // Emit start event
  yield {
    type: "start",
    total,
    label: `Processing ${total} items...`,
  };

  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const label = getLabel ? getLabel(item, i) : `Processing item ${i + 1}`;
    
    try {
      const result = await processor(item, i);
      successCount++;
      if (onSuccess) onSuccess(item, result, i);
      
      yield {
        type: "progress",
        current: i + 1,
        total,
        label,
        success: successCount,
        failed: failedCount,
      };
    } catch (error) {
      failedCount++;
      if (onError) onError(item, error instanceof Error ? error : new Error(String(error)), i);
      
      yield {
        type: "progress",
        current: i + 1,
        total,
        label: `Failed: ${label}`,
        success: successCount,
        failed: failedCount,
      };
    }
  }

  // Emit complete event
  yield {
    type: "complete",
    current: total,
    total,
    success: successCount,
    failed: failedCount,
    message: `Completed: ${successCount} succeeded, ${failedCount} failed`,
  };
}

/**
 * Simple progress emitter for manual control
 */
export class StreamProgressEmitter {
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private encoder = new TextEncoder();
  private total = 0;
  private current = 0;
  private successCount = 0;
  private failedCount = 0;

  createStream(): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start: (controller) => {
        this.controller = controller;
      },
    });
  }

  start(total: number, label?: string) {
    this.total = total;
    this.current = 0;
    this.successCount = 0;
    this.failedCount = 0;
    this.emit({ type: "start", total, label: label || `Processing ${total} items...` });
  }

  progress(current: number, label?: string, success = true) {
    this.current = current;
    if (success) {
      this.successCount++;
    } else {
      this.failedCount++;
    }
    this.emit({
      type: "progress",
      current,
      total: this.total,
      label,
      success: this.successCount,
      failed: this.failedCount,
    });
  }

  complete(message?: string) {
    this.emit({
      type: "complete",
      current: this.total,
      total: this.total,
      success: this.successCount,
      failed: this.failedCount,
      message: message || `Completed: ${this.successCount} succeeded, ${this.failedCount} failed`,
    });
    this.close();
  }

  error(message: string) {
    this.emit({ type: "error", message });
    this.close();
  }

  private emit(event: StreamProgressEvent) {
    if (this.controller) {
      this.controller.enqueue(this.encoder.encode(formatSSE(event)));
    }
  }

  private close() {
    if (this.controller) {
      this.controller.close();
      this.controller = null;
    }
  }

  getResponse(): Response {
    return new Response(this.createStream(), {
      headers: getStreamHeaders(),
    });
  }
}

/**
 * Parse SSE response stream on the client side
 * 
 * @param response - Fetch response with SSE stream
 * @param onEvent - Callback for each event
 */
export async function parseSSEStream(
  response: Response,
  onEvent: (event: StreamProgressEvent) => void
): Promise<void> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error("No response stream available");
  }

  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6)) as StreamProgressEvent;
          onEvent(data);
        } catch {
          // Ignore JSON parse errors for partial data
        }
      }
    }
  }
}
