import { initializeApp, getApps, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';

export interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  usingEmulators: boolean;
  /** Needed to create accounts for other people from a second, throw-away app instance (admin panel). */
  config: FirebaseOptions;
  emulatorHost: string;
}

export interface InitOptions {
  config: FirebaseOptions;
  /** Connect to the local Emulator Suite (Auth 9099, Firestore 8080). */
  useEmulators: boolean;
  emulatorHost?: string;
}

/** Project id starting with `demo-` never touches a real Firebase project. */
export const DEMO_CONFIG: FirebaseOptions = {
  apiKey: 'demo-api-key',
  authDomain: 'demo-aitu-radar.firebaseapp.com',
  projectId: 'demo-aitu-radar',
  appId: 'demo-app',
};

/**
 * One configuration rule for the portal (import.meta.env) and the scripts (process.env), both fed
 * from the root `.env`: a real project when FIREBASE_PROJECT_ID is set, the local emulator otherwise
 * (or when USE_EMULATORS=true).
 */
export function resolveFirebaseConfig(env: Record<string, string | boolean | undefined>): { config: FirebaseOptions; useEmulators: boolean } {
  const str = (k: string) => (typeof env[k] === 'string' && (env[k] as string).trim() ? (env[k] as string).trim() : undefined);
  const projectId = str('FIREBASE_PROJECT_ID');
  const useEmulators = str('USE_EMULATORS') === 'true' || !projectId;
  if (useEmulators) return { config: DEMO_CONFIG, useEmulators };
  const config: FirebaseOptions = {
    projectId,
    apiKey: str('FIREBASE_API_KEY'),
    authDomain: str('FIREBASE_AUTH_DOMAIN') ?? `${projectId}.firebaseapp.com`,
    appId: str('FIREBASE_APP_ID'),
  };
  if (!config.apiKey) throw new Error('FIREBASE_API_KEY is missing in .env (Project settings -> Your apps -> Web app)');
  return { config, useEmulators };
}

let handles: FirebaseHandles | null = null;

/** Idempotent: one Firebase app per page, emulators connected exactly once. */
export function initFirebase({ config, useEmulators, emulatorHost = '127.0.0.1' }: InitOptions): FirebaseHandles {
  if (handles) return handles;
  const app = getApps()[0] ?? initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (useEmulators) {
    connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, emulatorHost, 8080);
  }
  handles = { app, auth, db, usingEmulators: useEmulators, config, emulatorHost };
  return handles;
}

/** Tests only: run the data layer against a rules-unit-testing Firestore instance. */
export function setFirestoreForTesting(db: Firestore): void {
  handles = { app: handles?.app ?? (null as unknown as FirebaseApp), auth: handles?.auth ?? (null as unknown as Auth), db, usingEmulators: true, config: DEMO_CONFIG, emulatorHost: '127.0.0.1' };
}

export function firebase(): FirebaseHandles {
  if (!handles) throw new Error('initFirebase() must be called before using the data layer');
  return handles;
}
