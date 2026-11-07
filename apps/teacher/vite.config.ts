import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

// `--mode offline`: Firebase SDK replaced by the in-memory demo adapter (tools/offline) — End-term backup without network.
const offline = fileURLToPath(new URL('../../tools/offline/', import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: { alias: mode === 'offline' ? [{ find: /^firebase\/(app|auth|firestore)$/, replacement: `${offline}$1.ts` }] : [] },
  // One .env for the whole repo. Only these prefixes reach the browser:
  // GOOGLE_APPLICATION_CREDENTIALS (the service-account key path) is never exposed.
  envDir: '../../',
  envPrefix: ['FIREBASE_', 'USE_EMULATORS', 'DEMO_ACCOUNTS'],
  // Hosting layout: portal at /, My DU at /my-du/ (built after this one, see `npm run build`).
  build: { outDir: '../../dist/hosting', emptyOutDir: true },
  server: { port: 5174, host: true },
  preview: { port: 4174 },
}));
