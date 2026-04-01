/**
 * Security denylist for filesystem operations.
 * These files and directories are protected from model access (especially writes)
 * regardless of .gitignore settings.
 *
 * This acts as a "Safety Net" to prevent accidental modification of
 * sensitive configuration files and version control directories.
 */

/**
 * Dangerous files that should be excluded from searches and protected from writes.
 * These typically contain sensitive credentials or user-specific configurations.
 */
export const DANGEROUS_FILES: string[] = [
	'.env',
	'.env.local',
	'.env.development.local',
	'.env.test.local',
	'.env.production.local',
	'.gitconfig',
	'.bashrc',
	'.zshrc',
	'.mcp.json',
	'.claude.json',
	'credentials.json',
	'secrets.json',
	'.npmrc',
	'.pypirc',
	'.netrc',
	'.pgpass',
	'id_rsa',
	'id_ed25519',
	'.ssh',
];

/**
 * Dangerous directories that should be excluded from searches.
 * These contain version control data, IDE settings, or agent configurations.
 */
export const DANGEROUS_DIRECTORIES: string[] = [
	'.git',
	'.svn',
	'.hg',
	'.vscode',
	'.idea',
	'.claude',
	'.cursor',
];

/**
 * Generates ripgrep glob patterns to exclude dangerous files and directories.
 * Used by GrepTool to filter out sensitive paths.
 *
 * @returns string[] - Array of arguments like ["--glob", "!.git/*", "--glob", "!.env"]
 *
 * @example
 * const args = getSecurityIgnoreArgs();
 * // Returns: ["--glob", "!.git/*", "--glob", "!.svn/*", ..., "--glob", "!.env"]
 */
export function getSecurityIgnoreArgs(): string[] {
	const args: string[] = [];

	for (const dir of DANGEROUS_DIRECTORIES) {
		args.push('--glob', `!${dir}/*`);
	}

	for (const file of DANGEROUS_FILES) {
		args.push('--glob', `!${file}`);
	}

	return args;
}

/**
 * Generates fast-glob ignore patterns for the security denylist.
 * Used by GlobTool to filter out sensitive paths.
 *
 * @returns string[] - Array of glob patterns to ignore
 *
 * @example
 * const patterns = getSecurityExcludePatterns();
 * // Returns: [".git/**", ".svn/**", ..., ".env", "credentials.json"]
 */
export function getSecurityExcludePatterns(): string[] {
	const patterns: string[] = [];

	for (const dir of DANGEROUS_DIRECTORIES) {
		patterns.push(`${dir}/**`);
	}

	for (const file of DANGEROUS_FILES) {
		patterns.push(file);
	}

	return patterns;
}

/**
 * Checks if a file path matches the security denylist.
 * Used by file write/edit operations to prevent modification of sensitive files.
 *
 * @param filePath - The file path to check
 * @returns boolean - true if the path is in the denylist
 */
export function isPathInDenylist(filePath: string): boolean {
	const normalized = filePath.replace(/\\/g, '/');
	const basename = normalized.split('/').pop() || '';

	if (DANGEROUS_FILES.includes(basename)) {
		return true;
	}

	for (const dir of DANGEROUS_DIRECTORIES) {
		if (normalized.includes(`/${dir}/`) || normalized.startsWith(`${dir}/`)) {
			return true;
		}
	}

	return false;
}

/**
 * Checks if a directory name is in the dangerous directories list.
 *
 * @param dirName - The directory name to check
 * @returns boolean - true if the directory is dangerous
 */
export function isDangerousDirectory(dirName: string): boolean {
	return DANGEROUS_DIRECTORIES.includes(dirName);
}

/**
 * Checks if a file name is in the dangerous files list.
 *
 * @param fileName - The file name to check
 * @returns boolean - true if the file is dangerous
 */
export function isDangerousFile(fileName: string): boolean {
	return DANGEROUS_FILES.includes(fileName);
}
