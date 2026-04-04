import fs from 'fs';
import type OpenAI from 'openai';
import { resolveFilePath } from '../../utils/helpers.js';

export const fileEditTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'Edit',
    description: `Performs exact string replacements in files.

Usage:
- You must use the Read tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file.
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- The edit will FAIL if old_string is not found in the file, or if it is not unique. Provide enough surrounding context to make it unique, or use replace_all to change every instance.
- Use replace_all for renaming variables or replacing strings across the file.`,
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute path to the file to edit',
        },
        old_string: {
          type: 'string',
          description: 'The exact string to find and replace. Must match the file content exactly.',
        },
        new_string: {
          type: 'string',
          description: 'The replacement string',
        },
        replace_all: {
          type: 'boolean',
          description: 'If true, replace ALL occurrences of old_string. Default: false.',
        },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
  },
};

export async function executeFileEdit(args: Record<string, unknown>, _signal?: AbortSignal): Promise<string> {
  const filePath = resolveFilePath(String(args.file_path || ''));
  const oldString = String(args.old_string || '');
  const newString = String(args.new_string ?? '');
  const replaceAll = Boolean(args.replace_all);

  if (!oldString) {
    return 'Error: old_string cannot be empty.';
  }

  try {
    if (!fs.existsSync(filePath)) {
      return `Error: File not found: ${filePath}`;
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    let count = 0;
    let idx = -1;
    while ((idx = content.indexOf(oldString, idx + 1)) !== -1) {
      count++;
    }

    if (count === 0) {
      const trimmedOld = oldString.trim();
      if (trimmedOld && content.includes(trimmedOld)) {
        return `Error: old_string not found exactly as specified. A similar string exists but with different whitespace/indentation. Please use the Read tool to check the exact content, including whitespace.`;
      }
      return `Error: old_string not found in ${filePath}. Make sure it matches the file content exactly, including whitespace and indentation.`;
    }

    if (count > 1 && !replaceAll) {
      return `Error: old_string found ${count} times in ${filePath}. Provide more context to make it unique, or set replace_all to true to replace all occurrences.`;
    }

    let newContent: string;
    if (replaceAll) {
      newContent = content.split(oldString).join(newString);
    } else {
      const pos = content.indexOf(oldString);
      newContent = content.slice(0, pos) + newString + content.slice(pos + oldString.length);
    }

    fs.writeFileSync(filePath, newContent, 'utf-8');

    const replacements = replaceAll ? count : 1;
    return `Successfully edited ${filePath} (${replacements} replacement${replacements > 1 ? 's' : ''} made)`;
  } catch (err: any) {
    return `Error editing file: ${err.message}`;
  }
}
