// Shared type definitions

import type OpenAI from 'openai';

export type ToolFunction = (args: Record<string, unknown>) => Promise<string>;

export interface ToolDefinition {
  definition: OpenAI.Chat.Completions.ChatCompletionTool;
  execute: ToolFunction;
  userFacingName: (args?: Record<string, unknown>) => string;
}

/** Runtime config derived from the active model profile */
export interface OCCCAConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
}

/** A saved model profile with its own credentials and parameters */
export interface ModelProfile {
  id: string;
  name: string;         // user-facing display name (e.g. "GPT-5", "Local Ollama")
  apiKey: string;
  baseUrl: string;
  model: string;        // the actual model identifier sent to the API
  temperature: number;
}

/** Persistent config structure holding all model profiles */
export interface ModelsConfig {
  activeModelId: string;        // ID of the currently active model profile
  models: ModelProfile[];       // all saved model profiles
}

export interface AgentCallbacks {
  onToken: (token: string) => void;
  onToolStart: (name: string, args: Record<string, unknown>) => void;
  onToolEnd: (name: string, result: string) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
}
