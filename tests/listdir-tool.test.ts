// Tests for src/tools/ListDirTool
// Verifies directory listing, .gitignore filtering, and security denylist

import { describe, it, expect } from 'vitest';
import { executeListDir } from '../src/tools/ListDirTool/index.js';
import { getCwd } from '../src/utils/helpers.js';
import path from 'path';

describe('ListDirTool', () => {
  describe('basic listing', () => {
    it('lists the project root directory', async () => {
      const result = await executeListDir({ path: getCwd() });
      expect(result).toContain('src/');
      expect(result).toContain('package.json');
    });

    it('returns error for non-existent directories', async () => {
      const result = await executeListDir({ path: path.join(getCwd(), 'fake_dir_xyz') });
      expect(result).toContain('Error');
    });

    it('returns error when path is a file, not a directory', async () => {
      const result = await executeListDir({ path: path.join(getCwd(), 'package.json') });
      expect(result).toContain('Error');
      expect(result).toContain('not a directory');
    });

    it('shows the directory path in the output header', async () => {
      const cwd = getCwd();
      const result = await executeListDir({ path: cwd });
      expect(result.startsWith(cwd)).toBe(true);
    });
  });

  describe('.gitignore respect', () => {
    it('does NOT list node_modules/ in project root', async () => {
      const result = await executeListDir({ path: getCwd() });
      const lines = result.split('\n');
      const nmLine = lines.find(l => l.trim().startsWith('node_modules'));
      expect(nmLine).toBeUndefined();
    });

    it('does NOT list dist/ in project root', async () => {
      const result = await executeListDir({ path: getCwd() });
      const lines = result.split('\n');
      const distLine = lines.find(l => l.trim().startsWith('dist'));
      expect(distLine).toBeUndefined();
    });

    it('shows hidden items count when entries are filtered', async () => {
      const result = await executeListDir({ path: getCwd() });
      // Should show how many items were hidden
      expect(result).toContain('hidden by .gitignore/security rules');
    });
  });

  describe('security denylist', () => {
    it('does NOT list .git/ directory', async () => {
      const result = await executeListDir({ path: getCwd() });
      const lines = result.split('\n');
      const gitLine = lines.find(l => l.trim().startsWith('.git/') || l.trim() === '.git/');
      expect(gitLine).toBeUndefined();
    });

    it('does NOT list .vscode/ directory if it exists', async () => {
      const result = await executeListDir({ path: getCwd() });
      const lines = result.split('\n');
      const vscodeLine = lines.find(l => l.trim().startsWith('.vscode'));
      expect(vscodeLine).toBeUndefined();
    });
  });

  describe('output format', () => {
    it('shows directories with trailing slash and item count', async () => {
      const result = await executeListDir({ path: getCwd() });
      // src/ should be listed as a directory with item count
      expect(result).toMatch(/src\/\s+\(\d+ items\)/);
    });

    it('shows files with their size', async () => {
      const result = await executeListDir({ path: getCwd() });
      // package.json should show a size
      expect(result).toMatch(/package\.json\s+[\d.]+ [BKMG]/);
    });

    it('sorts directories before files', async () => {
      const result = await executeListDir({ path: getCwd() });
      const lines = result.split('\n').filter(l => l.trim() && !l.includes(':'));
      // Find the first file line and the last directory line
      let lastDirIdx = -1;
      let firstFileIdx = lines.length;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.includes('/  (')) lastDirIdx = i;
        else if (firstFileIdx === lines.length) firstFileIdx = i;
      }
      // All directories should come before all files
      if (lastDirIdx >= 0 && firstFileIdx < lines.length) {
        expect(lastDirIdx).toBeLessThan(firstFileIdx);
      }
    });
  });

  describe('subdirectory listing', () => {
    it('lists contents of src/ directory', async () => {
      const result = await executeListDir({ path: path.join(getCwd(), 'src') });
      expect(result).toContain('agent.ts');
      expect(result).toContain('tools/');
    });

    it('lists tool directories inside src/tools/', async () => {
      const result = await executeListDir({ path: path.join(getCwd(), 'src', 'tools') });
      expect(result).toContain('GrepTool/');
      expect(result).toContain('GlobTool/');
      expect(result).toContain('BashTool/');
    });
  });
});
