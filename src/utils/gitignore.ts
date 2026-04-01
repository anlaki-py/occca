import { execFile } from 'child_process';
import { getCwd } from './helpers.js';

/**
 * Uses the native git command to check if a path is ignored by .gitignore.
 * This is the "Source of Truth" because it handles nested .gitignore
 * files and global git configuration correctly.
 *
 * @param filePath - The file or directory path to check
 * @param cwd - The working directory (defaults to current working directory)
 * @returns Promise<boolean> - true if the path is gitignored, false otherwise
 */
export async function isPathGitignored(filePath: string, cwd?: string): Promise<boolean> {
	const workDir = cwd || getCwd();

	return new Promise((resolve) => {
		execFile('git', ['check-ignore', filePath], { cwd: workDir }, (error) => {
			if (error) {
				if (error.code === 1) {
					resolve(false);
				} else {
					resolve(false);
				}
			} else {
				resolve(true);
			}
		});
	});
}

/**
 * Synchronous version for use in filtering operations.
 * @param filePath - The file or directory path to check
 * @param cwd - The working directory (defaults to current working directory)
 * @returns boolean - true if the path is gitignored, false otherwise
 */
export function isPathGitignoredSync(filePath: string, cwd?: string): boolean {
	const workDir = cwd || getCwd();

	try {
		const { execFileSync } = require('child_process');
		execFileSync('git', ['check-ignore', filePath], { cwd: workDir, stdio: 'pipe' });
		return true;
	} catch (error: any) {
		if (error.status === 1) {
			return false;
		}
		return false;
	}
}

/**
 * Check if git is available in the current directory.
 * @returns boolean - true if inside a git repository
 */
export function isGitRepo(): boolean {
	const { execFileSync } = require('child_process');
	try {
		execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: getCwd(), stdio: 'pipe' });
		return true;
	} catch {
		return false;
	}
}
