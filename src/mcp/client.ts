// MCP Client -- Connect to MCP servers and call tools

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  ListToolsResultSchema,
  CallToolResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  McpServerConfig,
  McpStdioServerConfig,
  McpHTTPServerConfig,
  McpSSEServerConfig,
  McpWebSocketServerConfig,
  ConnectedMCPServer,
  MCPServerConnection,
  McpToolDefinition,
} from './types.js';
import { loadMcpConfig } from './config.js';

// Store for connected MCP servers
const connections: Map<string, MCPServerConnection> = new Map();

// Store for discovered MCP tools
const mcpTools: Map<string, { serverName: string; tool: McpToolDefinition }> = new Map();

/**
 * Get all connected MCP servers.
 */
export function getConnectedServers(): MCPServerConnection[] {
  return Array.from(connections.values());
}

/**
 * Get all discovered MCP tools.
 */
export function getMcpTools(): Array<{ serverName: string; tool: McpToolDefinition }> {
  return Array.from(mcpTools.values());
}

/**
 * Initialize MCP connections from mcp.json.
 * Connects to all configured servers and discovers their tools.
 */
export async function initializeMcp(): Promise<void> {
  const configs = await loadMcpConfig();
  
  if (Object.keys(configs).length === 0) {
    return;
  }
  
  console.log(`[MCP] Found ${Object.keys(configs).length} server(s) in mcp.json`);
  
  // Connect to all servers in parallel
  const results = await Promise.allSettled(
    Object.entries(configs).map(async ([name, config]) => {
      try {
        const connection = await connectToServer(name, config);
        connections.set(name, connection);
        return { name, connection };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[MCP] Failed to connect to "${name}": ${message}`);
        return {
          name,
          connection: {
            name,
            type: 'failed' as const,
            config,
            error: message,
          },
        };
      }
    })
  );
  
  // Collect failed connections
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      const { name, connection } = result.value;
      if (connection.type === 'failed') {
        connections.set(name, connection);
      }
    }
  }
  
  // Fetch tools from all connected servers in parallel
  await discoverTools();
}

/**
 * Connect to an MCP server.
 */
async function connectToServer(
  name: string,
  config: McpServerConfig
): Promise<ConnectedMCPServer> {
  const transport = await createTransport(config);
  
  const client = new Client(
    { name: 'occca', version: '1.0.0' },
    { capabilities: {} }
  );
  
  await client.connect(transport);
  
  // Create cleanup function
  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      await client.close();
    } catch {
      // Ignore cleanup errors
    }
  };
  
  return {
    client,
    name,
    type: 'connected',
    config,
    cleanup,
  };
}

/**
 * Create the appropriate transport based on config type.
 */
async function createTransport(config: McpServerConfig): Promise<Transport> {
  switch (config.type) {
    case undefined:
    case 'stdio': {
      const stdioConfig = config as McpStdioServerConfig;
      // Build env object with proper typing
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          env[key] = value;
        }
      }
      if (stdioConfig.env) {
        Object.assign(env, stdioConfig.env);
      }
      return new StdioClientTransport({
        command: stdioConfig.command,
        args: stdioConfig.args,
        env,
      });
    }
    
    case 'sse': {
      const sseConfig = config as McpSSEServerConfig;
      return new SSEClientTransport(
        new URL(sseConfig.url),
        { requestInit: { headers: sseConfig.headers } }
      );
    }
    
    case 'http': {
      const httpConfig = config as McpHTTPServerConfig;
      return new StreamableHTTPClientTransport(
        new URL(httpConfig.url),
        { requestInit: { headers: httpConfig.headers } }
      );
    }
    
    case 'ws': {
      const wsConfig = config as McpWebSocketServerConfig;
      // WebSocket transport requires custom implementation
      // For now, we'll use a WebSocket client
      const { WebSocketClientTransport } = await import('./websocket.js');
      return new WebSocketClientTransport(new URL(wsConfig.url), wsConfig.headers);
    }
    
    default:
      throw new Error(`Unknown transport type: ${(config as any).type}`);
  }
}

/**
 * Discover tools from all connected servers.
 */
async function discoverTools(): Promise<void> {
  for (const [name, connection] of connections) {
    if (connection.type !== 'connected') continue;
    
    try {
      const result = await connection.client.request(
        { method: 'tools/list' },
        ListToolsResultSchema
      );
      
      for (const tool of result.tools) {
        const fullName = `mcp__${name}__${tool.name}`;
        mcpTools.set(fullName, {
          serverName: name,
          tool: {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema as McpToolDefinition['inputSchema'],
          },
        });
      }
      
      console.log(`[MCP] Discovered ${result.tools.length} tool(s) from "${name}"`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[MCP] Failed to fetch tools from "${name}": ${message}`);
    }
  }
}

/**
 * Call an MCP tool.
 * @param serverName The name of the MCP server
 * @param toolName The name of the tool on that server
 * @param args The arguments to pass to the tool
 * @returns The tool result as a string
 */
export async function callMcpTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const connection = connections.get(serverName);
  
  if (!connection) {
    throw new Error(`MCP server "${serverName}" not found`);
  }
  
  if (connection.type !== 'connected') {
    throw new Error(`MCP server "${serverName}" is not connected (status: ${connection.type})`);
  }
  
  const result = await connection.client.request(
    {
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    },
    CallToolResultSchema
  );
  
  // Convert result content to string
  const textParts: string[] = [];
  
  for (const block of result.content) {
    if (block.type === 'text' && block.text) {
      textParts.push(block.text);
    } else if (block.type === 'image' && block.data) {
      textParts.push(`[Image: ${block.mimeType || 'unknown'}]`);
    } else if (block.type === 'resource') {
      textParts.push(`[Resource: ${JSON.stringify(block)}]`);
    }
  }
  
  const output = textParts.join('\n');
  
  if (result.isError) {
    throw new Error(`MCP tool "${toolName}" returned an error: ${output}`);
  }
  
  return output;
}

/**
 * Get a connected server by name.
 */
export function getServer(name: string): MCPServerConnection | undefined {
  return connections.get(name);
}

/**
 * Check if a tool name is an MCP tool.
 */
export function isMcpTool(toolName: string): boolean {
  return toolName.startsWith('mcp__');
}

/**
 * Parse an MCP tool name into server name and tool name.
 * @returns { serverName, toolName } or null if not an MCP tool name
 */
export function parseMcpToolName(toolName: string): { serverName: string; toolName: string } | null {
  if (!isMcpTool(toolName)) return null;
  
  const parts = toolName.split('__');
  if (parts.length !== 3) return null;
  
  return {
    serverName: parts[1]!,
    toolName: parts[2]!,
  };
}

/**
 * Clean up all MCP connections.
 */
export async function cleanupMcp(): Promise<void> {
  const cleanupPromises: Promise<void>[] = [];
  
  for (const connection of connections.values()) {
    if (connection.type === 'connected') {
      cleanupPromises.push(connection.cleanup());
    }
  }
  
  await Promise.allSettled(cleanupPromises);
  connections.clear();
  mcpTools.clear();
}