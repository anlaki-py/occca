// MCP Config -- Load MCP server configurations from mcp.json

import { readFile, access } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { McpJsonConfigSchema, type McpServerConfig, type McpJsonConfig } from './types.js';

/**
 * Get the path to the global MCP config file (~/.occca/mcp.json).
 * @returns Absolute path to the global mcp.json file
 */
export function getGlobalMcpConfigPath(): string {
  return join(homedir(), '.occca', 'mcp.json');
}

/**
 * Get the path to the MCP config file.
 * Checks for mcp.json in the current working directory first,
 * then falls back to the global config at ~/.occca/mcp.json.
 * @returns Object with path and scope information, or null if not found
 */
export async function getMcpConfigPath(): Promise<{ path: string; scope: 'project' | 'global' } | null> {
  // Check project-local mcp.json first
  const cwd = process.cwd();
  const projectPath = join(cwd, 'mcp.json');
  
  try {
    await access(projectPath);
    return { path: projectPath, scope: 'project' };
  } catch {
    // Not found in project, check global
  }
  
  // Check global mcp.json
  const globalPath = getGlobalMcpConfigPath();
  
  try {
    await access(globalPath);
    return { path: globalPath, scope: 'global' };
  } catch {
    // Not found anywhere
    return null;
  }
}

/**
 * Load MCP server configurations from mcp.json.
 * Checks project-local mcp.json first, then falls back to ~/.occca/mcp.json.
 * @returns Object mapping server names to their configurations
 */
export async function loadMcpConfig(): Promise<Record<string, McpServerConfig>> {
  const configInfo = await getMcpConfigPath();
  
  if (!configInfo) {
    return {};
  }
  
  const { path: configPath, scope } = configInfo;
  
  try {
    const content = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    
    // Validate the config
    const result = McpJsonConfigSchema.safeParse(parsed);
    
    if (!result.success) {
      console.error('[MCP] Invalid mcp.json configuration:');
      for (const issue of result.error.issues) {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      }
      return {};
    }
    
    const serverCount = Object.keys(result.data.mcpServers).length;
    const scopeLabel = scope === 'project' ? 'project' : 'global';
    console.log(`[MCP] Loaded ${serverCount} server(s) from ${scopeLabel} config: ${configPath}`);
    
    // Expand environment variables in config values
    const expanded = expandEnvVars(result.data.mcpServers);
    
    return expanded;
  } catch (error) {
    console.error(`[MCP] Failed to load mcp.json: ${error}`);
    return {};
  }
}

/**
 * Expand environment variables in config values.
 * Supports ${VAR_NAME} syntax in command, args, url, and headers.
 */
function expandEnvVars(
  servers: Record<string, McpServerConfig>
): Record<string, McpServerConfig> {
  const expanded: Record<string, McpServerConfig> = {};
  
  for (const [name, config] of Object.entries(servers)) {
    expanded[name] = expandConfigEnvVars(config);
  }
  
  return expanded;
}

/**
 * Expand environment variables in a single config.
 */
function expandConfigEnvVars(config: McpServerConfig): McpServerConfig {
  switch (config.type) {
    case undefined:
    case 'stdio': {
      return {
        ...config,
        command: expandStringEnvVars(config.command),
        args: config.args.map(expandStringEnvVars),
        env: config.env
          ? Object.fromEntries(
              Object.entries(config.env).map(([k, v]) => [k, expandStringEnvVars(v)])
            )
          : undefined,
      };
    }
    case 'sse':
    case 'http':
    case 'ws': {
      return {
        ...config,
        url: expandStringEnvVars(config.url),
        headers: config.headers
          ? Object.fromEntries(
              Object.entries(config.headers).map(([k, v]) => [k, expandStringEnvVars(v)])
            )
          : undefined,
      };
    }
    default:
      return config;
  }
}

/**
 * Expand ${VAR_NAME} patterns in a string.
 */
function expandStringEnvVars(str: string): string {
  return str.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return process.env[varName] ?? '';
  });
}