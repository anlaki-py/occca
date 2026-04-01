// Tests for src/utils/gitignore.ts
// Covers the gitignore utility: repo detection, single-path checks, batch checks,
// and the normalizePath logic for Windows compatibility.

import { describe, it, expect, beforeAll } from 'vitest';
import { isInsideGitRepo, isPathGitignored, batchCheckIgnored } from '../src/utils/gitignore.js';
import { getCwd } from '../src/utils/helpers.js';
import path from 'path';

describe('isInsideGitRepo', () => {
  it('returns true when cwd is inside a git repository', () => {
    // OCCCA project root is a git repo
    expect(isInsideGitRepo()).toBe(true);
  });
});

describe('isPathGitignored', () => {
  const cwd = getCwd();

  it('returns true for a gitignored directory (node_modules)', async () => {
    const result = await isPathGitignored('node_modules', cwd);
    expect(result).toBe(true);
  });

  it('returns true for a gitignored directory (dist)', async () => {
    const result = await isPathGitignored('dist', cwd);
    expect(result).toBe(true);
  });

  it('returns false for a tracked directory (src)', async () => {
    const result = await isPathGitignored('src', cwd);
    expect(result).toBe(false);
  });

  it('returns false for a tracked file (package.json)', async () => {
    const result = await isPathGitignored('package.json', cwd);
    expect(result).toBe(false);
  });

  it('returns true for a pattern-matched file (*.log)', async () => {
    // .gitignore has *.log pattern
    const result = await isPathGitignored('test.log', cwd);
    expect(result).toBe(true);
  });

  it('returns false for non-existent but non-ignored paths', async () => {
    const result = await isPathGitignored('some-random-file.ts', cwd);
    expect(result).toBe(false);
  });
});

describe('batchCheckIgnored', () => {
  const cwd = getCwd();

  it('returns empty set for empty input', () => {
    const result = batchCheckIgnored([], cwd);
    expect(result.size).toBe(0);
  });

  it('identifies gitignored paths from a mixed list', () => {
    const paths = ['node_modules', 'src', 'package.json', 'dist'];
    const ignored = batchCheckIgnored(paths, cwd);

    expect(ignored.size).toBeGreaterThan(0);
    // node_modules and dist are gitignored
    // src and package.json are not
  });

  it('identifies node_modules as ignored using relative paths', () => {
    const paths = ['node_modules'];
    const ignored = batchCheckIgnored(paths, cwd);
    expect(ignored.size).toBe(1);
  });

  it('does not flag tracked files as ignored', () => {
    const paths = ['package.json', 'README.md', 'tsconfig.json'];
    const ignored = batchCheckIgnored(paths, cwd);
    expect(ignored.size).toBe(0);
  });

  it('handles full absolute paths on the current platform', () => {
    const fullPaths = [
      path.join(cwd, 'node_modules') + '/',
      path.join(cwd, 'src') + '/',
      path.join(cwd, 'package.json'),
    ];
    const ignored = batchCheckIgnored(fullPaths, cwd);

    // At least node_modules should be ignored
    expect(ignored.size).toBeGreaterThanOrEqual(1);

    // The normalized results should contain the node_modules path
    const normalizedIgnored = [...ignored].map(p => p.replace(/\\/g, '/'));
    const hasNodeModules = normalizedIgnored.some(p => p.includes('node_modules'));
    expect(hasNodeModules).toBe(true);
  });

  it('normalizes Windows-style git output for consistent lookups', () => {
    // Simulate looking up a result using the same normalization
    // that ListDirTool uses (forward-slash comparison)
    const fullPaths = [
      path.join(cwd, 'node_modules') + '/',
      path.join(cwd, 'src') + '/',
    ];
    const ignored = batchCheckIgnored(fullPaths, cwd);

    // Verify lookup works when we normalize our comparison paths
    const nodeModulesNormalized = path.join(cwd, 'node_modules').replace(/\\/g, '/') + '/';
    const srcNormalized = path.join(cwd, 'src').replace(/\\/g, '/') + '/';

    const hasNodeModules = ignored.has(nodeModulesNormalized);
    const hasSrc = ignored.has(srcNormalized);

    expect(hasNodeModules).toBe(true);
    expect(hasSrc).toBe(false);
  });

  it('handles pattern-matched gitignore rules (*.log files)', () => {
    const paths = ['debug.log', 'error.log'];
    const ignored = batchCheckIgnored(paths, cwd);
    // .gitignore has *.log -> both should be ignored
    expect(ignored.size).toBe(2);
  });
});
