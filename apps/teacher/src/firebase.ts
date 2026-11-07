import { initFirebase, resolveFirebaseConfig } from '@aitu/data';

// Values come from the ROOT .env (vite.config.ts: envDir + envPrefix). See .env.example.
export const fb = initFirebase(resolveFirebaseConfig(import.meta.env));

/** Demo account buttons on the login page (synthetic data only). Hide with DEMO_ACCOUNTS=false. */
export const showDemoAccounts = fb.usingEmulators || import.meta.env.DEMO_ACCOUNTS !== 'false';
