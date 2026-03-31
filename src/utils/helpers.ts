import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

let _cwd = process.cwd();

export function getCwd(): string {
  return _cwd;
}

export function setCwd(newCwd: string): void {
  _cwd = newCwd;
}

export function getIsGit(): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: getCwd(), stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function getPlatformInfo(): string {
  const platform = os.platform();
  const release = os.release();
  const version = os.version();
  if (platform === 'win32') {
    return `${version} ${release}`;
  }
  return `${os.type()} ${release}`;
}

export function getShellInfo(): string {
  if (os.platform() === 'win32') {
    return `Shell: PowerShell (commands execute in powershell.exe)`;
  }
  const shell = process.env.SHELL || 'unknown';
  const name = shell.includes('zsh') ? 'zsh'
    : shell.includes('bash') ? 'bash'
    : path.basename(shell);
  return `Shell: ${name}`;
}

export function getSessionDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function truncateOutput(output: string, maxChars: number = 50000): string {
  if (output.length <= maxChars) return output;
  const half = Math.floor(maxChars / 2);
  return output.slice(0, half) + '\n\n...[output truncated]...\n\n' + output.slice(-half);
}

export function resolveFilePath(filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  return path.resolve(getCwd(), filePath);
}

export function fileExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}
