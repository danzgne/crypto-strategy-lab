import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  clean: true,
  format: ['esm'],
  noExternal: ['@crypto-strategy-lab/shared'],
  platform: 'node',
  sourcemap: true,
  target: 'node24',
});
