import fg from 'fast-glob';
import type OpenAI from 'openai';
import { getCwd } from '../../utils/helpers.js';
import { getSecurityExcludePatterns } from '../../utils/filesystem.js';

export const globTool: OpenAI.Chat.Completions.ChatCompletionTool = {
	type: 'function',
	function: {
		name: 'Glob',
		description: `Fast file pattern matching tool that works with any codebase size.
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- Use this instead of 'find' or 'ls' via Bash
- By default ignores .gitignore (full discovery mode) - set respectGitignore=true to filter gitignored files
- Always excludes security-sensitive files and directories (.git, .env, credentials, etc.)`,
		parameters: {
			type: 'object',
			properties: {
				pattern: {
					type: 'string',
					description: 'Glob pattern to match files (e.g., "**/*.ts", "src/**/*.{js,jsx}")',
				},
				path: {
					type: 'string',
					description: 'Optional directory to search in. Defaults to the current working directory.',
				},
				respectGitignore: {
					type: 'boolean',
					description: 'If true, respects .gitignore rules. Default: false (full discovery mode). Set to true when you want cleaner results without build artifacts and dependencies.',
				},
			},
			required: ['pattern'],
		},
	},
};

export async function executeGlob(args: Record<string, unknown>): Promise<string> {
	const pattern = String(args.pattern || '');
	const searchPath = args.path ? String(args.path) : getCwd();
	const respectGitignore = args.respectGitignore === true;

	if (!pattern) {
		return 'Error: No pattern provided.';
	}

	try {
		const securityPatterns = getSecurityExcludePatterns();

		const baseIgnore = [...securityPatterns];

		const files = await fg(pattern, {
			cwd: searchPath,
			absolute: true,
			dot: true,
			onlyFiles: true,
			stats: true,
			suppressErrors: true,
			ignore: respectGitignore ? [...baseIgnore, '**/node_modules/**', '**/dist/**', '**/.git/**'] : baseIgnore,
		} as any);

		if (files.length === 0) {
			return `No files found matching pattern: ${pattern}`;
		}

		files.sort((a, b) => {
			const aTime = a.stats?.mtimeMs ?? 0;
			const bTime = b.stats?.mtimeMs ?? 0;
			return bTime - aTime;
		});

		const maxResults = 500;
		const results = files.slice(0, maxResults);
		const paths = results.map(f => f.path);

		let output = paths.join('\n');
		if (files.length > maxResults) {
			output += `\n\n[${files.length} total matches, showing first ${maxResults}]`;
		} else {
			output += `\n\n[${files.length} file${files.length !== 1 ? 's' : ''} found]`;
		}

		return output;
	} catch (err: any) {
		return `Error: ${err.message}`;
	}
}
