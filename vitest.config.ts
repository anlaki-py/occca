import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use the same module resolution as the project
    include: ['tests/**/*.test.ts'],
    // Generous timeout for tests that spawn git subprocesses
    testTimeout: 15000,
  },
});
