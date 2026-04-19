# MCP (Model Context Protocol) Support

OCCCA supports MCP (Model Context Protocol) servers, allowing you to extend its capabilities with external tools and resources.

## Configuration

MCP servers are configured in a `mcp.json` file. OCCCA looks for this file in two locations:

1. **Project-local**: `./mcp.json` in the current working directory (takes precedence)
2. **Global**: `~/.occca/mcp.json` (fallback if no project config exists)

This allows you to have project-specific MCP servers while also maintaining a global configuration for tools you use across projects.

### Example Configuration

```json
{
  "mcpServers": {
    "context7": {
      "type": "http",
      "url": "https://mcp.context7.com/mcp"
    },
    "jina": {
      "type": "http",
      "url": "https://mcp.jina.ai/v1",
      "headers": {
        "Authorization": "Bearer your-api-key"
      }
    },
    "local-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-server-example"],
      "env": {
        "API_KEY": "${MY_API_KEY}"
      }
    }
  }
}
```

## Transport Types

### HTTP (Streamable HTTP)

For servers that support the MCP Streamable HTTP transport:

```json
{
  "mcpServers": {
    "my-server": {
      "type": "http",
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer token"
      }
    }
  }
}
```

### SSE (Server-Sent Events)

For servers that use Server-Sent Events:

```json
{
  "mcpServers": {
    "my-server": {
      "type": "sse",
      "url": "https://example.com/sse",
      "headers": {
        "Authorization": "Bearer token"
      }
    }
  }
}
```

### stdio (Local Process)

For local MCP servers that run as subprocesses:

```json
{
  "mcpServers": {
    "my-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-server-example"],
      "env": {
        "MY_API_KEY": "secret-key"
      }
    }
  }
}
```

### WebSocket

For servers that use WebSocket:

```json
{
  "mcpServers": {
    "my-server": {
      "type": "ws",
      "url": "wss://example.com/mcp",
      "headers": {
        "Authorization": "Bearer token"
      }
    }
  }
}
```

## Environment Variables

You can use environment variables in your configuration with the `${VAR_NAME}` syntax:

```json
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.github.com/mcp",
      "headers": {
        "Authorization": "Bearer ${GITHUB_TOKEN}"
      }
    }
  }
}
```

## Tool Naming

MCP tools are automatically namespaced with the prefix `mcp__<server-name>__<tool-name>`.

For example, if you have a server named `github` with a tool named `create_issue`, it will be exposed as:

```
mcp__github__create_issue
```

## Examples

### Context7 (No Auth Required)

Context7 provides AI-powered search and doesn't require authentication:

```json
{
  "mcpServers": {
    "context7": {
      "type": "http",
      "url": "https://mcp.context7.com/mcp"
    }
  }
}
```

### Jina AI Reader

Jina AI's MCP server requires an API key:

```json
{
  "mcpServers": {
    "jina": {
      "type": "http",
      "url": "https://mcp.jina.ai/v1",
      "headers": {
        "Authorization": "Bearer jina_your_api_key"
      }
    }
  }
}
```

## How It Works

1. **Startup**: When OCCCA starts, it reads `mcp.json` from the current directory
2. **Connection**: It connects to all configured MCP servers in parallel
3. **Discovery**: Tool definitions are fetched from each connected server
4. **Execution**: When the model calls an MCP tool, OCCCA routes the call to the appropriate server
5. **Cleanup**: On exit, all MCP connections are properly closed

## Troubleshooting

### Server Not Connecting

Check the console output for error messages:
- `Failed to connect to "server-name": <error>` - Connection issue
- `Failed to fetch tools from "server-name": <error>` - Tool discovery failed

### Tool Not Found

If you see `MCP server "name" not found`, ensure:
1. The server is configured in `mcp.json`
2. The server name matches exactly (case-sensitive)
3. The server successfully connected (check startup logs)

### Authentication Errors

For servers requiring authentication:
1. Ensure headers are correctly formatted
2. Use environment variables for sensitive tokens: `"Authorization": "Bearer ${MY_TOKEN}"`
3. Set the environment variable before running OCCCA

## Reference

For detailed implementation documentation, see `docs/reference/mcp/MCP.md`.