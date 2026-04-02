// Config utility — derives runtime OCCCAConfig from the active model profile
// Env vars still take precedence over saved values

import path from 'path';
import os from 'os';
import type { OCCCAConfig } from '../types/index.js';
import { getActiveModel, loadModels, saveModels, getModelsConfigPath } from './models.js';

const CONFIG_DIR = path.join(os.homedir(), '.occca');

/**
 * Get the config directory path.
 * @returns Absolute path to ~/.occca
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Get the path to the config file (now models.json).
 * @returns Absolute path to the models config file
 */
export function getConfigPath(): string {
  return getModelsConfigPath();
}

/**
 * Build the runtime OCCCAConfig from the active model profile.
 * Environment variables override saved values for backwards compatibility.
 * @returns The resolved OCCCAConfig
 */
export function getConfig(): OCCCAConfig {
  const activeProfile = getActiveModel();

  // Runtime config uses the first key from the apiKeys pool
  return {
    apiKey: process.env.OPENAI_API_KEY || process.env.OCCCA_API_KEY || activeProfile.apiKeys[0] || '',
    baseUrl: process.env.OPENAI_BASE_URL || process.env.OCCCA_BASE_URL || activeProfile.baseUrl,
    model: process.env.OCCCA_MODEL || activeProfile.model,
    temperature: parseFloat(process.env.OCCCA_TEMPERATURE ?? '') || activeProfile.temperature,
  };
}

/**
 * Get all API keys for the active model profile.
 * Used by the KeyRotator to build its key pool.
 * Env var overrides replace the entire pool with a single key.
 * @returns Array of API key strings
 */
export function getActiveApiKeys(): string[] {
  const envKey = process.env.OPENAI_API_KEY || process.env.OCCCA_API_KEY;
  if (envKey) return [envKey];

  const activeProfile = getActiveModel();
  return activeProfile.apiKeys;
}

/**
 * Save a full config by updating the active model profile.
 * Used by the config editor for backward compatibility.
 * @param config - The OCCCAConfig to persist onto the active profile
 */
export function saveFullConfig(config: OCCCAConfig): void {
  const modelsConfig = loadModels();
  const active = modelsConfig.models.find(m => m.id === modelsConfig.activeModelId);

  if (active) {
    // If the key changed, replace the first key in the pool
    if (config.apiKey && config.apiKey !== active.apiKeys[0]) {
      active.apiKeys[0] = config.apiKey;
    }
    active.baseUrl = config.baseUrl;
    active.model = config.model;
    active.temperature = config.temperature;
    saveModels(modelsConfig);
  }
}

/**
 * Partially update the active model profile.
 * @param config - Partial fields to merge
 */
export function saveConfig(config: Partial<OCCCAConfig>): void {
  const modelsConfig = loadModels();
  const active = modelsConfig.models.find(m => m.id === modelsConfig.activeModelId);

  if (active) {
    if (config.apiKey !== undefined && config.apiKey !== active.apiKeys[0]) {
      active.apiKeys[0] = config.apiKey;
    }
    if (config.baseUrl !== undefined) active.baseUrl = config.baseUrl;
    if (config.model !== undefined) active.model = config.model;
    if (config.temperature !== undefined) active.temperature = config.temperature;
    saveModels(modelsConfig);
  }
}
