import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  clean: true,
  format: ['esm'],
  platform: 'node',
  sourcemap: true,
  target: 'node24',
});
