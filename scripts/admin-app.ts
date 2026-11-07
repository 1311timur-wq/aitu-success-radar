// Admin SDK bootstrap shared by the maintenance scripts (backup, restore, make-admin, iot-simulate).
// Cloud: needs GOOGLE_APPLICATION_CREDENTIALS (service-account key OUTSIDE the project). Emulator: no key.
import { existsSync } from 'node:fs';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { firebaseTarget, projectId } from './env.ts';

export function adminApp() {
  const cloud = !firebaseTarget.useEmulators;
  if (cloud) {
    const key = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!key || !existsSync(key)) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS in .env must point to the service-account key file (Project settings -> Service accounts -> Generate new private key). Keep it OUTSIDE the project folder.');
    }
  } else {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
  }
  const app = initializeApp(cloud ? { projectId, credential: applicationDefault() } : { projectId });
  return { cloud, projectId, auth: getAuth(app), db: getFirestore(app), label: cloud ? `cloud project ${projectId}` : 'local emulator' };
}

export const flag = (name: string) => process.argv.includes(`--${name}`);
export function option(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function run(main: () => Promise<void>) {
  main().then(() => process.exit(0), (e: unknown) => { console.error((e as Error).message ?? e); process.exit(1); });
}
