import fs from 'fs';
import path from 'path';
import type OpenAI from 'openai';
import { resolveFilePath } from '../../utils/helpers.js';
import { isInsideGitRepo, batchCheckIgnored } from '../../utils/gitignore.js';
import { DANGEROUS_DIRECTORIES } from '../../constants/security.js';

export const listDirTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'LS',
    description: `Lists the contents of a directory. Returns files and subdirectories with their sizes and types. Respects .gitignore — hidden/ignored files are filtered out. Use this for quick directory exploration instead of Bash 'ls'.`,
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

/**
 * Formats a byte count into a human-readable size string.
 * @param bytes - raw byte count
 * @returns formatted string like "1.5 KB" or "3.2 MB"
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Executes a directory listing with .gitignore and security denylist filtering.
 * When inside a git repo, batch-checks all entries against .gitignore in a single
 * subprocess call for performance, then filters out ignored entries.
 *
 * @param args - { path: string }
 * @returns formatted directory listing or error message
 */
export async function executeListDir(args: Record<string, unknown>, _signal?: AbortSignal): Promise<string> {
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

    // Always remove security-denylisted directories (e.g. .git, .vscode)
    const securitySet = new Set(DANGEROUS_DIRECTORIES);
    let filtered = entries.filter(entry => !securitySet.has(entry.name));

    // If inside a git repo, batch-check all remaining entries against .gitignore
    let ignoredCount = 0;
    const inGitRepo = isInsideGitRepo();

    if (inGitRepo) {
      // Build paths for every entry — append '/' for directories so that
      // gitignore patterns like 'node_modules/' correctly match directory entries
      const entryPaths = filtered.map(entry => {
        const full = path.join(dirPath, entry.name);
        return entry.isDirectory() ? full + '/' : full;
      });
      const ignoredPaths = batchCheckIgnored(entryPaths, dirPath);

      const beforeCount = filtered.length;
      filtered = filtered.filter(entry => {
        // Normalize backslashes to forward slashes so lookups match
        // git's output on Windows (git always outputs forward slashes)
        const full = path.join(dirPath, entry.name).replace(/\\/g, '/');
        const fullDir = full + '/';
        return !ignoredPaths.has(full) && !ignoredPaths.has(fullDir);
      });
      // Track how many entries were hidden from the listing
      ignoredCount = beforeCount - filtered.length;
    }

    // Also count entries removed by security denylist
    const securityFiltered = entries.length - filtered.length - ignoredCount;

    // Sort directories first, then alphabetically
    const sorted = filtered.sort((a, b) => {
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

    let result = `${dirPath}:\n${lines.join('\n')}`;

    // Append summary of filtered entries so the model knows files were hidden
    const totalHidden = ignoredCount + securityFiltered;
    if (totalHidden > 0) {
      result += `\n\n[${totalHidden} item${totalHidden !== 1 ? 's' : ''} hidden by .gitignore/security rules]`;
    }

    return result;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return `Error: Directory not found: ${dirPath}`;
    }
    return `Error listing directory: ${err.message}`;
  }
}
