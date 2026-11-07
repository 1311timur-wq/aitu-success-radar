/**
 * Restores Firestore from a backup made by `npm run backup` or by the admin panel ("Резервная копия").
 *
 *   npm run restore -- backups/<file>.json --yes            write every document back (overwrite same ids)
 *   npm run restore -- backups/<file>.json --yes --wipe     first delete the collections present in the file
 *   npm run restore -- backups/<file>.json                  dry run: only prints what would happen
 * Auth accounts and passwords are NOT restored (Firebase keeps them separately); missing users reset their password.
 */
import { readFileSync } from 'node:fs';
import { Timestamp } from 'firebase-admin/firestore';
import { adminApp, flag, run } from './admin-app.ts';

const FORMAT = 'aitu-success-radar-backup';

function fromJson(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(fromJson);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Object.keys(o).length === 1 && typeof o.__ts === 'number') return Timestamp.fromMillis(o.__ts);
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, fromJson(x)]));
  }
  return v;
}

run(async () => {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!file) throw new Error('Usage: npm run restore -- <backup.json> [--yes] [--wipe]');
  const backup = JSON.parse(readFileSync(file, 'utf8')) as { format?: string; version?: number; exportedAt?: string; documents?: Record<string, unknown> };
  if (backup.format !== FORMAT || !backup.documents) throw new Error(`${file} is not an AITU Success Radar backup.`);
  const paths = Object.keys(backup.documents).sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  const bad = paths.filter((p) => p.split('/').length % 2 !== 0 || p.split('/').some((s) => !s));
  if (bad.length) throw new Error(`Invalid document paths in backup, e.g. ${bad[0]}`);
  const tops = [...new Set(paths.map((p) => p.split('/')[0]!))];
  const { db, label } = adminApp();
  console.log(`Backup from ${backup.exportedAt} (v${backup.version}): ${paths.length} documents in ${tops.join(', ')}. Target: ${label}.`);
  if (!flag('yes')) { console.log('Dry run. Add --yes to write (and --wipe to delete those collections first).'); return; }

  if (flag('wipe')) for (const t of tops) { await db.recursiveDelete(db.collection(t)); console.log(`  wiped ${t}`); }
  let batch = db.batch(), n = 0, written = 0;
  for (const p of paths) {
    batch.set(db.doc(p), fromJson(backup.documents[p]) as Record<string, unknown>);
    if (++n === 400) { await batch.commit(); written += n; n = 0; batch = db.batch(); process.stdout.write(`\r  ${written}/${paths.length}`); }
  }
  if (n) { await batch.commit(); written += n; }
  console.log(`\rRestored ${written} documents into ${label}.`);
});
