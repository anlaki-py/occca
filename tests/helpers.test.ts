// Tests for src/utils/helpers.ts
// Covers path resolution, cwd management, platform info, and output truncation

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getCwd, setCwd, resolveFilePath, truncateOutput, fileExists, getIsGit } from '../src/utils/helpers.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('getCwd / setCwd', () => {
  const originalCwd = getCwd();

  afterEach(() => {
    // Restore original cwd after each test
    setCwd(originalCwd);
  });

  it('returns the current working directory by default', () => {
    const cwd = getCwd();
    expect(typeof cwd).toBe('string');
    expect(cwd.length).toBeGreaterThan(0);
  });

  it('updates the working directory when setCwd is called', () => {
    const newDir = os.tmpdir();
    setCwd(newDir);
    expect(getCwd()).toBe(newDir);
  });

  it('preserves the exact path set via setCwd', () => {
    const testPath = path.join(os.tmpdir(), 'test-occca-cwd');
    setCwd(testPath);
    expect(getCwd()).toBe(testPath);
  });
});

describe('resolveFilePath', () => {
  it('returns absolute paths unchanged', () => {
    const absPath = process.platform === 'win32'
      ? 'C:\\Users\\test\\file.ts'
      : '/home/test/file.ts';
    expect(resolveFilePath(absPath)).toBe(absPath);
  });

  it('resolves relative paths against cwd', () => {
    const cwd = getCwd();
    const result = resolveFilePath('src/agent.ts');
    expect(result).toBe(path.resolve(cwd, 'src/agent.ts'));
  });

  it('resolves dot-relative paths correctly', () => {
    const result = resolveFilePath('./package.json');
    expect(path.isAbsolute(result)).toBe(true);
    expect(result.endsWith('package.json')).toBe(true);
  });
});

describe('truncateOutput', () => {
  it('returns short strings unchanged', () => {
    const short = 'Hello, world!';
    expect(truncateOutput(short)).toBe(short);
  });

  it('returns strings at exactly the limit unchanged', () => {
    const exact = 'x'.repeat(50000);
    expect(truncateOutput(exact)).toBe(exact);
  });

  it('truncates strings exceeding the limit', () => {
    // Use a string well above the limit to ensure truncation is meaningful
    const long = 'x'.repeat(100000);
    const result = truncateOutput(long);
    expect(result).toContain('...[output truncated]...');
    expect(result.length).toBeLessThan(long.length);
  });

  it('respects a custom max character limit', () => {
    const text = 'abcdefghij'; // 10 chars
    const result = truncateOutput(text, 6);
    expect(result).toContain('...[output truncated]...');
  });

  it('preserves content from both start and end of long strings', () => {
    const start = 'START_MARKER';
    const end = 'END_MARKER';
    const middle = 'x'.repeat(50000);
    const text = start + middle + end;
    const result = truncateOutput(text, 100);
    expect(result).toContain('START_MARKER');
    expect(result).toContain('END_MARKER');
  });
});

describe('fileExists', () => {
  it('returns true for existing files', () => {
    // package.json should always exist in the project root
    const pkgPath = path.join(getCwd(), 'package.json');
    expect(fileExists(pkgPath)).toBe(true);
  });

  it('returns false for non-existent files', () => {
    const fakePath = path.join(getCwd(), 'definitely-not-a-real-file-xyz.txt');
    expect(fileExists(fakePath)).toBe(false);
  });
});

describe('getIsGit', () => {
  it('returns true when run inside a git repository', () => {
    // The OCCCA project itself is a git repo
    expect(getIsGit()).toBe(true);
  });
});
