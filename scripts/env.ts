// Loads the root .env for scripts (Node >= 20.12 has process.loadEnvFile; no dotenv dependency).
import { existsSync } from 'node:fs';
import { resolveFirebaseConfig } from '../packages/data/src/firebase.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

export const firebaseTarget = resolveFirebaseConfig(process.env);
export const projectId = firebaseTarget.config.projectId!;
