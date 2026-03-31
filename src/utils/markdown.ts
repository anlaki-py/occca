// Markdown renderer ported from Claude Code's src/utils/markdown.ts
// Uses marked's lexer + custom token formatter with chalk styling
// Stripped of React/Ink dependencies for plain terminal output

import chalk from 'chalk';
import { marked, type Token, type Tokens } from 'marked';

const EOL = '\n';

// ─── Configure marked ────────────────────────────────────────────
// Disable strikethrough — models often use ~ for "approximate" (e.g. ~100)
let markedConfigured = false;

function configureMarked(): void {
  if (markedConfigured) return;
  markedConfigured = true;
  marked.use({
    tokenizer: {
      del() { return undefined as any; },
    },
  });
}

// ─── Theme colors (from Claude Code dark theme) ─────────────────

const colors = {
  code:     chalk.rgb(177, 185, 249),    // permission blue-purple for inline code
  heading:  chalk.bold,
  bold:     chalk.bold,
  italic:   chalk.italic,
  dim:      chalk.rgb(153, 153, 153),    // inactive gray
  link:     chalk.rgb(177, 185, 249).underline,
  listBullet: chalk.rgb(215, 119, 87),   // brand orange for bullets
  blockquoteBar: chalk.dim('▎'),
  hr:       chalk.rgb(80, 80, 80),       // subtle
};

// ─── Public API ──────────────────────────────────────────────────

export function renderMarkdown(content: string): string {
  configureMarked();
  // Strip outer markdown/md code fence that models often wrap responses in
  const stripped = stripOuterCodeFence(content);
  return marked
    .lexer(stripped)
    .map(token => formatToken(token, 0, null, null))
    .join('')
    .trim();
}

// Models sometimes wrap entire response in ```markdown ... ```
// which makes the whole thing a single code token — strip that
function stripOuterCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/);
  if (match) return match[1]!;
  return text;
}

/** Decode HTML entities that marked's lexer produces */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// ─── Token Formatter ─────────────────────────────────────────────
// Direct port of Claude Code's formatToken from src/utils/markdown.ts

function formatToken(
  token: Token,
  listDepth: number = 0,
  orderedListNumber: number | null = null,
  parent: Token | null = null,
): string {
  switch (token.type) {
    case 'blockquote': {
      const inner = (token.tokens ?? [])
        .map(t => formatToken(t, 0, null, null))
        .join('');
      const bar = colors.blockquoteBar;
      return inner
        .split(EOL)
        .map((line: string) => line.trim() ? `${bar} ${chalk.italic(line)}` : line)
        .join(EOL);
    }

    case 'code': {
      // Code block — indented code with optional dim language label
      // Claude Code doesn't show ``` borders, just the highlighted code
      const langLabel = token.lang ? colors.dim(`  [${token.lang}]`) + EOL : '';
      const code = token.text
        .split(EOL)
        .map((line: string) => '  ' + line)
        .join(EOL);
      return langLabel + code + EOL;
    }

    case 'codespan': {
      // Inline code — blue-purple like Claude Code
      return colors.code(decodeEntities(token.text));
    }

    case 'em':
      return chalk.italic(
        (token.tokens ?? [])
          .map(t => formatToken(t, 0, null, parent))
          .join(''),
      );

    case 'strong':
      return chalk.bold(
        (token.tokens ?? [])
          .map(t => formatToken(t, 0, null, parent))
          .join(''),
      );

    case 'heading':
      switch (token.depth) {
        case 1:
          return (
            chalk.bold.italic.underline(
              (token.tokens ?? [])
                .map(t => formatToken(t, 0, null, null))
                .join(''),
            ) + EOL + EOL
          );
        case 2:
          return (
            chalk.bold(
              (token.tokens ?? [])
                .map(t => formatToken(t, 0, null, null))
                .join(''),
            ) + EOL + EOL
          );
        default:
          return (
            chalk.bold(
              (token.tokens ?? [])
                .map(t => formatToken(t, 0, null, null))
                .join(''),
            ) + EOL + EOL
          );
      }

    case 'hr':
      return colors.hr('─'.repeat(40)) + EOL;

    case 'image':
      return token.href;

    case 'link': {
      if (token.href.startsWith('mailto:')) {
        return token.href.replace(/^mailto:/, '');
      }
      const linkText = (token.tokens ?? [])
        .map(t => formatToken(t, 0, null, token))
        .join('');
      const plainText = linkText.replace(/\x1b\[[0-9;]*m/g, '');
      if (plainText && plainText !== token.href) {
        return colors.link(linkText) + colors.dim(` (${token.href})`);
      }
      return colors.link(token.href);
    }

    case 'list': {
      return token.items
        .map((item: Token, index: number) =>
          formatToken(
            item,
            listDepth,
            token.ordered ? token.start + index : null,
            token,
          ),
        )
        .join('');
    }

    case 'list_item':
      return (token.tokens ?? [])
        .map(
          t =>
            `${'  '.repeat(listDepth)}${formatToken(t, listDepth + 1, orderedListNumber, token)}`,
        )
        .join('');

    case 'paragraph':
      return (
        (token.tokens ?? [])
          .map(t => formatToken(t, 0, null, null))
          .join('') + EOL
      );

    case 'space':
      return EOL;

    case 'br':
      return EOL;

    case 'text': {
      const textToken = token as any;
      if (parent?.type === 'list_item') {
        const bullet = orderedListNumber === null
          ? colors.listBullet('-')
          : colors.listBullet(`${getListNumber(listDepth, orderedListNumber)}.`);
        const content = textToken.tokens
          ? textToken.tokens.map((t: Token) => formatToken(t, listDepth, orderedListNumber, token)).join('')
          : decodeEntities(textToken.text);
        return `${bullet} ${content}${EOL}`;
      }
      return textToken.tokens
        ? textToken.tokens.map((t: Token) => formatToken(t, listDepth, orderedListNumber, token)).join('')
        : decodeEntities(textToken.text);
    }

    case 'table': {
      const tableToken = token as Tokens.Table;

      function getDisplayText(tokens: Token[] | undefined): string {
        return (tokens?.map(t => formatToken(t, 0, null, null)).join('') ?? '')
          .replace(/\x1b\[[0-9;]*m/g, '');
      }

      const columnWidths = tableToken.header.map((header: any, index: number) => {
        let maxWidth = getDisplayText(header.tokens).length;
        for (const row of tableToken.rows) {
          const cell = row[index] as any;
          const cellLength = getDisplayText(cell?.tokens).length;
          maxWidth = Math.max(maxWidth, cellLength);
        }
        return Math.max(maxWidth, 3);
      });

      // Header
      let output = '| ';
      tableToken.header.forEach((header: any, index: number) => {
        const content = header.tokens
          ?.map((t: Token) => formatToken(t, 0, null, null))
          .join('') ?? '';
        const displayLen = getDisplayText(header.tokens).length;
        const width = columnWidths[index]!;
        const padding = Math.max(0, width - displayLen);
        output += chalk.bold(content) + ' '.repeat(padding) + ' | ';
      });
      output = output.trimEnd() + EOL;

      // Separator
      output += '|';
      columnWidths.forEach(width => {
        output += '-'.repeat(width + 2) + '|';
      });
      output += EOL;

      // Rows
      tableToken.rows.forEach(row => {
        output += '| ';
        row.forEach((cell, index) => {
          const content = cell.tokens
            ?.map(t => formatToken(t, 0, null, null))
            .join('') ?? '';
          const displayLen = getDisplayText(cell.tokens).length;
          const width = columnWidths[index]!;
          const padding = Math.max(0, width - displayLen);
          output += content + ' '.repeat(padding) + ' | ';
        });
        output = output.trimEnd() + EOL;
      });

      return output + EOL;
    }

    case 'escape':
      return decodeEntities(token.text);

    case 'def':
    case 'del':
    case 'html':
      return '';
  }
  return '';
}

// ─── List numbering helpers (from Claude Code) ──────────────────

function numberToLetter(n: number): string {
  let result = '';
  while (n > 0) {
    n--;
    result = String.fromCharCode(97 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

function numberToRoman(n: number): string {
  const values: [number, string][] = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
    [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
    [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let result = '';
  for (const [value, numeral] of values) {
    while (n >= value) {
      result += numeral;
      n -= value;
    }
  }
  return result;
}

function getListNumber(listDepth: number, orderedListNumber: number): string {
  switch (listDepth) {
    case 0:
    case 1:
      return orderedListNumber.toString();
    case 2:
      return numberToLetter(orderedListNumber);
    case 3:
      return numberToRoman(orderedListNumber);
    default:
      return orderedListNumber.toString();
  }
}
