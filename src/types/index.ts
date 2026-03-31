// Shared type definitions

import type OpenAI from 'openai';

export type ToolFunction = (args: Record<string, unknown>) => Promise<string>;

export interface ToolDefinition {
  definition: OpenAI.Chat.Completions.ChatCompletionTool;
  execute: ToolFunction;
  userFacingName: (args?: Record<string, unknown>) => string;
}

export interface OCCCAConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface AgentCallbacks {
  onToken: (token: string) => void;
  onToolStart: (name: string, args: Record<string, unknown>) => void;
  onToolEnd: (name: string, result: string) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
}
