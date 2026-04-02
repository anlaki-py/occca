// Tests for the model management system (CRUD, migration, edge cases)
// Uses a temp directory to isolate config file I/O from the real user config

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── Module-level mocks ──────────────────────────────────────────

// vi.mock factories are hoisted above const declarations, so we must use
// vi.hoisted to declare values the mock factory depends on.
const { TEST_HOME, TEST_CONFIG_DIR, TEST_MODELS_FILE, TEST_LEGACY_FILE } = vi.hoisted(() => {
  const actualOs = require('os');
  const actualPath = require('path');
  const home = actualPath.join(actualOs.tmpdir(), `occca-test-${Date.now()}`);
  return {
    TEST_HOME: home,
    TEST_CONFIG_DIR: actualPath.join(home, '.occca'),
    TEST_MODELS_FILE: actualPath.join(home, '.occca', 'models.json'),
    TEST_LEGACY_FILE: actualPath.join(home, '.occca', 'config.json'),
  };
});

// Mock os.homedir to redirect config to temp dir
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return {
    ...actual,
    default: {
      ...actual,
      homedir: () => TEST_HOME,
    },
    homedir: () => TEST_HOME,
  };
});

// Import AFTER mocks are set up
import {
  loadModels,
  saveModels,
  getActiveModel,
  setActiveModel,
  addModel,
  removeModel,
  updateModel,
  findModelByName,
  migrateFromLegacy,
  generateId,
} from '../src/utils/models.js';

import type { ModelsConfig } from '../src/types/index.js';

// ─── Setup / Teardown ────────────────────────────────────────────

beforeEach(() => {
  // Clean slate before each test
  if (fs.existsSync(TEST_CONFIG_DIR)) {
    fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
  }
});

afterEach(() => {
  // Clean up after each test
  if (fs.existsSync(TEST_HOME)) {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

// ─── ID Generation ───────────────────────────────────────────────

describe('generateId', () => {
  it('should return an 8-character hex string', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it('should produce unique IDs across calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    // With 4 bytes of randomness, collisions in 100 tries are astronomically unlikely
    expect(ids.size).toBe(100);
  });
});

// ─── Legacy Migration ────────────────────────────────────────────

describe('migrateFromLegacy', () => {
  it('should convert a flat config into a ModelsConfig', () => {
    const legacy = {
      apiKey: 'sk-test-key',
      baseUrl: 'https://custom.api.com/v1',
      model: 'gpt-42',
      temperature: 0.5,
    };
    const result = migrateFromLegacy(legacy);

    expect(result.activeModelId).toBe('migrated');
    expect(result.models).toHaveLength(1);
    expect(result.models[0]!.apiKey).toBe('sk-test-key');
    expect(result.models[0]!.baseUrl).toBe('https://custom.api.com/v1');
    expect(result.models[0]!.model).toBe('gpt-42');
    expect(result.models[0]!.temperature).toBe(0.5);
    expect(result.models[0]!.name).toBe('Migrated');
  });

  it('should use defaults for missing fields in legacy config', () => {
    const result = migrateFromLegacy({});

    expect(result.models[0]!.apiKey).toBe('sk-your-api-key-here');
    expect(result.models[0]!.baseUrl).toBe('https://api.openai.com/v1');
    expect(result.models[0]!.model).toBe('gpt-5');
    expect(result.models[0]!.temperature).toBe(0);
  });
});

// ─── Persistence ─────────────────────────────────────────────────

describe('loadModels / saveModels', () => {
  it('should create default config on first load', () => {
    const config = loadModels();

    expect(config.models).toHaveLength(1);
    expect(config.activeModelId).toBe('default');
    expect(config.models[0]!.name).toBe('OpenAI');
    // File should now exist on disk
    expect(fs.existsSync(TEST_MODELS_FILE)).toBe(true);
  });

  it('should persist and reload models', () => {
    const config: ModelsConfig = {
      activeModelId: 'test-1',
      models: [{
        id: 'test-1',
        name: 'Test Model',
        apiKey: 'sk-test',
        baseUrl: 'https://test.api.com/v1',
        model: 'test-model-v1',
        temperature: 0.7,
      }],
    };

    saveModels(config);
    const reloaded = loadModels();

    expect(reloaded.activeModelId).toBe('test-1');
    expect(reloaded.models).toHaveLength(1);
    expect(reloaded.models[0]!.name).toBe('Test Model');
  });

  it('should auto-migrate legacy config.json to models.json', () => {
    // Create a legacy config file before loading
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
    fs.writeFileSync(TEST_LEGACY_FILE, JSON.stringify({
      apiKey: 'sk-legacy',
      baseUrl: 'https://legacy.api.com/v1',
      model: 'legacy-model',
      temperature: 0.3,
    }));

    const config = loadModels();

    // It should have migrated
    expect(config.models).toHaveLength(1);
    expect(config.models[0]!.apiKey).toBe('sk-legacy');
    expect(config.models[0]!.model).toBe('legacy-model');
    // models.json should now exist
    expect(fs.existsSync(TEST_MODELS_FILE)).toBe(true);
  });
});

// ─── CRUD ────────────────────────────────────────────────────────

describe('CRUD operations', () => {
  beforeEach(() => {
    // Start with a known state — one default model
    loadModels();
  });

  it('addModel should add a new profile and return it with an ID', () => {
    const newProfile = addModel({
      name: 'Claude',
      apiKey: 'sk-claude',
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-3.5-sonnet',
      temperature: 0,
    });

    expect(newProfile.id).toBeTruthy();
    expect(newProfile.name).toBe('Claude');

    // Verify persistence
    const config = loadModels();
    expect(config.models).toHaveLength(2);
    expect(config.models.find(m => m.id === newProfile.id)).toBeTruthy();
  });

  it('setActiveModel should switch the active model', () => {
    const added = addModel({
      name: 'New',
      apiKey: 'sk-new',
      baseUrl: 'https://new.api.com/v1',
      model: 'new-model',
      temperature: 0,
    });

    const switched = setActiveModel(added.id);
    expect(switched).toBe(true);

    const config = loadModels();
    expect(config.activeModelId).toBe(added.id);
  });

  it('setActiveModel should return false for non-existent ID', () => {
    const result = setActiveModel('non-existent-id');
    expect(result).toBe(false);
  });

  it('updateModel should modify profile fields', () => {
    const config = loadModels();
    const modelId = config.models[0]!.id;

    const updated = updateModel(modelId, {
      name: 'Updated Name',
      temperature: 1.5,
    });

    expect(updated).toBe(true);
    const reloaded = loadModels();
    const profile = reloaded.models.find(m => m.id === modelId);
    expect(profile!.name).toBe('Updated Name');
    expect(profile!.temperature).toBe(1.5);
  });

  it('updateModel should return false for non-existent ID', () => {
    const result = updateModel('non-existent-id', { name: 'Ghost' });
    expect(result).toBe(false);
  });

  it('removeModel should delete a profile', () => {
    // Add a second model so we can delete one
    const added = addModel({
      name: 'Temp',
      apiKey: 'sk-temp',
      baseUrl: 'https://temp.api.com/v1',
      model: 'temp-model',
      temperature: 0,
    });

    const removed = removeModel(added.id);
    expect(removed).toBe(true);

    const config = loadModels();
    expect(config.models).toHaveLength(1);
    expect(config.models.find(m => m.id === added.id)).toBeUndefined();
  });

  it('removeModel should prevent deleting the last model', () => {
    const config = loadModels();
    const onlyModelId = config.models[0]!.id;

    const removed = removeModel(onlyModelId);
    expect(removed).toBe(false);

    // Model should still exist
    const reloaded = loadModels();
    expect(reloaded.models).toHaveLength(1);
  });

  it('removeModel should switch active model when active is deleted', () => {
    // Add a second model and make the first one active
    const second = addModel({
      name: 'Second',
      apiKey: 'sk-second',
      baseUrl: 'https://second.api.com/v1',
      model: 'second-model',
      temperature: 0,
    });

    // Active is still 'default'. Remove default.
    const config = loadModels();
    const firstId = config.models.find(m => m.id !== second.id)!.id;
    setActiveModel(firstId);

    const removed = removeModel(firstId);
    expect(removed).toBe(true);

    // Active should now be the second model
    const reloaded = loadModels();
    expect(reloaded.activeModelId).toBe(second.id);
  });
});

// ─── getActiveModel ──────────────────────────────────────────────

describe('getActiveModel', () => {
  it('should return the active profile', () => {
    const profile = getActiveModel();
    expect(profile.id).toBe('default');
    expect(profile.name).toBe('OpenAI');
  });

  it('should fallback to first profile if active ID is stale', () => {
    // Manually set a bad activeModelId
    const config = loadModels();
    config.activeModelId = 'non-existent';
    saveModels(config);

    const profile = getActiveModel();
    // Should get the first model as fallback
    expect(profile).toBeTruthy();
    expect(profile.id).toBe('default');
  });
});

// ─── findModelByName ─────────────────────────────────────────────

describe('findModelByName', () => {
  it('should find by exact name (case-insensitive)', () => {
    loadModels(); // ensure default exists
    const found = findModelByName('openai');
    expect(found).toBeTruthy();
    expect(found!.name).toBe('OpenAI');
  });

  it('should return undefined for non-existent name', () => {
    loadModels();
    const found = findModelByName('NonExistent');
    expect(found).toBeUndefined();
  });
});
