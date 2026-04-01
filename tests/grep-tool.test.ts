// Tests for src/tools/GrepTool
// Verifies search behavior, .gitignore respect, and security filtering

import { describe, it, expect } from 'vitest';
import { executeGrep } from '../src/tools/GrepTool/index.js';
import { execSync } from 'child_process';

let hasRg = false;
try {
  execSync('rg --version', { stdio: 'ignore' });
  hasRg = true;
} catch {
  hasRg = false;
}

describe('GrepTool', () => {
  describe('basic search', () => {
    it('returns error when no pattern is provided', async () => {
      const result = await executeGrep({ pattern: '' });
      expect(result).toContain('Error');
    });

    it('finds a known string in a known file', async () => {
      // "OCCCA" should exist in package.json
      const result = await executeGrep({ pattern: 'occca', path: '.' });
      expect(result).toContain('occca');
      expect(result).not.toContain('No matches found');
    });

    it('returns "no matches" for a pattern that does not exist', async () => {
      // Use a pattern that doesn't appear in this file itself
      const result = await executeGrep({ pattern: 'NOT_' + 'FOUND_' + 'PATTERN_123' });
      expect(result).toContain('No matches found');
    });

    it('includes line numbers in results', async () => {
      const result = await executeGrep({ pattern: 'export', include: '*.ts' });
      // ripgrep output format: file:line:content
      expect(result).toMatch(/:\d+:/);
    });
  });

  describe.skipIf(!hasRg)('file filtering', () => {
    it('filters results by include glob pattern', async () => {
      const result = await executeGrep({ pattern: 'export', include: '*.json' });
      // Should not match .ts files when filtering for .json
      if (!result.includes('No matches found')) {
        expect(result).not.toMatch(/\.ts:\d+:/);
      }
    });
  });

  describe.skipIf(!hasRg)('.gitignore respect', () => {
    it('does NOT include results from node_modules/', async () => {
      // "version" exists in many node_modules package.json files
      const result = await executeGrep({ pattern: 'version' });
      const lines = result.split('\n');
      const nmLines = lines.filter(l => l.includes('node_modules'));
      expect(nmLines.length).toBe(0);
    });

    it('does NOT include results from dist/', async () => {
      const result = await executeGrep({ pattern: 'export' });
      const lines = result.split('\n');
      const distLines = lines.filter(l => l.includes('dist/') || l.includes('dist\\'));
      expect(distLines.length).toBe(0);
    });
  });

  describe.skipIf(!hasRg)('security denylist', () => {
    it('does NOT include results from .git/ directory', async () => {
      // .git/ contains text files that would match many patterns
      const result = await executeGrep({ pattern: 'ref' });
      const lines = result.split('\n');
      const gitLines = lines.filter(l =>
        l.startsWith('.git/') || l.startsWith('.git\\') ||
        l.includes('/.git/') || l.includes('\\.git\\')
      );
      expect(gitLines.length).toBe(0);
    });
  });

  describe('output format', () => {
    it('includes match count in output', async () => {
      // Use a project-specific pattern to avoid noisy results
      const result = await executeGrep({ pattern: 'OCCCA', include: '*.ts' });
      expect(result).toMatch(/\[\d+ match/);
    });
  });
});
