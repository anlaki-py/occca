import fs from 'fs';
import path from 'path';
import type OpenAI from 'openai';
import { resolveFilePath, truncateOutput } from '../../utils/helpers.js';

const MAX_LINES = 2000;

export const fileReadTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'Read',
    description: `Reads a file from the local filesystem. You can access any file directly by using this tool.
Assume this tool is able to read all files on the machine. If the user provides a path to a file, assume that path is valid.

Usage:
- The file_path parameter must be an absolute path, not a relative path
- By default, it reads up to ${MAX_LINES} lines starting from the beginning of the file
- You can optionally specify a line offset and limit for long files
- Results are returned with line numbers (cat -n format)
- This tool can only read files, not directories. To read a directory, use the Bash tool with ls.`,
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute path to the file to read',
        },
        offset: {
          type: 'number',
          description: 'Optional line number to start reading from (1-indexed)',
        },
        limit: {
          type: 'number',
          description: 'Optional maximum number of lines to read',
        },
      },
      required: ['file_path'],
    },
  },
};

export async function executeFileRead(args: Record<string, unknown>): Promise<string> {
  const filePath = resolveFilePath(String(args.file_path || ''));
  const offset = Math.max(1, Number(args.offset) || 1);
  const limit = Number(args.limit) || MAX_LINES;

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return `Error: ${filePath} is a directory, not a file. Use the Bash tool with 'ls' or the LS tool to list directory contents.`;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const totalLines = lines.length;

    const startIdx = offset - 1;
    const endIdx = Math.min(startIdx + limit, totalLines);
    const selectedLines = lines.slice(startIdx, endIdx);

    const numbered = selectedLines
      .map((line, i) => `${String(startIdx + i + 1).padStart(6)}  ${line}`)
      .join('\n');

    let result = numbered;

    if (totalLines > endIdx) {
      result += `\n\n[File has ${totalLines} total lines. Showing lines ${offset} to ${endIdx}.]`;
    }

    if (!result.trim()) {
      result = '[File is empty]';
    }

    return truncateOutput(result);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return `Error: File not found: ${filePath}`;
    }
    return `Error reading file: ${err.message}`;
  }
}
