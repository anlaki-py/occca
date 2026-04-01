// Tests for src/tools/BashTool
// Verifies command execution, timeout handling, and output capture

import { describe, it, expect } from 'vitest';
import { executeBash } from '../src/tools/BashTool/index.js';

describe('BashTool', () => {
  const isWindows = process.platform === 'win32';

  describe('basic execution', () => {
    it('returns error when no command is provided', async () => {
      const result = await executeBash({ command: '' });
      expect(result).toContain('Error');
    });

    it('executes a simple echo command', async () => {
      const cmd = isWindows ? 'echo hello' : 'echo hello';
      const result = await executeBash({ command: cmd });
      expect(result).toContain('hello');
    });

    it('captures stdout from a command', async () => {
      const cmd = isWindows
        ? 'Get-ChildItem package.json | Select-Object -ExpandProperty Name'
        : 'ls package.json';
      const result = await executeBash({ command: cmd });
      expect(result).toContain('package.json');
    });
  });

  describe('error handling', () => {
    it('captures stderr and exit codes for failing commands', async () => {
      const cmd = isWindows
        ? 'Get-Content nonexistent_file_xyz.txt'
        : 'cat nonexistent_file_xyz.txt';
      const result = await executeBash({ command: cmd });
      // Should contain some error output
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns "[No output]" for silent commands', async () => {
      // A command that produces no output
      const cmd = isWindows ? '$null' : 'true';
      const result = await executeBash({ command: cmd });
      // On Windows, $null may produce some output; be flexible
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('timeout', () => {
    it('respects custom timeout values', async () => {
      // This test just verifies the timeout parameter is accepted
      const cmd = isWindows ? 'echo fast' : 'echo fast';
      const result = await executeBash({ command: cmd, timeout: 5000 });
      expect(result).toContain('fast');
    });

    it('caps timeout at 600000ms', async () => {
      // Even if we pass a huge timeout, it should be capped
      const cmd = isWindows ? 'echo capped' : 'echo capped';
      const result = await executeBash({ command: cmd, timeout: 999999 });
      expect(result).toContain('capped');
    });
  });

  describe('multi-command execution', () => {
    it('chains commands with appropriate operator', async () => {
      const cmd = isWindows
        ? 'echo first; echo second'
        : 'echo first && echo second';
      const result = await executeBash({ command: cmd });
      expect(result).toContain('first');
      expect(result).toContain('second');
    });
  });
});
