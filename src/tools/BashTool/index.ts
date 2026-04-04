import { exec, ChildProcess } from 'child_process';
import type OpenAI from 'openai';
import { getCwd, truncateOutput } from '../../utils/helpers.js';

export const bashTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'Bash',
    description: `Executes a shell command and returns its output.

On Windows, commands run in PowerShell. On macOS/Linux, commands run in bash.
The working directory persists between commands, but shell state does not.

IMPORTANT: Avoid using this tool to run cat, head, tail, sed, awk, find, grep, or echo commands unless explicitly instructed. Instead, use the appropriate dedicated tool:
 - File search: Use Glob (NOT find or ls)
 - Content search: Use Grep (NOT grep or rg)
 - Read files: Use Read (NOT cat/head/tail)
 - Edit files: Use Edit (NOT sed/awk)
 - Write files: Use Write (NOT echo >/cat <<EOF)

Instructions:
 - Always quote file paths with spaces using double quotes
 - Try to use absolute paths and avoid cd
 - You may specify an optional timeout in milliseconds (up to 600000ms / 10 minutes). Default timeout is 120000ms (2 minutes).
 - When issuing multiple independent commands, make multiple tool calls in parallel
 - If commands depend on each other, chain with appropriate operators (&& on bash, ; on PowerShell)
 - For git commands: prefer creating new commits rather than amending`,
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute. On Windows use PowerShell syntax.',
        },
        timeout: {
          type: 'number',
          description: 'Optional timeout in milliseconds (max 600000). Default: 120000.',
        },
      },
      required: ['command'],
    },
  },
};

export async function executeBash(args: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const command = String(args.command || '');
  const timeout = Math.min(Number(args.timeout) || 120000, 600000);

  if (!command.trim()) {
    return 'Error: No command provided.';
  }

  return new Promise((resolve) => {
    const cwd = getCwd();
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'powershell.exe' : '/bin/bash';

    const child = exec(
      command,
      {
        cwd,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        shell,
        env: { ...process.env, PAGER: 'cat' },
      },
      (error, stdout, stderr) => {
        let output = '';

        if (stdout) output += stdout;
        if (stderr) output += (output ? '\n' : '') + stderr;

        if (error) {
          if (error.killed) {
            output += `\n[Command timed out after ${timeout}ms]`;
          } else if (!output) {
            output = `Error: ${error.message}`;
          }
          if (error.code !== undefined) {
            output += `\n[Exit code: ${error.code}]`;
          }
        }

        if (!output.trim()) {
          output = '[No output]';
        }

        resolve(truncateOutput(output));
      }
    );

    // Kill the child process if the abort signal fires
    if (signal) {
      const onAbort = () => {
        child.kill('SIGTERM');
        // Give process a moment to clean up, then force kill
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 100);
      };

      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}
