import fs from 'fs';
import path from 'path';
import os from 'os';
import type { OCCCAConfig } from '../types/index.js';

const CONFIG_DIR = path.join(os.homedir(), '.occca');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Default config created on first run
const DEFAULT_CONFIG: OCCCAConfig = {
  apiKey: 'sk-your-api-key-here',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-5',
  maxTokens: 16384,
  temperature: 0,
};

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/** Create default config file if it doesn't exist */
export function ensureDefaultConfig(): boolean {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return true; // first run
  }
  return false;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function loadConfig(): Partial<OCCCAConfig> {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

export function saveConfig(config: Partial<OCCCAConfig>): void {
  ensureConfigDir();
  const existing = loadConfig();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...existing, ...config }, null, 2));
}

export function saveFullConfig(config: OCCCAConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getConfig(): OCCCAConfig {
  ensureDefaultConfig();
  const saved = loadConfig();
  return {
    apiKey: process.env.OPENAI_API_KEY || process.env.OCCCA_API_KEY || saved.apiKey || '',
    baseUrl: process.env.OPENAI_BASE_URL || process.env.OCCCA_BASE_URL || saved.baseUrl || 'https://api.openai.com/v1',
    model: process.env.OCCCA_MODEL || saved.model || 'gpt-5',
    maxTokens: parseInt(process.env.OCCCA_MAX_TOKENS || '') || saved.maxTokens || 16384,
    temperature: parseFloat(process.env.OCCCA_TEMPERATURE ?? '') || (saved.temperature ?? 0),
  };
}
