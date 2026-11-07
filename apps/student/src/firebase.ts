import { initFirebase, resolveFirebaseConfig } from '@aitu/data';

// Values come from the ROOT .env (vite.config.js: envDir + envPrefix). Same project as the Teacher Portal.
export const fb = initFirebase(resolveFirebaseConfig(import.meta.env));
export const showDemoAccounts = fb.usingEmulators || import.meta.env.DEMO_ACCOUNTS !== 'false';
