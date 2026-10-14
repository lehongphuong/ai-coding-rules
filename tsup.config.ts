import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/cli/main.ts' },
  format: ['esm'],
  target: 'node20',
  dts: { entry: { index: 'src/index.ts' } },
  clean: true,
  sourcemap: true,
});
