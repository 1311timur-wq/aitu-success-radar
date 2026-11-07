/**
 * Full backup of Firestore (every collection and sub-collection, incl. students' plan ticks) + the list of
 * Auth accounts (no passwords) into backups/<date>.json. Backups contain personal data: keep them private,
 * they are git-ignored.
 *
 *   npm run backup                 → backups/aitu-radar-<date>.json
 *   npm run backup -- --out x.json
 * Restore: npm run restore -- backups/<file>.json --yes
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Timestamp, type CollectionReference, type DocumentReference } from 'firebase-admin/firestore';
import { adminApp, option, run } from './admin-app.ts';

const BACKUP_FORMAT = 'aitu-success-radar-backup';
const BACKUP_VERSION = 2;

function toJson(v: unknown): unknown {
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(toJson);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, toJson(x)]));
  return v;
}

run(async () => {
  const { auth, db, label, projectId } = adminApp();
  const documents: Record<string, unknown> = {};
  const walk = async (col: CollectionReference) => {
    const snap = await col.get();
    for (const d of snap.docs) {
      documents[d.ref.path] = toJson(d.data());
      for (const sub of await (d.ref as DocumentReference).listCollections()) await walk(sub);
    }
  };
  for (const col of await db.listCollections()) await walk(col);

  const accounts: unknown[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) accounts.push({ uid: u.uid, email: u.email ?? null, displayName: u.displayName ?? null, disabled: u.disabled, emailVerified: u.emailVerified, admin: u.customClaims?.admin === true, created: u.metadata.creationTime });
    pageToken = page.pageToken;
  } while (pageToken);

  const at = new Date();
  const out = option('out') ?? `backups/aitu-radar-${at.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  mkdirSync(dirname(out), { recursive: true });
  const payload = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: at.toISOString(), projectId, source: 'admin-sdk', count: Object.keys(documents).length, accounts, documents };
  writeFileSync(out, JSON.stringify(payload));
  console.log(`Backup of ${label}: ${payload.count} documents, ${accounts.length} accounts → ${out}`);
});
