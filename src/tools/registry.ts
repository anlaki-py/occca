// Tool registry -- central registration and lookup
// Mirrors Claude Code's src/tools.ts pattern

import type OpenAI from 'openai';
import type { ToolDefinition } from '../types/index.js';
import { bashTool, executeBash } from './BashTool/index.js';
import { fileReadTool, executeFileRead } from './FileReadTool/index.js';
import { fileWriteTool, executeFileWrite } from './FileWriteTool/index.js';
import { fileEditTool, executeFileEdit } from './FileEditTool/index.js';
import { globTool, executeGlob } from './GlobTool/index.js';
import { grepTool, executeGrep } from './GrepTool/index.js';
import { listDirTool, executeListDir } from './ListDirTool/index.js';
import {
  getMcpToolDefinitions,
  executeMcpTool,
  getMcpToolUserFacingName,
  isMcpTool,
} from './MCPTool/index.js';

const toolRegistry: Map<string, ToolDefinition> = new Map();

function register(tool: ToolDefinition): void {
  const name = tool.definition.function.name;
  toolRegistry.set(name, tool);
}

// Register all tools
register({ definition: bashTool, execute: executeBash, userFacingName: (args) => args?.command ? `Bash: ${String(args.command).slice(0, 60)}` : 'Bash' });
register({ definition: fileReadTool, execute: executeFileRead, userFacingName: (args) => args?.file_path ? `Read: ${String(args.file_path).split(/[/\\]/).pop()}` : 'Read' });
register({ definition: fileWriteTool, execute: executeFileWrite, userFacingName: (args) => args?.file_path ? `Write: ${String(args.file_path).split(/[/\\]/).pop()}` : 'Write' });
register({ definition: fileEditTool, execute: executeFileEdit, userFacingName: (args) => args?.file_path ? `Edit: ${String(args.file_path).split(/[/\\]/).pop()}` : 'Edit' });
register({ definition: globTool, execute: executeGlob, userFacingName: (args) => args?.pattern ? `Glob: ${args.pattern}` : 'Glob' });
register({ definition: grepTool, execute: executeGrep, userFacingName: (args) => args?.pattern ? `Grep: ${args.pattern}` : 'Grep' });
register({ definition: listDirTool, execute: executeListDir, userFacingName: (args) => args?.path ? `LS: ${String(args.path).split(/[/\\]/).pop() || args.path}` : 'LS' });

export function getAllTools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  // Get built-in tools
  const builtInTools = Array.from(toolRegistry.values()).map(t => t.definition);
  
  // Get MCP tools
  const mcpTools = getMcpToolDefinitions();
  
  return [...builtInTools, ...mcpTools];
}

export function getTool(name: string): ToolDefinition | undefined {
  // Check if it's an MCP tool
  if (isMcpTool(name)) {
    return {
      definition: {
        type: 'function',
        function: {
          name,
          description: 'MCP tool',
          parameters: { type: 'object' },
        },
      },
      execute: (args) => executeMcpTool(name, args),
      userFacingName: (args) => getMcpToolUserFacingName(name, args),
    };
  }
  
  return toolRegistry.get(name);
}

export function getToolNames(): string[] {
  const builtInNames = Array.from(toolRegistry.keys());
  // Note: MCP tool names are dynamically discovered, so we only return built-in names here
  return builtInNames;
}
