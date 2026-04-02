# MCP (Model Context Protocol) Implementation Guide

This document provides a comprehensive guide on how MCP (Model Context Protocol) tools are implemented in this codebase, with code examples and instructions for adding MCP support to your own CLI agent tool.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Components](#core-components)
4. [Implementation Details](#implementation-details)
5. [Code Examples](#code-examples)
6. [Integration Steps](#integration-steps)

---

## Overview

MCP is a protocol that allows external tools and servers to be dynamically discovered and invoked by an AI agent. The implementation in this codebase supports:

- **Multiple transport types**: stdio, SSE, HTTP, WebSocket
- **Dynamic tool discovery**: Tools are fetched from MCP servers at runtime
- **Resource management**: Servers can expose resources (files, data)
- **Prompts/Commands**: Servers can define prompt templates
- **OAuth authentication**: Support for OAuth-protected servers
- **Enterprise policy controls**: Allowlist/denylist for servers

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Agent                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────────────────────────┐ │
│  │  AppState       │    │  MCPConnectionManager (React)       │ │
│  │  - mcp.clients  │◄───│  - useManageMCPConnections()        │ │
│  │  - mcp.tools    │    │  - reconnectMcpServer()             │ │
│  │  - mcp.resources│    │  - toggleMcpServer()                │ │
│  └─────────────────┘    └─────────────────────────────────────┘ │
│                                │                                 │
│                                ▼                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    client.ts (Core MCP Logic)               ││
│  │  - connectToServer()     - fetchToolsForClient()            ││
│  │  - callMCPTool()         - fetchResourcesForClient()        ││
│  │  - ensureConnectedClient() - fetchCommandsForClient()       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                │                                 │
│                                ▼                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              @modelcontextprotocol/sdk                       ││
│  │  - Client (MCP Client)    - StdioClientTransport            ││
│  │  - SSEClientTransport     - StreamableHTTPClientTransport   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
         ┌───────────────────────────────────────────┐
         │           MCP Server (External)            │
         │  - Tools (e.g., "search", "create_issue")  │
         │  - Resources (files, data)                 │
         │  - Prompts (templates)                     │
         └───────────────────────────────────────────┘
```

---

## Core Components

### 1. Types (`services/mcp/types.ts`)

The type system defines the configuration schemas and connection states:

```typescript
// Transport types supported
export const TransportSchema = z.enum(['stdio', 'sse', 'sse-ide', 'http', 'ws', 'sdk'])

// Server configuration for stdio (local process)
export const McpStdioServerConfigSchema = z.object({
  type: z.literal('stdio').optional(),
  command: z.string().min(1, 'Command cannot be empty'),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).optional(),
})

// Server configuration for HTTP (remote)
export const McpHTTPServerConfigSchema = z.object({
  type: z.literal('http'),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  oauth: McpOAuthConfigSchema().optional(),
})

// Connection states
export type MCPServerConnection =
  | ConnectedMCPServer    // Successfully connected
  | FailedMCPServer       // Connection failed
  | NeedsAuthMCPServer    // Requires authentication
  | PendingMCPServer      // Waiting to connect
  | DisabledMCPServer     // User disabled
```

### 2. Client (`services/mcp/client.ts`)

The core MCP client handles connections, tool discovery, and execution:

```typescript
// Connect to an MCP server
export const connectToServer = memoize(async (
  name: string,
  serverRef: ScopedMcpServerConfig,
  serverStats?: ServerStats
): Promise<MCPServerConnection> => {
  // Create appropriate transport based on config type
  const transport = await createTransport(serverRef)
  
  // Create MCP client
  const client = new Client(
    { name: 'claude-code', version: VERSION },
    { capabilities: {} }
  )
  
  // Connect and initialize
  await client.connect(transport)
  const capabilities = await client.request(
    { method: 'initialize' },
    InitializeResultSchema
  )
  
  return {
    name,
    client,
    type: 'connected',
    capabilities,
    config: serverRef,
    cleanup: async () => { /* ... */ }
  }
})

// Fetch tools from a connected server
export const fetchToolsForClient = memoizeWithLRU(async (
  client: MCPServerConnection
): Promise<Tool[]> => {
  if (client.type !== 'connected') return []
  
  const result = await client.client.request(
    { method: 'tools/list' },
    ListToolsResultSchema
  )
  
  // Convert MCP tools to our Tool format
  return result.tools.map(tool => ({
    ...MCPTool,
    name: `mcp__${client.name}__${tool.name}`,
    mcpInfo: { serverName: client.name, toolName: tool.name },
    isMcp: true,
    async call(args, context, canUseTool, parentMessage, onProgress) {
      // Call the MCP tool
      const result = await callMCPTool({
        client: connectedClient,
        tool: tool.name,
        args,
        signal: context.abortController.signal
      })
      return { data: result.content }
    }
  }))
})
```

### 3. Connection Manager (`services/mcp/useManageMCPConnections.ts`)

React hook that manages MCP server lifecycle:

```typescript
export function useManageMCPConnections(
  dynamicMcpConfig: Record<string, ScopedMcpServerConfig> | undefined,
  isStrictMcpConfig = false,
) {
  const setAppState = useSetAppState()
  
  // Initialize servers as pending
  useEffect(() => {
    async function initializeServersAsPending() {
      const { servers } = await getClaudeCodeMcpConfigs(dynamicMcpConfig)
      
      setAppState(prevState => ({
        ...prevState,
        mcp: {
          ...prevState.mcp,
          clients: Object.entries(servers).map(([name, config]) => ({
            name,
            type: 'pending' as const,
            config,
          }))
        }
      }))
    }
    void initializeServersAsPending()
  }, [dynamicMcpConfig])
  
  // Connect to servers
  useEffect(() => {
    async function loadAndConnectMcpConfigs() {
      const configs = await getClaudeCodeMcpConfigs()
      await getMcpToolsCommandsAndResources(onConnectionAttempt, configs)
    }
    void loadAndConnectMcpConfigs()
  }, [])
  
  // Return reconnect and toggle functions
  return { reconnectMcpServer, toggleMcpServer }
}
```

### 4. MCPTool (`tools/MCPTool/MCPTool.ts`)

Base tool definition for MCP tools:

```typescript
export const MCPTool = buildTool({
  isMcp: true,
  name: 'mcp',
  maxResultSizeChars: 100_000,
  
  // Overridden by actual MCP tools
  async description() { return DESCRIPTION },
  async prompt() { return PROMPT },
  
  // Passthrough schema (MCP tools define their own)
  get inputSchema() {
    return z.object({}).passthrough()
  },
  
  get outputSchema() {
    return z.string().describe('MCP tool execution result')
  },
  
  // Permission handling
  async checkPermissions() {
    return {
      behavior: 'passthrough',
      message: 'MCPTool requires permission.',
    }
  },
})
```

---

## Implementation Details

### Transport Creation

The client supports multiple transport types:

```typescript
// From client.ts - creating transports based on config
async function createTransport(config: McpServerConfig): Promise<Transport> {
  switch (config.type) {
    case 'stdio':
    case undefined:
      // Spawn local process
      return new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: { ...process.env, ...config.env },
      })
      
    case 'sse':
      // Server-Sent Events
      return new SSEClientTransport(
        new URL(config.url),
        { requestInit: { headers: config.headers } }
      )
      
    case 'http':
      // Streamable HTTP
      return new StreamableHTTPClientTransport(
        new URL(config.url),
        { requestInit: { headers: config.headers } }
      )
      
    case 'ws':
      // WebSocket
      const ws = await createNodeWsClient(config.url, options)
      return new WebSocketTransport(ws)
  }
}
```

### Tool Name Convention

MCP tools use a namespaced naming convention:

```typescript
// From mcpStringUtils.ts
export function buildMcpToolName(serverName: string, toolName: string): string {
  return `mcp__${normalizeNameForMCP(serverName)}__${normalizeNameForMCP(toolName)}`
}

// Example: "mcp__github__create_issue"
```

### Configuration Loading

MCP servers are loaded from multiple sources with priority:

```typescript
// From config.ts
export async function getClaudeCodeMcpConfigs(): Promise<{
  servers: Record<string, ScopedMcpServerConfig>
  errors: PluginError[]
}> {
  // Priority order (lowest to highest):
  // 1. Plugin servers (dynamic)
  // 2. User-level config (~/.claude/mcp.json)
  // 3. Project-level config (.mcp.json)
  // 4. Local/project config
  // 5. Enterprise config (managed-mcp.json)
  
  const { servers: enterpriseServers } = getMcpConfigsByScope('enterprise')
  
  if (doesEnterpriseMcpConfigExist()) {
    // Enterprise has exclusive control
    return { servers: enterpriseServers, errors: [] }
  }
  
  const { servers: userServers } = getMcpConfigsByScope('user')
  const { servers: projectServers } = getMcpConfigsByScope('project')
  const { servers: localServers } = getMcpConfigsByScope('local')
  
  // Merge with priority
  const configs = Object.assign(
    {},
    userServers,
    projectServers,
    localServers,
  )
  
  return { servers: configs, errors: [] }
}
```

### Policy Filtering

Enterprise policy controls:

```typescript
// From config.ts
export function filterMcpServersByPolicy<T>(
  configs: Record<string, T>
): { allowed: Record<string, T>; blocked: string[] } {
  const allowed: Record<string, T> = {}
  const blocked: string[] = []
  
  for (const [name, config] of Object.entries(configs)) {
    if (isMcpServerAllowedByPolicy(name, config as McpServerConfig)) {
      allowed[name] = config
    } else {
      blocked.push(name)
    }
  }
  
  return { allowed, blocked }
}

function isMcpServerAllowedByPolicy(
  serverName: string,
  config?: McpServerConfig
): boolean {
  // Check denylist first (absolute precedence)
  if (isMcpServerDenied(serverName, config)) {
    return false
  }
  
  const settings = getMcpAllowlistSettings()
  if (!settings.allowedMcpServers) {
    return true // No restrictions
  }
  
  // Check if server matches allowlist entries
  // Supports name-based, command-based, and URL-based matching
  // ...
}
```

---

## Code Examples

### Example 1: Basic MCP Server Configuration

```json
// .mcp.json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "slack": {
      "type": "http",
      "url": "https://mcp.slack.com/v1",
      "oauth": {
        "clientId": "your-client-id",
        "authServerMetadataUrl": "https://slack.com/.well-known/oauth"
      }
    }
  }
}
```

### Example 2: Connecting to an MCP Server

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js'

async function connectToMCPServer() {
  // Create transport
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@anthropic-ai/mcp-server-github'],
  })
  
  // Create client
  const client = new Client(
    { name: 'my-agent', version: '1.0.0' },
    { capabilities: {} }
  )
  
  // Connect
  await client.connect(transport)
  
  // List tools
  const tools = await client.request(
    { method: 'tools/list' },
    ListToolsResultSchema
  )
  
  console.log('Available tools:', tools.tools.map(t => t.name))
  
  return client
}
```

### Example 3: Calling an MCP Tool

```typescript
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'

async function callMCPTool(
  client: Client,
  toolName: string,
  args: Record<string, unknown>
) {
  const result = await client.request(
    {
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    },
    CallToolResultSchema
  )
  
  if (result.isError) {
    throw new Error(`Tool ${toolName} failed: ${result.content}`)
  }
  
  // Process result content
  for (const block of result.content) {
    if (block.type === 'text') {
      console.log(block.text)
    } else if (block.type === 'image') {
      console.log(`Image: ${block.mimeType}`)
    }
  }
  
  return result
}
```

### Example 4: Handling Tool List Changes

```typescript
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'

// Register notification handler for tool list changes
client.setNotificationHandler(
  ToolListChangedNotificationSchema,
  async () => {
    console.log('Tool list changed, refreshing...')
    const tools = await client.request(
      { method: 'tools/list' },
      ListToolsResultSchema
    )
    // Update your tool registry
    updateToolRegistry(tools.tools)
  }
)
```

### Example 5: Creating a Custom Transport

```typescript
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { JSONRPCMessage, JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js'

class CustomTransport implements Transport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage) => void
  
  async start(): Promise<void> {
    // Initialize connection
  }
  
  async close(): Promise<void> {
    // Clean up connection
    this.onclose?.()
  }
  
  async send(message: JSONRPCMessage): Promise<void> {
    // Send message to server
    const json = JSON.stringify(message)
    // ... send via your protocol
  }
  
  // Call this when you receive a message
  private handleMessage(data: string): void {
    try {
      const message = JSONRPCMessageSchema.parse(JSON.parse(data))
      this.onmessage?.(message)
    } catch (error) {
      this.onerror?.(error as Error)
    }
  }
}
```

---

## Integration Steps

### Step 1: Install Dependencies

```bash
npm install @modelcontextprotocol/sdk
```

### Step 2: Define Configuration Schema

Create a configuration schema that matches your needs:

```typescript
// types.ts
import { z } from 'zod'

export const McpServerConfigSchema = z.union([
  z.object({
    type: z.literal('stdio'),
    command: z.string(),
    args: z.array(z.string()).default([]),
    env: z.record(z.string()).optional(),
  }),
  z.object({
    type: z.literal('http'),
    url: z.string().url(),
    headers: z.record(z.string()).optional(),
  }),
])

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>
```

### Step 3: Create Connection Manager

```typescript
// mcpClient.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

export class MCPConnectionManager {
  private clients: Map<string, Client> = new Map()
  
  async connect(name: string, config: McpServerConfig): Promise<void> {
    let transport
    
    switch (config.type) {
      case 'stdio':
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: config.env,
        })
        break
      // Handle other transport types...
    }
    
    const client = new Client(
      { name: 'my-agent', version: '1.0.0' },
      { capabilities: {} }
    )
    
    await client.connect(transport)
    this.clients.set(name, client)
  }
  
  async getTools(name: string): Promise<Tool[]> {
    const client = this.clients.get(name)
    if (!client) throw new Error(`Server ${name} not connected`)
    
    const result = await client.request(
      { method: 'tools/list' },
      ListToolsResultSchema
    )
    
    return result.tools.map(tool => this.convertToTool(name, tool))
  }
  
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const client = this.clients.get(serverName)
    if (!client) throw new Error(`Server ${serverName} not connected`)
    
    const result = await client.request(
      { method: 'tools/call', params: { name: toolName, arguments: args } },
      CallToolResultSchema
    )
    
    return result.content
  }
  
  private convertToTool(serverName: string, mcpTool: MCPToolDef): Tool {
    return {
      name: `mcp__${serverName}__${mcpTool.name}`,
      description: mcpTool.description || '',
      inputSchema: mcpTool.inputSchema,
      call: async (args, context) => {
        return this.callTool(serverName, mcpTool.name, args)
      },
    }
  }
}
```

### Step 4: Integrate with Agent

```typescript
// agent.ts
export class Agent {
  private mcpManager: MCPConnectionManager
  private tools: Tool[] = []
  
  async initialize(configs: Record<string, McpServerConfig>) {
    // Connect to all configured MCP servers
    for (const [name, config] of Object.entries(configs)) {
      await this.mcpManager.connect(name, config)
      const serverTools = await this.mcpManager.getTools(name)
      this.tools.push(...serverTools)
    }
  }
  
  async processMessage(message: string): Promise<string> {
    // Include MCP tools in tool definitions
    const response = await this.apiClient.messages.create({
      model: 'claude-3-opus',
      messages: [{ role: 'user', content: message }],
      tools: this.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })),
    })
    
    // Handle tool calls
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        const tool = this.tools.find(t => t.name === block.name)
        if (tool) {
          const result = await tool.call(block.input, this.context)
          // Return result to model...
        }
      }
    }
  }
}
```

### Step 5: Add Configuration Loading

```typescript
// configLoader.ts
import { readFile } from 'fs/promises'
import { join } from 'path'

export async function loadMcpConfig(): Promise<Record<string, McpServerConfig>> {
  const configPath = join(process.cwd(), '.mcp.json')
  
  try {
    const content = await readFile(configPath, 'utf-8')
    const config = JSON.parse(content)
    return McpJsonConfigSchema.parse(config).mcpServers
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {} // No config file
    }
    throw error
  }
}
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `services/mcp/types.ts` | Type definitions and schemas |
| `services/mcp/client.ts` | Core MCP client implementation |
| `services/mcp/config.ts` | Configuration loading and policy |
| `services/mcp/useManageMCPConnections.ts` | React hooks for connection management |
| `services/mcp/MCPConnectionManager.tsx` | React context for MCP state |
| `services/mcp/mcpStringUtils.ts` | Tool name parsing utilities |
| `tools/MCPTool/MCPTool.ts` | Base MCP tool definition |
| `utils/mcpWebSocketTransport.ts` | WebSocket transport implementation |
| `entrypoints/mcp.ts` | MCP server mode (expose tools via MCP) |

---

## Best Practices

1. **Error Handling**: Always handle connection failures gracefully and provide clear error messages.

2. **Timeouts**: Set appropriate timeouts for tool calls (default is ~27.8 hours, override with `MCP_TOOL_TIMEOUT` env var).

3. **Reconnection**: Implement exponential backoff for reconnection attempts.

4. **Resource Cleanup**: Always clean up transports and child processes on exit.

5. **Name Normalization**: Normalize server/tool names to be API-compatible (`^[a-zA-Z0-9_-]{1,64}$`).

6. **Caching**: Cache tool lists and resources to avoid repeated requests.

7. **Policy Compliance**: Respect enterprise allowlist/denylist configurations.

---

## Additional Resources

- [MCP Specification](https://modelcontextprotocol.io/)
- [@modelcontextprotocol/sdk Documentation](https://github.com/anthropics/modelcontextprotocol)
- [MCP Server Examples](https://github.com/anthropics/mcp-servers)
