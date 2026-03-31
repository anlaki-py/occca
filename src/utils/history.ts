// Persistent input history
// Saves to ~/.occca/history for cross-session arrow key navigation

import fs from 'fs';
import path from 'path';
import os from 'os';

const HISTORY_FILE = path.join(os.homedir(), '.occca', 'history');
const MAX_HISTORY_LINES = 1000;

export function loadHistory(): string[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const content = fs.readFileSync(HISTORY_FILE, 'utf-8');
      return content.split('\n').filter(line => line.trim());
    }
  } catch {
    // Ignore read errors
  }
  return [];
}

export function saveHistoryLine(line: string): void {
  try {
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Append the line
    fs.appendFileSync(HISTORY_FILE, line + '\n');

    // Trim if too long
    try {
      const content = fs.readFileSync(HISTORY_FILE, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      if (lines.length > MAX_HISTORY_LINES) {
        const trimmed = lines.slice(-MAX_HISTORY_LINES).join('\n') + '\n';
        fs.writeFileSync(HISTORY_FILE, trimmed);
      }
    } catch {
      // Ignore trim errors
    }
  } catch {
    // Ignore write errors
  }
}
