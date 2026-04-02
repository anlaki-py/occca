// Model profile manager — CRUD, persistence, and legacy config migration

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type { ModelProfile, ModelsConfig, OCCCAConfig } from '../types/index.js';

const CONFIG_DIR = path.join(os.homedir(), '.occca');
const MODELS_FILE = path.join(CONFIG_DIR, 'models.json');
const LEGACY_CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// ─── Default Profile ─────────────────────────────────────────────

/** Seed profile used when no models exist yet */
const DEFAULT_PROFILE: ModelProfile = {
  id: 'default',
  name: 'OpenAI',
  apiKey: 'sk-your-api-key-here',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-5',
  temperature: 0,
};

// ─── ID Generation ───────────────────────────────────────────────

/**
 * Generate a short random ID for model profiles.
 * @returns 8-char hex string
 */
export function generateId(): string {
  return crypto.randomBytes(4).toString('hex');
}

// ─── Persistence ─────────────────────────────────────────────────

/**
 * Ensure the config directory exists on disk.
 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load models config from disk. Handles three cases:
 * 1. models.json exists → load it
 * 2. Only legacy config.json exists → migrate it
 * 3. Nothing exists → create default
 * @returns The loaded or newly created ModelsConfig
 */
export function loadModels(): ModelsConfig {
  ensureConfigDir();

  // Case 1: models.json already exists
  if (fs.existsSync(MODELS_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(MODELS_FILE, 'utf-8'));
      return raw as ModelsConfig;
    } catch {
      // Corrupted file — fall through to create default
    }
  }

  // Case 2: legacy flat config.json exists — migrate it
  if (fs.existsSync(LEGACY_CONFIG_FILE)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(LEGACY_CONFIG_FILE, 'utf-8')) as Partial<OCCCAConfig>;
      const migrated = migrateFromLegacy(legacy);
      saveModels(migrated);
      return migrated;
    } catch {
      // Corrupted legacy — fall through to create default
    }
  }

  // Case 3: first run — create default
  const fresh: ModelsConfig = {
    activeModelId: DEFAULT_PROFILE.id,
    models: [{ ...DEFAULT_PROFILE }],
  };
  saveModels(fresh);
  return fresh;
}

/**
 * Persist models config to disk.
 * @param config - The full ModelsConfig to save
 */
export function saveModels(config: ModelsConfig): void {
  ensureConfigDir();
  fs.writeFileSync(MODELS_FILE, JSON.stringify(config, null, 2));
}

// ─── Legacy Migration ────────────────────────────────────────────

/**
 * Convert old flat OCCCAConfig to the new ModelsConfig format.
 * Creates a single "Migrated" profile from the legacy values.
 * @param legacy - The old flat config object
 * @returns A new ModelsConfig with one profile
 */
export function migrateFromLegacy(legacy: Partial<OCCCAConfig>): ModelsConfig {
  const profile: ModelProfile = {
    id: 'migrated',
    name: 'Migrated',
    apiKey: legacy.apiKey || DEFAULT_PROFILE.apiKey,
    baseUrl: legacy.baseUrl || DEFAULT_PROFILE.baseUrl,
    model: legacy.model || DEFAULT_PROFILE.model,
    temperature: legacy.temperature ?? DEFAULT_PROFILE.temperature,
  };

  return {
    activeModelId: profile.id,
    models: [profile],
  };
}

// ─── CRUD Operations ─────────────────────────────────────────────

/**
 * Get the currently active model profile.
 * Falls back to the first profile if activeModelId doesn't match.
 * @returns The active ModelProfile
 */
export function getActiveModel(): ModelProfile {
  const config = loadModels();
  const active = config.models.find(m => m.id === config.activeModelId);

  // Fallback: if the active ID is stale, use the first profile
  if (!active) {
    return config.models[0] || { ...DEFAULT_PROFILE };
  }

  return active;
}

/**
 * Switch the active model to the profile with the given ID.
 * @param id - Profile ID to activate
 * @returns true if the switch succeeded, false if the ID wasn't found
 */
export function setActiveModel(id: string): boolean {
  const config = loadModels();
  const exists = config.models.some(m => m.id === id);
  if (!exists) return false;

  config.activeModelId = id;
  saveModels(config);
  return true;
}

/**
 * Add a new model profile.
 * @param profile - Profile data without ID (auto-generated)
 * @returns The newly created ModelProfile with its ID
 */
export function addModel(profile: Omit<ModelProfile, 'id'>): ModelProfile {
  const config = loadModels();
  const newProfile: ModelProfile = {
    ...profile,
    id: generateId(),
  };

  config.models.push(newProfile);
  saveModels(config);
  return newProfile;
}

/**
 * Remove a model profile by ID.
 * Prevents deleting the last remaining profile.
 * If the active model is deleted, switches to the first remaining profile.
 * @param id - Profile ID to remove
 * @returns true if deleted, false if not found or would leave zero profiles
 */
export function removeModel(id: string): boolean {
  const config = loadModels();

  // Prevent deleting the last model
  if (config.models.length <= 1) return false;

  const index = config.models.findIndex(m => m.id === id);
  if (index === -1) return false;

  config.models.splice(index, 1);

  // If the active model was deleted, switch to the first remaining one
  if (config.activeModelId === id) {
    config.activeModelId = config.models[0]!.id;
  }

  saveModels(config);
  return true;
}

/**
 * Update fields on an existing model profile.
 * @param id - Profile ID to update
 * @param updates - Partial fields to merge into the profile
 * @returns true if the update succeeded, false if the ID wasn't found
 */
export function updateModel(id: string, updates: Partial<Omit<ModelProfile, 'id'>>): boolean {
  const config = loadModels();
  const profile = config.models.find(m => m.id === id);
  if (!profile) return false;

  Object.assign(profile, updates);
  saveModels(config);
  return true;
}

/**
 * Find a model profile by its user-facing name (case-insensitive).
 * @param name - Display name to search for
 * @returns The matching profile or undefined
 */
export function findModelByName(name: string): ModelProfile | undefined {
  const config = loadModels();
  return config.models.find(m => m.name.toLowerCase() === name.toLowerCase());
}

/**
 * Get path to the models config file — useful for display purposes.
 * @returns Absolute path to models.json
 */
export function getModelsConfigPath(): string {
  return MODELS_FILE;
}
