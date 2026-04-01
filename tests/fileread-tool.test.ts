// Tests for src/tools/FileReadTool
// Verifies file reading, line numbering, offset/limit, and error handling

import { describe, it, expect } from 'vitest';
import { executeFileRead } from '../src/tools/FileReadTool/index.js';
import { getCwd } from '../src/utils/helpers.js';
import path from 'path';

describe('FileReadTool', () => {
  const pkgPath = path.join(getCwd(), 'package.json');

  describe('basic reading', () => {
    it('reads an existing file successfully', async () => {
      const result = await executeFileRead({ file_path: pkgPath });
      expect(result).toContain('occca');
      expect(result).not.toContain('Error');
    });

    it('returns numbered lines (cat -n format)', async () => {
      const result = await executeFileRead({ file_path: pkgPath });
      // Line numbers are right-padded with spaces
      expect(result).toMatch(/\s+1\s+/);
    });

    it('returns error for non-existent files', async () => {
      const fakePath = path.join(getCwd(), 'nonexistent_xyzzy.txt');
      const result = await executeFileRead({ file_path: fakePath });
      expect(result).toContain('Error');
      expect(result).toContain('not found');
    });

    it('returns error when given a directory', async () => {
      const result = await executeFileRead({ file_path: getCwd() });
      expect(result).toContain('Error');
      expect(result).toContain('directory');
    });
  });

  describe('offset and limit', () => {
    it('starts reading from a specific offset', async () => {
      const result = await executeFileRead({ file_path: pkgPath, offset: 3 });
      // First line number should be 3
      const firstLine = result.split('\n')[0]!;
      expect(firstLine).toMatch(/\s+3\s+/);
    });

    it('limits the number of lines returned', async () => {
      const result = await executeFileRead({ file_path: pkgPath, limit: 5 });
      const contentLines = result.split('\n').filter(l => l.match(/^\s+\d+\s+/));
      expect(contentLines.length).toBeLessThanOrEqual(5);
    });

    it('combines offset and limit correctly', async () => {
      const result = await executeFileRead({
        file_path: pkgPath,
        offset: 2,
        limit: 3,
      });
      const contentLines = result.split('\n').filter(l => l.match(/^\s+\d+\s+/));
      expect(contentLines.length).toBeLessThanOrEqual(3);
      // First line should be line 2
      expect(contentLines[0]).toMatch(/\s+2\s+/);
    });
  });

  describe('various file types', () => {
    it('reads TypeScript files', async () => {
      const agentPath = path.join(getCwd(), 'src', 'agent.ts');
      const result = await executeFileRead({ file_path: agentPath });
      expect(result).toContain('import');
    });

    it('reads JSON files', async () => {
      const result = await executeFileRead({ file_path: pkgPath });
      expect(result).toContain('"name"');
    });

    it('reads markdown files', async () => {
      const readmePath = path.join(getCwd(), 'README.md');
      const result = await executeFileRead({ file_path: readmePath });
      expect(result).toContain('OCCCA');
    });
  });
});
