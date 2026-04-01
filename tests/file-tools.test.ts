// Tests for src/tools/FileWriteTool and src/tools/FileEditTool
// Uses temporary files to avoid modifying real project files

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeFileWrite } from '../src/tools/FileWriteTool/index.js';
import { executeFileEdit } from '../src/tools/FileEditTool/index.js';
import { getCwd } from '../src/utils/helpers.js';
import path from 'path';
import fs from 'fs';

// Temp directory inside the project (NOT /tmp — stays within workspace)
const TEMP_DIR = path.join(getCwd(), '.test-temp');

describe('FileWriteTool', () => {
  beforeEach(() => {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp files after each test
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  });

  it('creates a new file with content', async () => {
    const filePath = path.join(TEMP_DIR, 'new-file.txt');
    const result = await executeFileWrite({
      file_path: filePath,
      content: 'Hello, world!',
    });
    expect(result).toContain('created');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('Hello, world!');
  });

  it('overwrites an existing file', async () => {
    const filePath = path.join(TEMP_DIR, 'existing.txt');
    fs.writeFileSync(filePath, 'old content');

    const result = await executeFileWrite({
      file_path: filePath,
      content: 'new content',
    });
    expect(result).toContain('overwrote');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content');
  });

  it('creates parent directories if they do not exist', async () => {
    const filePath = path.join(TEMP_DIR, 'deep', 'nested', 'dir', 'file.txt');
    const result = await executeFileWrite({
      file_path: filePath,
      content: 'nested content',
    });
    expect(result).toContain('created');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('reports line and byte counts in the result', async () => {
    const content = 'line1\nline2\nline3';
    const filePath = path.join(TEMP_DIR, 'counted.txt');
    const result = await executeFileWrite({ file_path: filePath, content });
    expect(result).toContain('3 lines');
    expect(result).toMatch(/\d+ bytes/);
  });
});

describe('FileEditTool', () => {
  beforeEach(() => {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  });

  it('replaces a unique string in a file', async () => {
    const filePath = path.join(TEMP_DIR, 'edit-target.txt');
    fs.writeFileSync(filePath, 'Hello, world! This is a test.');

    const result = await executeFileEdit({
      file_path: filePath,
      old_string: 'world',
      new_string: 'universe',
    });
    expect(result).toContain('Successfully edited');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('Hello, universe! This is a test.');
  });

  it('returns error when old_string is not found', async () => {
    const filePath = path.join(TEMP_DIR, 'edit-target.txt');
    fs.writeFileSync(filePath, 'Hello, world!');

    const result = await executeFileEdit({
      file_path: filePath,
      old_string: 'nonexistent string',
      new_string: 'replacement',
    });
    expect(result).toContain('Error');
    expect(result).toContain('not found');
  });

  it('returns error when old_string appears multiple times without replace_all', async () => {
    const filePath = path.join(TEMP_DIR, 'multi.txt');
    fs.writeFileSync(filePath, 'foo bar foo baz foo');

    const result = await executeFileEdit({
      file_path: filePath,
      old_string: 'foo',
      new_string: 'qux',
    });
    expect(result).toContain('Error');
    expect(result).toMatch(/found \d+ times/);
  });

  it('replaces all occurrences when replace_all is true', async () => {
    const filePath = path.join(TEMP_DIR, 'replace-all.txt');
    fs.writeFileSync(filePath, 'foo bar foo baz foo');

    const result = await executeFileEdit({
      file_path: filePath,
      old_string: 'foo',
      new_string: 'qux',
      replace_all: true,
    });
    expect(result).toContain('Successfully edited');
    expect(result).toContain('3 replacements');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('qux bar qux baz qux');
  });

  it('returns error for non-existent files', async () => {
    const result = await executeFileEdit({
      file_path: path.join(TEMP_DIR, 'no-such-file.txt'),
      old_string: 'find',
      new_string: 'replace',
    });
    expect(result).toContain('Error');
  });

  it('returns error when old_string is empty', async () => {
    const filePath = path.join(TEMP_DIR, 'empty-old.txt');
    fs.writeFileSync(filePath, 'some content');

    const result = await executeFileEdit({
      file_path: filePath,
      old_string: '',
      new_string: 'replacement',
    });
    expect(result).toContain('Error');
  });

  it('handles whitespace-sensitive replacements', async () => {
    const filePath = path.join(TEMP_DIR, 'whitespace.txt');
    const content = '  indented line\n    more indented\n';
    fs.writeFileSync(filePath, content);

    const result = await executeFileEdit({
      file_path: filePath,
      old_string: '  indented line',
      new_string: '  modified line',
    });
    expect(result).toContain('Successfully edited');
    const updated = fs.readFileSync(filePath, 'utf-8');
    expect(updated).toContain('  modified line');
    expect(updated).toContain('    more indented');
  });

  it('detects near-matches with wrong whitespace', async () => {
    const filePath = path.join(TEMP_DIR, 'near-match.txt');
    // File has specific indentation
    fs.writeFileSync(filePath, '    indented content\n    another line');

    // Try to match with WRONG indentation — the trimmed content exists
    // but the exact string with this different whitespace does not
    const result = await executeFileEdit({
      file_path: filePath,
      old_string: '  indented content\n  another line',
      new_string: 'new content',
    });
    // The tool detects the trimmed version matches and gives whitespace guidance
    expect(result).toContain('Make sure it matches the file content exactly, including whitespace and indentation');
  });
});
