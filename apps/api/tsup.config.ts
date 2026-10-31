import { defineConfig } from 'tsup';

export default defineConfig({
  // seed.js lets the container seed the demo account without dev dependencies (see Dockerfile)
  entry: { index: 'src/index.ts', seed: 'prisma/seed.ts' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // The shared package ships TypeScript source, so bundle it in.
  noExternal: ['@pdf-analyzer/shared']
});
