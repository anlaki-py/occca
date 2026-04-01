// Security denylist -- files and directories that are always excluded
// from search/discovery results regardless of .gitignore state.
// This is the "safety net" that prevents the model from accidentally
// reading or modifying its own config or sensitive system files.

/** Files that should never appear in search or glob results */
export const DANGEROUS_FILES: readonly string[] = [
  '.gitconfig',
  '.bashrc',
  '.zshrc',
  '.bash_profile',
  '.profile',
  '.mcp.json',
  '.claude.json',
  '.npmrc',       // may contain auth tokens
  '.env',         // handled by gitignore too, but double-safe
  '.env.local',
];

/** Directories that should always be excluded from search/glob results */
export const DANGEROUS_DIRECTORIES: readonly string[] = [
  '.git',
  '.vscode',
  '.idea',
  '.claude',
  '.svn',
  '.hg',
];

/**
 * Builds ripgrep --glob exclusion args for the security denylist.
 * Appended to every rg invocation to guarantee dangerous paths are excluded.
 *
 * @returns array of CLI args like ["--glob", "!.git/**", "--glob", "!.bashrc"]
 */
export function getSecurityRipgrepArgs(): string[] {
  const args: string[] = [];

  for (const dir of DANGEROUS_DIRECTORIES) {
    args.push('--glob', `!${dir}/**`);
  }
  for (const file of DANGEROUS_FILES) {
    args.push('--glob', `!${file}`);
  }

  return args;
}

/**
 * Builds fast-glob ignore patterns for the security denylist.
 * Used by GlobTool to exclude dangerous paths from file discovery results.
 *
 * @returns array of glob ignore patterns for dangerous files and directories
 */
export function getSecurityGlobExclusions(): string[] {
  const patterns: string[] = [];

  // Exclude dangerous directories at any depth
  for (const dir of DANGEROUS_DIRECTORIES) {
    patterns.push(`**/${dir}/**`);
  }
  // Exclude dangerous files at any depth
  for (const file of DANGEROUS_FILES) {
    patterns.push(`**/${file}`);
  }

  return patterns;
}
