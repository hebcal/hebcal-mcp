import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { Request, Response } from "express";
import { EventEmitter } from "events"; // EventEmitter can be used to manage onclose, onerror, onmessage

export class SseServerTransport extends EventEmitter implements Transport {
  private res: Response | null = null;

  // Optional properties from Transport interface
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public onmessage?: (message: JSONRPCMessage, extra?: any) => void; // Adjust 'extra' as needed
  public sessionId?: string;

  constructor(req: Request, res: Response) {
    super();
    this.res = res;
    this.sessionId = req.headers['x-request-id']?.toString() || Math.random().toString(36).substring(2);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Useful for Nginx
    res.flushHeaders(); // flush the headers to establish SSE connection

    // Forward the 'close' event from the EventEmitter to the onclose callback
    this.on("closeInternal", () => {
      if (this.onclose) {
        this.onclose();
      }
    });

    // Forward the 'error' event from the EventEmitter to the onerror callback
    this.on("errorInternal", (error: Error) => {
      if (this.onerror) {
        this.onerror(error);
      }
    });

    req.on("close", () => {
      this.emit("closeInternal");
      this.res = null; // Clean up response object
    });

    // For SSE, incoming messages (requests from client to server) would typically
    // arrive via a separate HTTP request (e.g., POST) rather than through the event stream.
    // So, onmessage might not be directly triggered by data on this specific SSE connection.
    // However, the McpServer will set this, and we need to store it.
  }

  async start(): Promise<void> {
    // For SSE, the connection is already established by the HTTP request.
    // This method primarily needs to exist to satisfy the Transport interface.
    // We could emit a custom event or log if needed.
    console.log(`SSE Transport started for session: ${this.sessionId}`);
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.res || this.res.writableEnded) {
      console.error("SSE connection closed or not writable, cannot send message:", message);
      // Emitting an error might be appropriate here, or handling it based on SDK expectations
      this.emit("errorInternal", new Error("SSE connection not available for sending."));
      return Promise.reject(new Error("SSE connection not available for sending."));
    }
    try {
      this.res.write(`data: ${JSON.stringify(message)}\n\n`);
    } catch (error) {
      console.error("Error writing to SSE stream:", error);
      this.emit("errorInternal", error instanceof Error ? error : new Error(String(error)));
      return Promise.reject(error);
    }
    return Promise.resolve();
  }

  async close(): Promise<void> {
    if (this.res) {
      this.res.end();
      this.res = null;
      this.emit("closeInternal"); // Emit our internal event, which then calls onclose
    }
    return Promise.resolve();
  }

  // McpServer might call this
  setProtocolVersion?(version: string): void {
    console.log(`SSE Transport: Protocol version set to ${version}`);
    // Store or use the version if needed
  }
}
