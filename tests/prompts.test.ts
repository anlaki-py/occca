// Tests for src/constants/prompts.ts
// Verifies system prompt generation includes all required sections

import { describe, it, expect } from 'vitest';
import { getSystemPrompt } from '../src/constants/prompts.js';

describe('System Prompt', () => {
  const prompt = getSystemPrompt('test-model');

  describe('structure', () => {
    it('returns a non-empty string', () => {
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('is a substantial prompt with enough guidance', () => {
      // Should be at least a few thousand characters
      expect(prompt.length).toBeGreaterThan(2000);
    });
  });

  describe('required sections', () => {
    it('includes the agent identity section', () => {
      expect(prompt).toContain('OCCCA');
      expect(prompt).toContain('OpenAI Compatible CLI Coding Agent');
    });

    it('includes the system section', () => {
      expect(prompt).toContain('# System');
    });

    it('includes the doing tasks section', () => {
      expect(prompt).toContain('# Doing tasks');
    });

    it('includes the executing actions section', () => {
      expect(prompt).toContain('# Executing actions');
    });

    it('includes the using tools section', () => {
      expect(prompt).toContain('# Using your tools');
    });

    it('includes the file search behavior section', () => {
      expect(prompt).toContain('# File search and .gitignore behavior');
    });

    it('includes the tone and style section', () => {
      expect(prompt).toContain('# Tone and style');
    });

    it('includes the output efficiency section', () => {
      expect(prompt).toContain('# Output efficiency');
    });

    it('includes the environment section', () => {
      expect(prompt).toContain('# Environment');
    });
  });

  describe('.gitignore behavior documentation', () => {
    it('documents Grep as respecting .gitignore', () => {
      expect(prompt).toContain('Grep');
      expect(prompt).toMatch(/Grep.*Respects .gitignore/s);
    });

    it('documents Glob as NOT respecting .gitignore', () => {
      expect(prompt).toContain('Glob');
      expect(prompt).toMatch(/Glob.*Does NOT respect .gitignore/s);
    });

    it('documents LS as respecting .gitignore', () => {
      expect(prompt).toMatch(/LS.*Respects .gitignore/s);
    });

    it('mentions the security denylist', () => {
      expect(prompt).toContain('sensitive files');
    });
  });

  describe('environment context', () => {
    it('includes the model name from the argument', () => {
      expect(prompt).toContain('test-model');
    });

    it('includes the current platform', () => {
      expect(prompt).toContain(process.platform);
    });

    it('includes working directory information', () => {
      expect(prompt).toContain('working directory');
    });

    it('includes git commit guidance', () => {
      expect(prompt).toContain('Committing changes');
    });
  });

  describe('tool usage guidance', () => {
    it('instructs to use Read instead of cat', () => {
      expect(prompt).toContain('Read');
      expect(prompt).toContain('cat');
    });

    it('instructs to use Grep instead of rg/grep', () => {
      expect(prompt).toContain('Grep');
      expect(prompt).toContain('grep');
    });

    it('instructs to use Glob instead of find', () => {
      expect(prompt).toContain('Glob');
      expect(prompt).toContain('find');
    });
  });
});
