// Offline demo adapter: an in-memory stand-in for the subset of `firebase/firestore` that
// @aitu/data uses. Built only with `--mode offline` (see tools/offline/README.md). It exists so the
// End-term demo still works when the network or Firebase is down. It does NOT enforce Security
// Rules — rules are demonstrated against the real project (npm run check:student).
import { buildSeed, SeedTimestamp } from '../../scripts/seed-data.ts';

export class Timestamp {
  readonly seconds: number;
  readonly nanoseconds: number;
  constructor(seconds: number, nanoseconds: number) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
  static fromMillis(ms: number): Timestamp { return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
  static now(): Timestamp { return Timestamp.fromMillis(Date.now()); }
  static fromDate(d: Date): Timestamp { return Timestamp.fromMillis(d.getTime()); }
  toMillis(): number { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
  toDate(): Date { return new Date(this.toMillis()); }
}

const SERVER_TS = { __serverTimestamp: true } as const;
export const serverTimestamp = () => SERVER_TS;
class ArrayOp { readonly kind: 'union' | 'remove'; readonly items: unknown[]; constructor(kind: 'union' | 'remove', items: unknown[]) { this.kind = kind; this.items = items; } }
export const arrayUnion = (...items: unknown[]) => new ArrayOp('union', items);
export const arrayRemove = (...items: unknown[]) => new ArrayOp('remove', items);

type Data = Record<string, unknown>;
export interface Firestore { type: 'firestore' }
export interface CollectionReference { type: 'collection'; path: string; id: string }
export interface DocumentReference { type: 'document'; path: string; id: string; parent: CollectionReference }
interface Filter { kind: 'where'; field: string; op: '==' | 'array-contains' | 'in'; value: unknown }
interface Order { kind: 'orderBy'; field: string; dir: 'asc' | 'desc' }
interface Limit { kind: 'limit'; n: number }
type Constraint = Filter | Order | Limit;
export interface Query { type: 'query'; collection: CollectionReference; filters: Filter[]; order: Order[]; max: number | null }
export type Unsubscribe = () => void;
export type Transaction = ReturnType<typeof makeTx>;

const DB: Firestore = { type: 'firestore' };
export const getFirestore = (_app?: unknown): Firestore => DB;
export const connectFirestoreEmulator = (..._a: unknown[]) => {};

// ---------- storage: seed (deterministic) + persisted deltas, synced across tabs ----------
const KEY = 'aitu-offline-deltas-v1';
const store = new Map<string, Map<string, Data>>(); // collectionPath -> id -> data
const split = (path: string) => { const i = path.lastIndexOf('/'); return [path.slice(0, i), path.slice(i + 1)] as const; };

function revive(v: unknown): unknown {
  if (v instanceof SeedTimestamp) return Timestamp.fromMillis(v.ms);
  if (v && typeof v === 'object') {
    if ('__ts' in (v as Data)) return Timestamp.fromMillis((v as { __ts: number }).__ts);
    if (Array.isArray(v)) return v.map(revive);
    return Object.fromEntries(Object.entries(v as Data).map(([k, x]) => [k, revive(x)]));
  }
  return v;
}
const freeze = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (_k, x) => (x instanceof Timestamp ? { __ts: x.toMillis() } : x)));

function put(path: string, data: Data | null) {
  const [c, id] = split(path);
  let m = store.get(c);
  if (!m) store.set(c, (m = new Map()));
  if (data == null) m.delete(id); else m.set(id, data);
}

function readDeltas(): { path: string; data: Data | null }[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
const SEED_NOW = (() => { try { const v = Number(localStorage.getItem(KEY + ':now')); if (v) return v; const n = Date.now(); localStorage.setItem(KEY + ':now', String(n)); return n; } catch { return Date.now(); } })();
for (const d of buildSeed(SEED_NOW).docs) put(d.path, revive(d.data) as Data);
for (const d of readDeltas()) put(d.path, d.data == null ? null : (revive(d.data) as Data));

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(KEY) : null;
channel?.addEventListener('message', (e: MessageEvent) => {
  for (const d of e.data as { path: string; data: Data | null }[]) put(d.path, d.data == null ? null : (revive(d.data) as Data));
  notify();
});

function commit(writes: { path: string; data: Data | null }[]) {
  for (const w of writes) put(w.path, w.data);
  const frozen = writes.map((w) => ({ path: w.path, data: w.data == null ? null : (freeze(w.data) as Data) }));
  try { localStorage.setItem(KEY, JSON.stringify([...readDeltas(), ...frozen])); } catch { /* storage full or blocked: tab-local only */ }
  channel?.postMessage(frozen);
  notify();
}

/** Reset the offline demo to the pristine seed (Teacher/My DU login pages call this from a hidden key combo). */
export function resetOfflineDemo() { try { localStorage.removeItem(KEY); localStorage.removeItem(KEY + ':now'); } catch { /* ignore */ } location.reload(); }

// ---------- references ----------
let autoId = 0;
const newId = () => `off${Date.now().toString(36)}${(autoId++).toString(36)}`;
const colRef = (path: string): CollectionReference => ({ type: 'collection', path, id: split(path)[1] || path });
const docRef = (path: string): DocumentReference => { const [c, id] = split(path); return { type: 'document', path, id, parent: colRef(c) }; };

export function collection(base: Firestore | DocumentReference, ...segs: string[]): CollectionReference {
  const prefix = (base as DocumentReference).type === 'document' ? (base as DocumentReference).path + '/' : '';
  return colRef(prefix + segs.join('/'));
}
export function doc(base: Firestore | CollectionReference, ...segs: string[]): DocumentReference {
  if ((base as CollectionReference).type === 'collection') return docRef(`${(base as CollectionReference).path}/${segs.length ? segs.join('/') : newId()}`);
  return docRef(segs.join('/'));
}
export function where(field: string, op: Filter['op'], value: unknown): Filter { return { kind: 'where', field, op, value }; }
export function orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): Order { return { kind: 'orderBy', field, dir }; }
export function limit(n: number): Limit { return { kind: 'limit', n }; }
export function query(c: CollectionReference | Query, ...cs: Constraint[]): Query {
  const base: Query = (c as Query).type === 'query' ? (c as Query) : { type: 'query', collection: c as CollectionReference, filters: [], order: [], max: null };
  return {
    ...base,
    filters: [...base.filters, ...cs.filter((x): x is Filter => x.kind === 'where')],
    order: [...base.order, ...cs.filter((x): x is Order => x.kind === 'orderBy')],
    max: cs.find((x): x is Limit => x.kind === 'limit')?.n ?? base.max,
  };
}

// ---------- snapshots ----------
const META = { fromCache: false, hasPendingWrites: false };
class DocSnap {
  readonly id: string; readonly ref: DocumentReference; readonly metadata = META; private readonly d: Data | undefined;
  constructor(ref: DocumentReference, d: Data | undefined) { this.ref = ref; this.id = ref.id; this.d = d; }
  exists() { return this.d !== undefined; }
  data(_o?: unknown) { return this.d; }
  get(f: string) { return this.d?.[f]; }
}
const snapOf = (ref: DocumentReference) => new DocSnap(ref, store.get(ref.parent.path)?.get(ref.id));

function matches(d: Data, f: Filter): boolean {
  const v = d[f.field];
  if (f.op === '==') return v === f.value;
  if (f.op === 'array-contains') return Array.isArray(v) && v.includes(f.value);
  return Array.isArray(f.value) && f.value.includes(v);
}
const sortable = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : v as number | string);
function runQuery(q: Query | CollectionReference) {
  const qq: Query = (q as Query).type === 'query' ? (q as Query) : { type: 'query', collection: q as CollectionReference, filters: [], order: [], max: null };
  const m = store.get(qq.collection.path) ?? new Map<string, Data>();
  let rows = [...m.entries()].filter(([, d]) => qq.filters.every((f) => matches(d, f))).sort(([a], [b]) => (a < b ? -1 : 1));
  for (const o of [...qq.order].reverse()) {
    rows = rows.filter(([, d]) => d[o.field] != null).sort(([, a], [, b]) => {
      const x = sortable(a[o.field]), y = sortable(b[o.field]);
      return (x < y ? -1 : x > y ? 1 : 0) * (o.dir === 'desc' ? -1 : 1);
    });
  }
  if (qq.max != null) rows = rows.slice(0, qq.max);
  const docs = rows.map(([id, d]) => new DocSnap(docRef(`${qq.collection.path}/${id}`), d));
  return { docs, size: docs.length, empty: docs.length === 0, metadata: META, forEach: (fn: (s: DocSnap) => void) => docs.forEach(fn) };
}

// ---------- reads, listeners ----------
const LATENCY = 60; // ms: keep the UI's loading states honest
const wait = () => new Promise((r) => setTimeout(r, LATENCY));
export async function getDoc(ref: DocumentReference) { await wait(); return snapOf(ref); }
export async function getDocs(q: Query | CollectionReference) { await wait(); return runQuery(q); }

type Listener = () => void;
const listeners = new Set<Listener>();
function notify() { for (const l of [...listeners]) l(); }

export function onSnapshot(target: DocumentReference | Query | CollectionReference, ...rest: unknown[]): Unsubscribe {
  const fns = rest.filter((x) => typeof x === 'function') as ((v: unknown) => void)[];
  const [next, onError] = fns;
  let last = '';
  const emit = () => {
    try {
      const snap = target.type === 'document' ? snapOf(target) : runQuery(target);
      const sig = JSON.stringify(freeze(target.type === 'document' ? (snap as DocSnap).data() ?? null : (snap as ReturnType<typeof runQuery>).docs.map((d) => [d.id, d.data()])));
      if (sig === last) return;
      last = sig;
      next?.(snap);
    } catch (e) { onError?.(e); }
  };
  const t = setTimeout(emit, LATENCY);
  listeners.add(emit);
  return () => { clearTimeout(t); listeners.delete(emit); };
}

// ---------- writes ----------
function resolve(data: Data, prev?: Data): Data {
  const now = Timestamp.now();
  data = Object.fromEntries(Object.entries(data).map(([k, v]) => {
    if (!(v instanceof ArrayOp)) return [k, v];
    const cur = Array.isArray(prev?.[k]) ? [...(prev![k] as unknown[])] : [];
    return [k, v.kind === 'union' ? [...cur, ...v.items.filter((x) => !cur.includes(x))] : cur.filter((x) => !v.items.includes(x))];
  }));
  const r = (v: unknown): unknown => (v === SERVER_TS ? now : v && typeof v === 'object' && !(v instanceof Timestamp) && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Data).map(([k, x]) => [k, r(x)])) : v);
  return r(data) as Data;
}
const err = (code: string, msg: string) => Object.assign(new Error(msg), { code });

export async function setDoc(ref: DocumentReference, data: Data, opts?: { merge?: boolean }) {
  await wait();
  const prev = store.get(ref.parent.path)?.get(ref.id);
  commit([{ path: ref.path, data: opts?.merge && prev ? { ...prev, ...resolve(data, prev) } : resolve(data) }]);
}
export async function updateDoc(ref: DocumentReference, data: Data) {
  await wait();
  const prev = store.get(ref.parent.path)?.get(ref.id);
  if (!prev) throw err('not-found', `No document to update: ${ref.path}`);
  commit([{ path: ref.path, data: { ...prev, ...resolve(data, prev) } }]);
}
export async function deleteDoc(ref: DocumentReference) { await wait(); commit([{ path: ref.path, data: null }]); }

function makeTx(writes: { path: string; data: Data | null }[]) {
  const staged = new Map<string, Data | null>();
  const current = (ref: DocumentReference) => (staged.has(ref.path) ? staged.get(ref.path) ?? undefined : store.get(ref.parent.path)?.get(ref.id));
  const stage = (ref: DocumentReference, d: Data | null) => { staged.set(ref.path, d); writes.push({ path: ref.path, data: d }); };
  return {
    async get(ref: DocumentReference) { return new DocSnap(ref, current(ref)); },
    set(ref: DocumentReference, data: Data, opts?: { merge?: boolean }) { const p = current(ref); stage(ref, opts?.merge && p ? { ...p, ...resolve(data, p) } : resolve(data)); return this; },
    update(ref: DocumentReference, data: Data) { const p = current(ref); if (!p) throw err('not-found', `No document to update: ${ref.path}`); stage(ref, { ...p, ...resolve(data, p) }); return this; },
    delete(ref: DocumentReference) { stage(ref, null); return this; },
  };
}
export async function runTransaction<T>(_db: Firestore, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  await wait();
  const writes: { path: string; data: Data | null }[] = [];
  const out = await fn(makeTx(writes));
  commit(writes);
  return out;
}
export function writeBatch(_db: Firestore) {
  // Like Firestore: nothing is applied until commit(); an update of a missing document fails the whole batch.
  const ops: ((tx: Transaction) => void)[] = [];
  const b = {
    set(ref: DocumentReference, data: Data, opts?: { merge?: boolean }) { ops.push((tx) => tx.set(ref, data, opts)); return b; },
    update(ref: DocumentReference, data: Data) { ops.push((tx) => tx.update(ref, data)); return b; },
    delete(ref: DocumentReference) { ops.push((tx) => tx.delete(ref)); return b; },
    async commit() {
      await wait();
      const writes: { path: string; data: Data | null }[] = [];
      const tx = makeTx(writes);
      for (const op of ops) op(tx);
      commit(writes);
    },
  };
  return b;
}

// type-only names used by @aitu/data
export type DocumentSnapshot = DocSnap;
export type QueryDocumentSnapshot = DocSnap;
