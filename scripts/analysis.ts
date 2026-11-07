/**
 * End-term Part C: repeatable data analysis. Loads the CSV export of the admin panel into an in-memory SQLite
 * database (Node's built-in node:sqlite, no install) and runs analysis/queries.sql, printing each result as a table.
 *
 *   npm run analysis                 uses analysis/data/{attendance,grades,risk}.csv
 *   npm run analysis -- <folder>     uses a fresh export (Administration → Backups → Prepare CSV)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** RFC 4180 CSV (quoted fields, "" escapes, UTF-8 BOM from the Excel-friendly export). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) { if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

const dir = process.argv[2] ?? join('analysis', 'data');
const db = new DatabaseSync(':memory:');
for (const table of ['attendance', 'grades', 'risk']) {
  const [header, ...rows] = parseCsv(readFileSync(join(dir, `${table}.csv`), 'utf8'));
  if (!header) throw new Error(`${table}.csv is empty`);
  db.exec(`CREATE TABLE ${table} (${header.map((h) => `"${h}"`).join(', ')})`);
  const ins = db.prepare(`INSERT INTO ${table} VALUES (${header.map(() => '?').join(', ')})`);
  db.exec('BEGIN'); for (const r of rows) ins.run(...r.map((v) => (v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v))); db.exec('COMMIT');
  console.log(`${table}: ${rows.length} rows`);
}

const sql = readFileSync(join('analysis', 'queries.sql'), 'utf8');
const blocks = sql.split(/;\s*\n/).map((b) => b.trim()).filter((b) => /select/i.test(b));
for (const block of blocks) {
  // title = the comment lines right above the query (the file header is skipped)
  const lines = block.split('\n'); const first = lines.findIndex((l) => l.trim() && !l.startsWith('--'));
  let k = first; while (k > 0 && lines[k - 1]!.startsWith('--')) k--;
  const title = lines.slice(k, first).map((l) => l.replace(/^--\s?/, '')).join(' ').trim();
  const query = block.split('\n').filter((l) => !l.startsWith('--')).join('\n');
  console.log(`\n${title}`);
  console.table(db.prepare(query).all());
}
