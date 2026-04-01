import fs from 'fs';
import path from 'path';
import type OpenAI from 'openai';
import { resolveFilePath } from '../../utils/helpers.js';

export const listDirTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'LS',
    description: `Lists the contents of a directory. Returns files and subdirectories with their sizes and types. Use this for quick directory exploration instead of Bash 'ls'.`,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to the directory to list',
        },
      },
      required: ['path'],
    },
  },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export async function executeListDir(args: Record<string, unknown>): Promise<string> {
  const dirPath = resolveFilePath(String(args.path || '.'));

  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return `Error: ${dirPath} is not a directory.`;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    if (entries.length === 0) {
      return `[Empty directory: ${dirPath}]`;
    }

    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    const lines: string[] = [];
    for (const entry of sorted) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          let childCount = 0;
          try {
            childCount = fs.readdirSync(fullPath).length;
          } catch { /* permission denied */ }
          lines.push(`  ${entry.name}/  (${childCount} items)`);
        } else if (entry.isFile()) {
          const s = fs.statSync(fullPath);
          lines.push(`  ${entry.name}  ${formatSize(s.size)}`);
        } else if (entry.isSymbolicLink()) {
          lines.push(`  ${entry.name} -> [symlink]`);
        }
      } catch {
        lines.push(`  ${entry.name}  [access denied]`);
      }
    }

    return `${dirPath}:\n${lines.join('\n')}`;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return `Error: Directory not found: ${dirPath}`;
    }
    return `Error listing directory: ${err.message}`;
  }
}
