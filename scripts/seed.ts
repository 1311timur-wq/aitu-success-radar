/**
 * Loads the synthetic demo dataset. No real AITU data.
 *
 *   Cloud project (FIREBASE_PROJECT_ID in .env):  npm run seed -- --yes
 *     needs GOOGLE_APPLICATION_CREDENTIALS = path to a service-account key (never commit it).
 *     Replaces ONLY the demo dataset (ids starting with "demo-": accounts, profiles, courses, their join codes).
 *     Real data survives: self-registered students, admin-created teachers and courses. Students who had
 *     joined a demo course with a code are put back into it after the reseed.
 *   Local emulator (no project id, or USE_EMULATORS=true):  npm run emulators, then npm run seed
 *
 * Scenarios for the main demo student (Арман Серикбаев, student01@demo.aitu.kz):
 *   Calculus 1 -> HIGH, Programming -> LOW, Linear Algebra -> MEDIUM, English -> UNKNOWN.
 * Live-demo material: the last Calculus lecture is a saved DRAFT, Quiz 2 has draft grades (Calculus),
 * and a Calculus lecture is scheduled for today.
 */
import { existsSync } from 'node:fs';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp, type Firestore, type WriteBatch } from 'firebase-admin/firestore';
import { firebaseTarget, projectId } from './env.ts';
import { buildSeed, DEMO_PREFIX, SeedTimestamp, SEED_PASSWORD, STUDENTS, TEACHERS, type SeedAccount } from './seed-data.ts';

class Writer {
  private readonly db: Firestore;
  private batch: WriteBatch; private n = 0; private pending: Promise<unknown>[] = []; count = 0;
  constructor(db: Firestore) { this.db = db; this.batch = db.batch(); }
  set(path: string, data: Record<string, unknown>) {
    this.batch.set(this.db.doc(path), data); this.n++; this.count++;
    if (this.n === 450) { this.pending.push(this.batch.commit()); this.batch = this.db.batch(); this.n = 0; }
  }
  async flush() { if (this.n) this.pending.push(this.batch.commit()); await Promise.all(this.pending); }
}

function toFirestore(v: unknown): unknown {
  if (v instanceof SeedTimestamp) return Timestamp.fromMillis(v.ms);
  if (Array.isArray(v)) return v.map(toFirestore);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFirestore(x)]));
  return v;
}

async function resetEmulators() {
  const r1 = await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  const r2 = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${projectId}/accounts`, { method: 'DELETE' });
  if (!r1.ok || !r2.ok) throw new Error('Emulators are not reachable. Start them first: npm run emulators');
}

/** Non-demo students enrolled in demo courses (joined with a code / added by an admin) — re-added after the reseed. */
interface KeptEnrollment { offeringId: string; uid: string; data: Record<string, unknown> }

async function resetCloud(auth: Auth, db: Firestore, accounts: SeedAccount[]): Promise<KeptEnrollment[]> {
  const kept: KeptEnrollment[] = [];
  const demoOfferings = (await db.collection('offerings').get()).docs.filter((d) => d.id.startsWith(DEMO_PREFIX));
  for (const o of demoOfferings) {
    for (const e of (await o.ref.collection('enrollments').get()).docs) {
      if (!e.id.startsWith(DEMO_PREFIX) && e.get('status') === 'active') kept.push({ offeringId: o.id, uid: e.id, data: e.data() });
    }
    await db.recursiveDelete(o.ref);
  }
  const res = await auth.deleteUsers(accounts.map((a) => a.uid)); // unknown uids are simply skipped
  for (const d of (await db.collection('users').get()).docs) if (d.id.startsWith(DEMO_PREFIX)) await db.recursiveDelete(d.ref);
  for (const d of (await db.collection('joinCodes').get()).docs) if (String(d.get('offeringId')).startsWith(DEMO_PREFIX)) await d.ref.delete();
  await db.doc('stats/latest').delete().catch(() => {});
  console.log(`Reset: ${accounts.length - res.failureCount} demo accounts and ${demoOfferings.length} demo courses removed; ${kept.length} enrollments of real students kept.`);
  return kept;
}

async function restoreKept(db: Firestore, kept: KeptEnrollment[]) {
  for (const k of kept) {
    const off = db.doc(`offerings/${k.offeringId}`);
    if (!(await off.get()).exists) continue;
    await off.update({ studentUids: FieldValue.arrayUnion(k.uid) });
    await off.collection('enrollments').doc(k.uid).set(k.data);
  }
  if (kept.length) console.log(`Re-added ${kept.length} real students to their demo courses.`);
}

async function main() {
  const cloud = !firebaseTarget.useEmulators;
  if (cloud) {
    if (!process.argv.includes('--yes')) {
      throw new Error(`This will WIPE demo data in the cloud project "${projectId}" and load it again.\nRun: npm run seed -- --yes`);
    }
    const key = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!key || !existsSync(key)) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS in .env must point to the service-account key file (Project settings -> Service accounts -> Generate new private key).');
    }
  } else {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
  }

  const app = initializeApp(cloud ? { projectId, credential: applicationDefault() } : { projectId });
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { accounts, docs } = buildSeed(Date.now());

  console.log(`Target: ${cloud ? `cloud project ${projectId}` : 'local emulator'}`);
  const kept = cloud ? await resetCloud(auth, db, accounts) : (await resetEmulators(), []);

  for (const p of accounts) {
    await auth.createUser({ uid: p.uid, email: p.email, password: SEED_PASSWORD, displayName: p.displayName });
    // Admin power lives in the ID token (custom claim), never in a document a client could write.
    if (p.admin) await auth.setCustomUserClaims(p.uid, { admin: true });
  }
  const w = new Writer(db);
  for (const d of docs) w.set(d.path, toFirestore(d.data) as Record<string, unknown>);
  await w.flush();
  await restoreKept(db, kept);

  console.log(`Seeded ${w.count} documents, ${accounts.length} accounts (password: ${SEED_PASSWORD}).`);
  console.log('Admin: admin@demo.aitu.kz');
  console.log('Teachers:', TEACHERS.map((t) => t.email).join(', '));
  console.log('Main demo student:', STUDENTS[0]!.email);
}

main().then(() => process.exit(0), (e: unknown) => {
  const err = e as { code?: unknown; message?: string };
  const msg = err.message ?? String(e);
  if (err.code === 5 || /NOT_FOUND/.test(msg)) console.error('Firestore database not found: create it in Firebase Console -> Firestore Database -> Create database.');
  else if (/CONFIGURATION_NOT_FOUND|auth\/configuration-not-found/.test(msg)) console.error('Enable Authentication -> Sign-in method -> Email/Password in Firebase Console.');
  else console.error(msg);
  process.exit(1);
});
