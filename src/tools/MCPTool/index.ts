// MCP Tool -- Wrapper for MCP server tools

import type OpenAI from 'openai';
import type { ToolFunction } from '../../types/index.js';
import { callMcpTool, parseMcpToolName, getMcpTools, getServer } from '../../mcp/client.js';
import type { McpToolDefinition } from '../../mcp/types.js';

/**
 * Build OpenAI tool definitions from all discovered MCP tools.
 * @returns Array of ChatCompletionTool objects for the OpenAI API
 */
export function getMcpToolDefinitions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  const tools = getMcpTools();
  
  return tools.map(({ serverName, tool }) => ({
    type: 'function' as const,
    function: {
      name: `mcp__${serverName}__${tool.name}`,
      description: tool.description || `MCP tool: ${tool.name}`,
      parameters: tool.inputSchema,
    },
  }));
}

/**
 * Execute an MCP tool call.
 * @param toolName The full MCP tool name (mcp__server__tool)
 * @param args The arguments to pass to the tool
 * @returns The tool result as a string
 */
export async function executeMcpTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const parsed = parseMcpToolName(toolName);
  
  if (!parsed) {
    throw new Error(`Invalid MCP tool name format: ${toolName}`);
  }
  
  const { serverName, toolName: actualToolName } = parsed;
  
  // Check server status
  const server = getServer(serverName);
  if (!server) {
    throw new Error(`MCP server "${serverName}" not found. Is it configured in mcp.json?`);
  }
  
  if (server.type === 'failed') {
    throw new Error(`MCP server "${serverName}" failed to connect: ${server.error || 'Unknown error'}`);
  }
  
  if (server.type === 'pending') {
    throw new Error(`MCP server "${serverName}" is still connecting. Please try again in a moment.`);
  }
  
  if (server.type === 'disabled') {
    throw new Error(`MCP server "${serverName}" is disabled.`);
  }
  
  return callMcpTool(serverName, actualToolName, args);
}

/**
 * Create a user-facing name for an MCP tool call.
 */
export function getMcpToolUserFacingName(toolName: string, args?: Record<string, unknown>): string {
  const parsed = parseMcpToolName(toolName);
  if (!parsed) return toolName;
  
  const { serverName, toolName: actualToolName } = parsed;
  
  // Try to show relevant args if available
  const firstArg = args ? Object.entries(args)[0] : null;
  if (firstArg) {
    const [key, value] = firstArg;
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    const truncated = valueStr.length > 40 ? valueStr.slice(0, 40) + '...' : valueStr;
    return `${serverName}: ${actualToolName} (${key}=${truncated})`;
  }
  
  return `${serverName}: ${actualToolName}`;
}

/**
 * Check if a tool name corresponds to an MCP tool.
 */
export function isMcpTool(toolName: string): boolean {
  return toolName.startsWith('mcp__');
}