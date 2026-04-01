import { exec } from 'child_process';
import type OpenAI from 'openai';
import { getCwd, truncateOutput } from '../../utils/helpers.js';
import { getSecurityRipgrepArgs } from '../../constants/security.js';

export const grepTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'Grep',
    description: `Search tool for finding patterns in file contents. Respects .gitignore to keep results relevant.

Usage:
- ALWAYS use Grep for search tasks. NEVER invoke grep or rg as a Bash command.
- Supports regex syntax (e.g., "log.*Error", "function\\s+\\w+")
- Filter files with the include parameter (e.g., "*.js", "*.tsx")
- Returns matching lines with file paths and line numbers
- Results automatically exclude gitignored files (node_modules, dist, etc.)
- For open-ended searches requiring multiple rounds, consider breaking into steps`,
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The regex pattern to search for',
        },
        path: {
          type: 'string',
          description: 'Directory or file to search in. Defaults to current working directory.',
        },
        include: {
          type: 'string',
          description: 'Optional glob pattern to filter files (e.g., "*.ts", "*.py")',
        },
      },
      required: ['pattern'],
    },
  },
};

/**
 * Executes a grep search using ripgrep with .gitignore respect and security exclusions.
 * Falls back to findstr on Windows or grep on Unix if rg is not available.
 *
 * @param args - { pattern, path?, include? }
 * @returns formatted search results or error message
 */
export async function executeGrep(args: Record<string, unknown>): Promise<string> {
  const pattern = String(args.pattern || '');
  const searchPath = args.path ? String(args.path) : getCwd();
  const include = args.include ? String(args.include) : undefined;

  if (!pattern) {
    return 'Error: No search pattern provided.';
  }

  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const escapedPattern = pattern.replace(/"/g, '\\"');

    // Security exclusions applied to every search
    const securityArgs = getSecurityRipgrepArgs();
    const securityFlags = securityArgs.map(arg => `"${arg}"`).join(' ');

    // Build the include filter if specified
    const includeArg = include ? `--glob "${include}"` : '';

    // --hidden: search dotfiles (e.g. .env) unless they're gitignored
    // No --no-ignore: ripgrep respects .gitignore by default (clean search)
    // Security globs: always exclude dangerous files/dirs
    let command: string;
    if (isWindows) {
      command = `rg --no-heading --line-number --color never --hidden ${includeArg} ${securityFlags} "${escapedPattern}" "${searchPath}" 2>nul || findstr /S /N /R "${escapedPattern}" "${searchPath}\\*"`;
    } else {
      command = `rg --no-heading --line-number --color never --hidden ${includeArg} ${securityFlags} "${escapedPattern}" "${searchPath}" 2>/dev/null || grep -rnI ${include ? `--include="${include}"` : ''} "${escapedPattern}" "${searchPath}"`;
    }

    exec(
      command,
      {
        cwd: getCwd(),
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30000,
        shell: isWindows ? 'cmd.exe' : '/bin/bash',
      },
      (error, stdout, stderr) => {
        if (error && !stdout) {
          if (error.code === 1) {
            resolve(`No matches found for pattern: ${pattern}`);
            return;
          }
          resolve(`Error searching: ${error.message}`);
          return;
        }

        const output = stdout.trim();
        if (!output) {
          resolve(`No matches found for pattern: ${pattern}`);
          return;
        }

        // Cap output at 200 lines to keep results manageable
        const lines = output.split('\n');
        const matchCount = lines.length;
        const maxLines = 200;

        let result: string;
        if (matchCount > maxLines) {
          result = lines.slice(0, maxLines).join('\n');
          result += `\n\n[${matchCount} total matches, showing first ${maxLines}]`;
        } else {
          result = output;
          result += `\n\n[${matchCount} match${matchCount !== 1 ? 'es' : ''}]`;
        }

        resolve(truncateOutput(result));
      }
    );
  });
}
