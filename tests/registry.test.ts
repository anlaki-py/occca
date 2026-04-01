// Tests for src/tools/registry.ts
// Verifies tool registration, lookup, and naming functions

import { describe, it, expect } from 'vitest';
import { getAllTools, getTool, getToolNames } from '../src/tools/registry.js';

describe('Tool Registry', () => {
  const expectedTools = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'LS'];

  describe('getAllTools', () => {
    it('returns all registered tool definitions', () => {
      const tools = getAllTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(expectedTools.length);
    });

    it('each tool has the correct OpenAI function structure', () => {
      const tools = getAllTools();
      for (const tool of tools) {
        expect(tool.type).toBe('function');
        expect(tool.function).toBeDefined();
        expect(tool.function.name).toBeDefined();
        expect(tool.function.description).toBeDefined();
        expect(tool.function.parameters).toBeDefined();
      }
    });

    it('each tool has required parameters defined', () => {
      const tools = getAllTools();
      for (const tool of tools) {
        const params = tool.function.parameters as any;
        expect(params.type).toBe('object');
        expect(params.properties).toBeDefined();
      }
    });
  });

  describe('getTool', () => {
    it('returns the correct tool by name', () => {
      for (const name of expectedTools) {
        const tool = getTool(name);
        expect(tool).toBeDefined();
        expect(tool!.definition.function.name).toBe(name);
      }
    });

    it('returns undefined for unknown tool names', () => {
      const tool = getTool('NonExistentTool');
      expect(tool).toBeUndefined();
    });

    it('each tool has an execute function', () => {
      for (const name of expectedTools) {
        const tool = getTool(name);
        expect(tool!.execute).toBeInstanceOf(Function);
      }
    });

    it('each tool has a userFacingName function', () => {
      for (const name of expectedTools) {
        const tool = getTool(name);
        expect(tool!.userFacingName).toBeInstanceOf(Function);
      }
    });
  });

  describe('getToolNames', () => {
    it('returns all expected tool names', () => {
      const names = getToolNames();
      for (const expected of expectedTools) {
        expect(names).toContain(expected);
      }
    });

    it('returns the correct number of tools', () => {
      const names = getToolNames();
      expect(names.length).toBe(expectedTools.length);
    });
  });

  describe('userFacingName formatting', () => {
    it('Bash shows the command in its label', () => {
      const tool = getTool('Bash')!;
      const name = tool.userFacingName({ command: 'npm test' });
      expect(name).toContain('npm test');
    });

    it('Read shows the filename in its label', () => {
      const tool = getTool('Read')!;
      const name = tool.userFacingName({ file_path: '/path/to/file.ts' });
      expect(name).toContain('file.ts');
    });

    it('Write shows the filename in its label', () => {
      const tool = getTool('Write')!;
      const name = tool.userFacingName({ file_path: '/path/to/output.txt' });
      expect(name).toContain('output.txt');
    });

    it('Grep shows the pattern in its label', () => {
      const tool = getTool('Grep')!;
      const name = tool.userFacingName({ pattern: 'TODO' });
      expect(name).toContain('TODO');
    });

    it('Glob shows the pattern in its label', () => {
      const tool = getTool('Glob')!;
      const name = tool.userFacingName({ pattern: '**/*.ts' });
      expect(name).toContain('**/*.ts');
    });

    it('tools return default names when called with no args', () => {
      for (const toolName of expectedTools) {
        const tool = getTool(toolName)!;
        const name = tool.userFacingName();
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      }
    });
  });
});
