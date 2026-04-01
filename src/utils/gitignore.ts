// Gitignore utility -- uses native git commands as the source of truth
// for determining whether files/dirs are ignored by .gitignore rules.

import { execFile, execFileSync } from 'child_process';
import { getCwd, getIsGit } from './helpers.js';

/**
 * Checks whether the current working directory is inside a git repository.
 * Thin wrapper around getIsGit() for semantic clarity in calling code.
 * @returns true if cwd is inside a git work tree
 */
export function isInsideGitRepo(): boolean {
  return getIsGit();
}

/**
 * Checks if a single file path is ignored by .gitignore rules.
 * Uses `git check-ignore` which correctly handles nested .gitignore
 * files, global git configuration, and all gitignore pattern syntax.
 *
 * @param filePath - absolute or relative path to check
 * @param cwd - working directory for the git command (defaults to agent cwd)
 * @returns true if the path is gitignored, false otherwise
 */
export async function isPathGitignored(filePath: string, cwd?: string): Promise<boolean> {
  const workDir = cwd || getCwd();

  return new Promise((resolve) => {
    // git check-ignore exits 0 if path IS ignored, 1 if NOT ignored
    execFile('git', ['check-ignore', '-q', filePath], { cwd: workDir }, (error) => {
      if (error) {
        // Exit code 1 = not ignored, any other error = treat as not ignored
        resolve(false);
        return;
      }
      // Exit code 0 = path is ignored
      resolve(true);
    });
  });
}

/**
 * Batch-checks multiple paths against .gitignore rules in a single subprocess.
 * Much more efficient than calling isPathGitignored() in a loop since it
 * spawns only one `git check-ignore` process for all paths.
 *
 * @param paths - array of file/dir paths to check
 * @param cwd - working directory for the git command (defaults to agent cwd)
 * @returns Set of paths that ARE gitignored
 */
export function batchCheckIgnored(paths: string[], cwd?: string): Set<string> {
  const workDir = cwd || getCwd();

  if (paths.length === 0) return new Set();

  try {
    // --stdin reads paths from stdin (one per line)
    // Exits 0 if at least one path is ignored, 1 if none are ignored
    const input = paths.join('\n');
    const result = execFileSync('git', ['check-ignore', '--stdin'], {
      cwd: workDir,
      input,
      encoding: 'utf-8',
      // stdio must allow stdin input and capture stdout
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Git on Windows outputs forward slashes but Node's path.join uses
    // backslashes, so we normalize everything to forward slashes for
    // consistent Set lookups across platforms.
    const ignoredPaths = result.trim().split('\n').filter(Boolean);
    return new Set(ignoredPaths.map(normalizePath));
  } catch (error: any) {
    // Exit code 1 = no paths are ignored (normal case)
    // Any other error = git not available or not a repo, return empty set
    if (error.stdout) {
      // Even on error, stdout may contain partial results
      const ignoredPaths = String(error.stdout).trim().split('\n').filter(Boolean);
      return new Set(ignoredPaths.map(normalizePath));
    }
    return new Set();
  }
}

/**
 * Normalizes a path returned by git into a clean forward-slash format.
 * On Windows, git wraps paths containing backslashes in double quotes
 * and escapes each backslash (e.g. "C:\\Users\\..." becomes '"C:\\\\Users\\\\..."').
 * This function strips the quotes, unescapes the backslashes, then
 * normalizes to forward slashes for consistent cross-platform Set lookups.
 *
 * @param p - raw path string from git check-ignore output
 * @returns cleaned path using forward slashes, no quotes
 */
function normalizePath(p: string): string {
  let cleaned = p.trim();

  // Strip surrounding double quotes that git adds on Windows
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }

  // Unescape doubled backslashes (git's quoting: \\ -> \)
  cleaned = cleaned.replace(/\\\\/g, '\\');

  // Normalize all backslashes to forward slashes
  return cleaned.replace(/\\/g, '/');
}
