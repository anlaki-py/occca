// MCP Types -- Configuration schemas and connection states

import { z } from 'zod';

// Transport types supported
export const TransportSchema = z.enum(['stdio', 'sse', 'http', 'ws']);

export type Transport = z.infer<typeof TransportSchema>;

// Server configuration for stdio (local process)
export const McpStdioServerConfigSchema = z.object({
  type: z.literal('stdio').optional(), // Optional for backwards compatibility
  command: z.string().min(1, 'Command cannot be empty'),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).optional(),
});

// Server configuration for SSE (Server-Sent Events)
export const McpSSEServerConfigSchema = z.object({
  type: z.literal('sse'),
  url: z.string().url('Invalid URL'),
  headers: z.record(z.string(), z.string()).optional(),
});

// Server configuration for HTTP (Streamable HTTP)
export const McpHTTPServerConfigSchema = z.object({
  type: z.literal('http'),
  url: z.string().url('Invalid URL'),
  headers: z.record(z.string(), z.string()).optional(),
});

// Server configuration for WebSocket
export const McpWebSocketServerConfigSchema = z.object({
  type: z.literal('ws'),
  url: z.string().url('Invalid URL'),
  headers: z.record(z.string(), z.string()).optional(),
});

// Union of all server config types
export const McpServerConfigSchema = z.union([
  McpStdioServerConfigSchema,
  McpSSEServerConfigSchema,
  McpHTTPServerConfigSchema,
  McpWebSocketServerConfigSchema,
]);

export type McpStdioServerConfig = z.infer<typeof McpStdioServerConfigSchema>;
export type McpSSEServerConfig = z.infer<typeof McpSSEServerConfigSchema>;
export type McpHTTPServerConfig = z.infer<typeof McpHTTPServerConfigSchema>;
export type McpWebSocketServerConfig = z.infer<typeof McpWebSocketServerConfigSchema>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

// MCP JSON config file schema
export const McpJsonConfigSchema = z.object({
  mcpServers: z.record(z.string(), McpServerConfigSchema),
});

export type McpJsonConfig = z.infer<typeof McpJsonConfigSchema>;

// Connection states
export type ConnectedMCPServer = {
  client: import('@modelcontextprotocol/sdk/client/index.js').Client;
  name: string;
  type: 'connected';
  config: McpServerConfig;
  cleanup: () => Promise<void>;
};

export type FailedMCPServer = {
  name: string;
  type: 'failed';
  config: McpServerConfig;
  error?: string;
};

export type PendingMCPServer = {
  name: string;
  type: 'pending';
  config: McpServerConfig;
};

export type DisabledMCPServer = {
  name: string;
  type: 'disabled';
  config: McpServerConfig;
};

export type MCPServerConnection =
  | ConnectedMCPServer
  | FailedMCPServer
  | PendingMCPServer
  | DisabledMCPServer;

// MCP Tool definition from server
export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

// MCP Tool result
export interface McpToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
    [key: string]: unknown;
  }>;
  isError?: boolean;
}