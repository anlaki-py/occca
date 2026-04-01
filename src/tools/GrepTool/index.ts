import { exec } from 'child_process';
import type OpenAI from 'openai';
import { getCwd, truncateOutput } from '../../utils/helpers.js';
import { getSecurityIgnoreArgs } from '../../utils/filesystem.js';

export const grepTool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: 'function',
	function: {
		name: 'Grep',
		description: `Search tool for finding patterns in file contents.

Usage:
- ALWAYS use Grep for search tasks. NEVER invoke grep or rg as a Bash command.
- Supports regex syntax (e.g., "log.*Error", "function\\s+\\w+")
- Filter files with the include parameter (e.g., "*.js", "*.tsx")
- Returns matching lines with file paths and line numbers
- For open-ended searches requiring multiple rounds, consider breaking into steps
- Respects .gitignore by default to reduce noise from build artifacts and dependencies
- Uses --hidden flag to search dotfiles that aren't gitignored`,
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

export async function executeGrep(args: Record<string, unknown>): Promise<string> {
	const pattern = String(args.pattern || '');
	const searchPath = args.path ? String(args.path) : getCwd();
	const include = args.include ? String(args.include) : undefined;

	if (!pattern) {
		return 'Error: No search pattern provided.';
	}

	return new Promise((resolve) => {
		const isWindows = process.platform === 'win32';

		let command: string;
		const escapedPattern = pattern.replace(/"/g, '\\"');

		if (isWindows) {
			const includeArg = include ? `--glob "${include}"` : '';
			command = `rg --no-heading --line-number --color never --hidden ${includeArg} "${escapedPattern}" "${searchPath}" 2>nul || findstr /S /N /R "${escapedPattern}" "${searchPath}\\*"`;
		} else {
			const securityArgs = getSecurityIgnoreArgs().join(' ');
			const includeArg = include ? `--glob "${include}"` : '';

			command = `rg --no-heading --line-number --color never --hidden ${securityArgs} ${includeArg} "${escapedPattern}" "${searchPath}" 2>/dev/null || grep -rnI --hidden ${include ? `--include="${include}"` : ''} "${escapedPattern}" "${searchPath}"`;
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
