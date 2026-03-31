// Tool execution display -- spinners, status indicators
// Extracted from ui.ts

import ora from 'ora';
import path from 'path';
import { c } from '../utils/theme.js';
import { TOOL_ARROW, CHECKMARK, CROSS, SPINNER_FRAMES, SPINNER_INTERVAL } from '../constants/figures.js';
import { getCwd } from '../utils/helpers.js';

let activeSpinner: ReturnType<typeof ora> | null = null;
let activeToolArgs: Record<string, unknown> = {};

/** Convert absolute path to relative (e.g. C:\Users\...\src\ui.ts -> src/ui.ts) */
function relativePath(filePath: string): string {
  const cwd = getCwd();
  const rel = path.relative(cwd, filePath);
  // Use forward slashes for consistency
  return rel.replace(/\\/g, '/');
}

function getToolColor(toolName: string): (s: string) => string {
  switch (toolName) {
    case 'Bash':  return c.bash;
    case 'Read':  return c.permission;
    case 'Write': return c.success;
    case 'Edit':  return c.warning;
    case 'Glob':  return c.suggestion;
    case 'Grep':  return c.suggestion;
    case 'LS':    return c.suggestion;
    default:      return c.brand;
  }
}

function getToolDetail(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'Bash': {
      const cmd = String(args.command || '').trim();
      const timeout = args.timeout ? ` (timeout: ${args.timeout}ms)` : '';
      return cmd.length > 120 ? cmd.slice(0, 117) + '...' + timeout : cmd + timeout;
    }
    case 'Read': {
      const fp = String(args.file_path || '');
      const rel = relativePath(fp);
      const lines = args.offset !== undefined
        ? ` [lines ${args.offset}-${Number(args.offset) + Number(args.limit || 0)}]`
        : '';
      return rel + lines;
    }
    case 'Write': {
      const fp = String(args.file_path || '');
      const rel = relativePath(fp);
      const content = String(args.content || '');
      const lineCount = content.split('\n').length;
      return `${rel} (${lineCount} lines)`;
    }
    case 'Edit': {
      const fp = String(args.file_path || '');
      return relativePath(fp);
    }
    case 'Glob': {
      const pattern = String(args.pattern || '');
      const dir = args.path ? ` in ${relativePath(String(args.path))}` : '';
      return pattern + dir;
    }
    case 'Grep': {
      const pattern = String(args.pattern || '');
      const dir = args.path ? ` in ${relativePath(String(args.path))}` : '';
      return pattern + dir;
    }
    case 'LS': {
      const p = String(args.path || getCwd());
      return relativePath(p) || '.';
    }
    default:
      return JSON.stringify(args).slice(0, 100);
  }
}

function getResultSummary(toolName: string, result: string): string {
  const lines = result.split('\n').filter(l => l.trim());

  switch (toolName) {
    case 'Bash': {
      const lineCount = lines.length;
      if (result.includes('[Exit code:')) {
        const code = result.match(/\[Exit code: (\d+)\]/)?.[1];
        return `exited ${code}, ${lineCount} lines`;
      }
      if (result === '[No output]') return 'no output';
      return `${lineCount} line${lineCount !== 1 ? 's' : ''} of output`;
    }
    case 'Read': {
      const lineCount = lines.length;
      return `${lineCount} line${lineCount !== 1 ? 's' : ''}`;
    }
    case 'Write':
      return result.startsWith('Error') ? result.slice(0, 80) : 'written';
    case 'Edit':
      return result.startsWith('Error') ? result.slice(0, 80) : 'applied';
    case 'Glob': {
      const matches = lines.length;
      return `${matches} match${matches !== 1 ? 'es' : ''}`;
    }
    case 'Grep': {
      const matches = lines.length;
      return `${matches} match${matches !== 1 ? 'es' : ''}`;
    }
    case 'LS': {
      const items = lines.length;
      return `${items} item${items !== 1 ? 's' : ''}`;
    }
    default: {
      const first = lines[0]?.slice(0, 80) || 'done';
      return first;
    }
  }
}

export function showToolStart(toolName: string, args: Record<string, unknown>): void {
  if (activeSpinner) {
    activeSpinner.stop();
  }

  activeToolArgs = args;
  const color = getToolColor(toolName);
  const detail = getToolDetail(toolName, args);

  activeSpinner = ora({
    text: color(`  ${toolName}`) + c.inactive(`  ${detail}`),
    prefixText: '',
    spinner: {
      interval: SPINNER_INTERVAL,
      frames: SPINNER_FRAMES as unknown as string[],
    },
    color: 'yellow',
  }).start();
}

export function showToolEnd(toolName: string, result: string): void {
  if (activeSpinner) {
    const color = getToolColor(toolName);
    const detail = getToolDetail(toolName, activeToolArgs);
    const summary = getResultSummary(toolName, result);
    const isError = result.startsWith('Error');

    activeSpinner.stopAndPersist({
      symbol: isError ? c.error(` ${CROSS}`) : c.success(` ${CHECKMARK}`),
      text: color(`  ${toolName}`) + c.inactive(`  ${detail}`) + c.inactive(`  ${TOOL_ARROW} `) + (isError ? c.error(summary) : c.inactive(summary)),
    });
    activeSpinner = null;

    // Show LS results inline
    if (toolName === 'LS' && !isError) {
      const lines = result.split('\n');
      // Skip the first line (directory path header)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]!.trim();
        if (!line) continue;
        if (line.endsWith('/') || line.includes('/  (')) {
          // Directory entry
          const name = line.split('/')[0]!.trim();
          const meta = line.match(/\((.+)\)/)?.[1] || '';
          console.log(c.suggestion(`       ${name}/`) + c.inactive(meta ? `  ${meta}` : ''));
        } else {
          // File entry
          const parts = line.split(/\s{2,}/);
          const name = parts[0]?.trim() || line;
          const size = parts[1]?.trim() || '';
          console.log(c.text(`       ${name}`) + c.inactive(size ? `  ${size}` : ''));
        }
      }
    }
  }
}

export function showToolError(toolName: string, error: string): void {
  if (activeSpinner) {
    const color = getToolColor(toolName);
    activeSpinner.stopAndPersist({
      symbol: c.error(` ${CROSS}`),
      text: color(`  ${toolName}`) + c.inactive(`  ${error}`),
    });
    activeSpinner = null;
  }
}
