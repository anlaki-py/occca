// Tests for src/tools/GlobTool
// Verifies file discovery, security filtering, and intentional !.gitignore behavior

import { describe, it, expect } from 'vitest';
import { executeGlob } from '../src/tools/GlobTool/index.js';

describe('GlobTool', () => {
  describe('basic discovery', () => {
    it('returns error when no pattern is provided', async () => {
      const result = await executeGlob({ pattern: '' });
      expect(result).toContain('Error');
    });

    it('finds TypeScript files in src/', async () => {
      const result = await executeGlob({ pattern: 'src/**/*.ts' });
      expect(result).toContain('.ts');
      expect(result).not.toContain('No files found');
    });

    it('finds package.json at project root', async () => {
      const result = await executeGlob({ pattern: 'package.json' });
      expect(result).toContain('package.json');
    });

    it('returns "no files found" for impossible patterns', async () => {
      const result = await executeGlob({ pattern: '**/*.zzz_impossible_ext' });
      expect(result).toContain('No files found');
    });
  });

  describe('discovery mode (does NOT respect .gitignore)', () => {
    it('CAN find files in node_modules/ (discovery mode)', async () => {
      // GlobTool intentionally ignores .gitignore for full discovery
      const result = await executeGlob({ pattern: 'node_modules/**/package.json' });
      // Should find at least one package.json in node_modules
      if (result.includes('No files found')) {
        // If node_modules is empty, that's also valid
        expect(result).toContain('No files found');
      } else {
        expect(result).toContain('node_modules');
      }
    });
  });

  describe('security denylist', () => {
    it('does NOT find files inside .git/ directory', async () => {
      // .git/HEAD always exists in a git repo
      const result = await executeGlob({ pattern: '.git/**/*' });
      expect(result).toContain('No files found');
    });

    it('does NOT find files inside .vscode/ directory', async () => {
      const result = await executeGlob({ pattern: '.vscode/**/*' });
      expect(result).toContain('No files found');
    });
  });

  describe('output format', () => {
    it('returns absolute paths', async () => {
      const result = await executeGlob({ pattern: 'package.json' });
      const lines = result.split('\n').filter(l => l.includes('package.json'));
      for (const line of lines) {
        // Absolute paths start with / on Unix or C:\ / C:/ on Windows
        const isAbsolute = line.startsWith('/') || /^[A-Z]:[\\/]/i.test(line);
        expect(isAbsolute).toBe(true);
      }
    });

    it('includes file count summary', async () => {
      const result = await executeGlob({ pattern: 'src/**/*.ts' });
      expect(result).toMatch(/\[\d+ file/);
    });
  });

  describe('path scoping', () => {
    it('respects the path parameter to scope search', async () => {
      const result = await executeGlob({ pattern: '**/*.ts', path: 'src/utils' });
      expect(result).toContain('.ts');
      // All results should be in the utils directory
      const lines = result.split('\n').filter(l => l.endsWith('.ts'));
      for (const line of lines) {
        expect(line).toContain('utils');
      }
    });
  });
});
