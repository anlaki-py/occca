import fs from 'fs';
import path from 'path';
import type OpenAI from 'openai';
import { resolveFilePath } from '../../utils/helpers.js';

export const fileWriteTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'Write',
    description: `Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.
- If this is an existing file, you MUST use the Read tool first to read the file's contents. This tool will fail if you did not read the file first.
- Prefer the Edit tool for modifying existing files -- it only sends the diff. Only use this tool to create new files or for complete rewrites.
- NEVER create documentation files (*.md) or README files unless explicitly requested by the user.
- The file_path must be an absolute path.
- Parent directories will be created automatically if they don't exist.`,
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute path to the file to write',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file',
        },
      },
      required: ['file_path', 'content'],
    },
  },
};

export async function executeFileWrite(args: Record<string, unknown>): Promise<string> {
  const filePath = resolveFilePath(String(args.file_path || ''));
  const content = String(args.content ?? '');

  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const existed = fs.existsSync(filePath);
    fs.writeFileSync(filePath, content, 'utf-8');

    const lines = content.split('\n').length;
    const bytes = Buffer.byteLength(content, 'utf-8');

    if (existed) {
      return `Successfully overwrote ${filePath} (${lines} lines, ${bytes} bytes)`;
    } else {
      return `Successfully created ${filePath} (${lines} lines, ${bytes} bytes)`;
    }
  } catch (err: any) {
    return `Error writing file: ${err.message}`;
  }
}
