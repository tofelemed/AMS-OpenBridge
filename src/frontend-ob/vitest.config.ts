import { defineConfig } from 'vitest/config';

// `npm test` — unit tests only (hooks, pure helpers). The stack-level checks stay in
// scripts/*.ps1; nothing here needs a running service.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
