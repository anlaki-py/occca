// Tests for src/utils/markdown.ts
// Verifies markdown rendering for terminal output

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../src/utils/markdown.js';
import stripAnsi from 'strip-ansi';

describe('Markdown Renderer', () => {
  it('renders plain text', () => {
    const result = renderMarkdown('Hello, world!');
    expect(stripAnsi(result)).toContain('Hello, world!');
  });

  it('renders inline code spans', () => {
    const result = renderMarkdown('Use `console.log()` here');
    expect(stripAnsi(result)).toContain('console.log()');
  });

  it('renders bold text', () => {
    const result = renderMarkdown('This is **bold** text');
    expect(stripAnsi(result)).toContain('bold');
  });

  it('renders fenced code blocks', () => {
    const md = '```typescript\nconst x = 1;\n```';
    const result = renderMarkdown(md);
    expect(stripAnsi(result)).toContain('const x = 1;');
  });

  it('shows language label for code blocks', () => {
    const md = '```python\nprint("hi")\n```';
    const result = renderMarkdown(md);
    expect(stripAnsi(result)).toContain('[python]');
  });

  it('renders headings', () => {
    expect(stripAnsi(renderMarkdown('# Title'))).toContain('Title');
    expect(stripAnsi(renderMarkdown('## Section'))).toContain('Section');
  });

  it('renders unordered lists', () => {
    const md = '- Item one\n- Item two';
    const plain = stripAnsi(renderMarkdown(md));
    expect(plain).toContain('Item one');
    expect(plain).toContain('Item two');
  });

  it('renders links with URL', () => {
    const md = '[Example](https://example.com)';
    const plain = stripAnsi(renderMarkdown(md));
    expect(plain).toContain('Example');
    expect(plain).toContain('https://example.com');
  });

  it('renders blockquotes', () => {
    const plain = stripAnsi(renderMarkdown('> Quote'));
    expect(plain).toContain('Quote');
  });

  it('renders horizontal rules', () => {
    const plain = stripAnsi(renderMarkdown('---'));
    expect(plain).toContain('─');
  });

  it('strips outer markdown code fence', () => {
    const md = '```markdown\n# Title\nContent\n```';
    const plain = stripAnsi(renderMarkdown(md));
    expect(plain).toContain('Title');
    expect(plain).toContain('Content');
  });

  it('decodes HTML entities', () => {
    expect(stripAnsi(renderMarkdown('A &amp; B'))).toContain('A & B');
  });

  it('renders tables', () => {
    const md = '| Name | Val |\n|------|-----|\n| foo  | bar |';
    const plain = stripAnsi(renderMarkdown(md));
    expect(plain).toContain('Name');
    expect(plain).toContain('foo');
  });
});
