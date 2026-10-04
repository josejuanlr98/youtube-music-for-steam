import { build } from 'esbuild';
import { persistentDialIdentity } from './cast_receiver_patch.mjs';

await build({
  entryPoints: ['backend/src/server.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'backend/out/server.cjs',
  external: ['bufferutil', 'utf-8-validate'],
  plugins: [persistentDialIdentity],
  logLevel: 'info',
});
