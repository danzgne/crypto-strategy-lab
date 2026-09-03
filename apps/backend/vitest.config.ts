import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests share one real Postgres instance and some (e.g.
    // newsRoutes.test.ts) truncate whole tables in beforeAll/afterAll, which races
    // against any other file's rows when files run in parallel worker threads.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
