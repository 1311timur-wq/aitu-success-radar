import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// `--mode offline`: same in-memory Firebase adapter as the Teacher Portal (tools/offline).
const offline = fileURLToPath(new URL('../../tools/offline/', import.meta.url))

// base './' keeps the build relocatable: it is served from /my-du/ on Firebase Hosting.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react()],
  resolve: { alias: mode === 'offline' ? [{ find: /^firebase\/(app|auth|firestore)$/, replacement: `${offline}$1.ts` }] : [] },
  // One .env for the whole repo (see .env.example). Only these prefixes reach the browser.
  envDir: '../../',
  envPrefix: ['FIREBASE_', 'USE_EMULATORS', 'DEMO_ACCOUNTS'],
  build: { outDir: '../../dist/hosting/my-du', emptyOutDir: false },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
}))
