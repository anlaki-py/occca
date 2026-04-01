// Tests for src/constants/security.ts
// Covers the security denylist constants and pattern generation functions

import { describe, it, expect } from 'vitest';
import {
  DANGEROUS_FILES,
  DANGEROUS_DIRECTORIES,
  getSecurityRipgrepArgs,
  getSecurityGlobExclusions,
} from '../src/constants/security.js';

describe('DANGEROUS_FILES', () => {
  it('is a non-empty array of strings', () => {
    expect(Array.isArray(DANGEROUS_FILES)).toBe(true);
    expect(DANGEROUS_FILES.length).toBeGreaterThan(0);
    DANGEROUS_FILES.forEach(f => expect(typeof f).toBe('string'));
  });

  it('includes critical sensitive files', () => {
    expect(DANGEROUS_FILES).toContain('.gitconfig');
    expect(DANGEROUS_FILES).toContain('.bashrc');
    expect(DANGEROUS_FILES).toContain('.env');
    expect(DANGEROUS_FILES).toContain('.npmrc');
  });

  it('all entries start with a dot', () => {
    DANGEROUS_FILES.forEach(f => {
      expect(f.startsWith('.')).toBe(true);
    });
  });
});

describe('DANGEROUS_DIRECTORIES', () => {
  it('is a non-empty array of strings', () => {
    expect(Array.isArray(DANGEROUS_DIRECTORIES)).toBe(true);
    expect(DANGEROUS_DIRECTORIES.length).toBeGreaterThan(0);
    DANGEROUS_DIRECTORIES.forEach(d => expect(typeof d).toBe('string'));
  });

  it('includes VCS and IDE directories', () => {
    expect(DANGEROUS_DIRECTORIES).toContain('.git');
    expect(DANGEROUS_DIRECTORIES).toContain('.vscode');
    expect(DANGEROUS_DIRECTORIES).toContain('.svn');
  });
});

describe('getSecurityRipgrepArgs', () => {
  it('returns an array of strings', () => {
    const args = getSecurityRipgrepArgs();
    expect(Array.isArray(args)).toBe(true);
    args.forEach(a => expect(typeof a).toBe('string'));
  });

  it('returns pairs of --glob and exclusion pattern', () => {
    const args = getSecurityRipgrepArgs();
    // Should have alternating --glob / pattern pairs
    for (let i = 0; i < args.length; i += 2) {
      expect(args[i]).toBe('--glob');
      expect(args[i + 1]).toMatch(/^!/); // exclusion patterns start with !
    }
  });

  it('generates directory exclusions with /** suffix', () => {
    const args = getSecurityRipgrepArgs();
    // Find the .git exclusion
    const gitIdx = args.indexOf('!.git/**');
    expect(gitIdx).toBeGreaterThan(-1);
  });

  it('generates file exclusions without /** suffix', () => {
    const args = getSecurityRipgrepArgs();
    expect(args).toContain('!.bashrc');
    expect(args).toContain('!.env');
  });

  it('includes exclusions for all dangerous dirs and files', () => {
    const args = getSecurityRipgrepArgs();
    // Every dangerous directory should have a corresponding glob pattern
    for (const dir of DANGEROUS_DIRECTORIES) {
      expect(args).toContain(`!${dir}/**`);
    }
    for (const file of DANGEROUS_FILES) {
      expect(args).toContain(`!${file}`);
    }
  });
});

describe('getSecurityGlobExclusions', () => {
  it('returns an array of glob patterns', () => {
    const patterns = getSecurityGlobExclusions();
    expect(Array.isArray(patterns)).toBe(true);
    patterns.forEach(p => expect(typeof p).toBe('string'));
  });

  it('includes patterns for all dangerous directories', () => {
    const patterns = getSecurityGlobExclusions();
    for (const dir of DANGEROUS_DIRECTORIES) {
      const expected = `**/${dir}/**`;
      expect(patterns).toContain(expected);
    }
  });

  it('includes patterns for all dangerous files', () => {
    const patterns = getSecurityGlobExclusions();
    for (const file of DANGEROUS_FILES) {
      const expected = `**/${file}`;
      expect(patterns).toContain(expected);
    }
  });

  it('all patterns use ** for depth matching', () => {
    const patterns = getSecurityGlobExclusions();
    patterns.forEach(p => {
      expect(p).toMatch(/^\*\*\//);
    });
  });
});
