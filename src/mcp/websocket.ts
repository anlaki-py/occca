// WebSocket Transport for MCP -- Custom implementation for WebSocket connections

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { WebSocket } from 'ws';

/**
 * WebSocket client transport for MCP.
 * Implements the Transport interface from the MCP SDK.
 */
export class WebSocketClientTransport implements Transport {
  private url: URL;
  private headers: Record<string, string> | undefined;
  private ws: WebSocket | null = null;
  
  // Transport callbacks
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  
  constructor(url: URL, headers?: Record<string, string>) {
    this.url = url;
    this.headers = headers;
  }
  
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const options: { headers?: Record<string, string> } = {};
      if (this.headers) {
        options.headers = this.headers;
      }
      
      this.ws = new WebSocket(this.url.toString(), ['mcp'], options);
      
      this.ws.on('open', () => {
        resolve();
      });
      
      this.ws.on('error', (error) => {
        if (this.onerror) {
          this.onerror(error);
        }
        reject(error);
      });
      
      this.ws.on('close', () => {
        if (this.onclose) {
          this.onclose();
        }
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString()) as JSONRPCMessage;
          if (this.onmessage) {
            this.onmessage(message);
          }
        } catch (error) {
          if (this.onerror) {
            this.onerror(error instanceof Error ? error : new Error(String(error)));
          }
        }
      });
    });
  }
  
  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  
  async send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket is not connected'));
        return;
      }
      
      this.ws.send(JSON.stringify(message), (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}