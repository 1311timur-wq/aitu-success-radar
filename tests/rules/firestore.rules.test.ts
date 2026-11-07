// Security Rules acceptance tests (architecture 08: RULE-01..04, API-01..12 mapped to Rules-first).
// Run: npm run test:rules   (starts the Firestore emulator automatically)
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch, type Firestore,
} from 'firebase/firestore';
import { attendance, grade, makeEnv, O, O2, OUTSIDER, S1, S2, seedBase, T, T2 } from './helpers.ts';

let env: RulesTestEnvironment;
const as = (uid: string | null): Firestore =>
  (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore() as unknown as Firestore;
const rec = (db: Firestore, id: string) => doc(db, 'offerings', O, 'attendanceRecords', id);
const grd = (db: Firestore, id: string) => doc(db, 'offerings', O, 'assessmentRecords', id);

beforeAll(async () => { env = await makeEnv('demo-aitu-radar-rules'); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedBase(env); });

describe('student reads (R10 isolation)', () => {
  it('RULE-04 reads own published record', async () => { await assertSucceeds(getDoc(rec(as(S1), `held1_${S1}`))); });
  it('RULE-01 cannot read another student record', async () => { await assertFails(getDoc(rec(as(S1), `held1_${S2}`))); });
  it('API-09 cannot read own DRAFT grade', async () => { await assertFails(getDoc(grd(as(S1), `q1_${S1}`))); });
  it('RULE-03 anonymous reads nothing', async () => {
    await assertFails(getDoc(rec(as(null), `held1_${S1}`)));
    await assertFails(getDoc(doc(as(null), 'offerings', O)));
  });
  it('lists own offerings only with an owner-scoped query', async () => {
    const db = as(S1);
    await assertSucceeds(getDocs(query(collection(db, 'offerings'), where('studentUids', 'array-contains', S1))));
    await assertFails(getDocs(collection(db, 'offerings')));
  });
  it('queries own published records; unscoped query is denied', async () => {
    const db = as(S1);
    const c = collection(db, 'offerings', O, 'attendanceRecords');
    await assertSucceeds(getDocs(query(c, where('studentUid', '==', S1), where('publication', '==', 'published'))));
    await assertFails(getDocs(query(c, where('studentUid', '==', S1))));
    await assertFails(getDocs(c));
  });
  it('reads the schedule of an enrolled offering, not of others', async () => {
    await assertSucceeds(getDoc(doc(as(S1), 'offerings', O, 'sessions', 'held1')));
    await assertFails(getDoc(doc(as(OUTSIDER), 'offerings', O, 'sessions', 'held1')));
  });
  it('profile: own get only, never writable', async () => {
    await assertSucceeds(getDoc(doc(as(S1), 'users', S1)));
    await assertFails(getDoc(doc(as(S1), 'users', T)));
    await assertFails(setDoc(doc(as(S1), 'users', S1), { role: 'teacher' }));
  });
});

describe('student writes are always denied', () => {
  it('RULE-02 cannot write own attendance or grade', async () => {
    await assertFails(setDoc(rec(as(S1), `held1_${S1}`), attendance(S1, { revision: 2, updatedBy: S1 })));
    await assertFails(setDoc(grd(as(S1), `q1_${S1}`), grade(S1, { revision: 2, updatedBy: S1, points: 10 })));
  });
  it('API-05 cannot enrol self or become staff', async () => {
    await assertFails(updateDoc(doc(as(S1), 'offerings', O), { staffUids: [T, S1] }));
    await assertFails(updateDoc(doc(as(T), 'offerings', O), { staffUids: [T, T2] }));
  });
});

describe('teacher writes: membership and enrollment', () => {
  it('API-02 assigned teacher records attendance', async () => {
    await assertSucceeds(setDoc(rec(as(T), `held1_${S1}`), attendance(S1, { revision: 2, status: 'late', points: 1, publication: 'published', correction: { reason: 'опоздал на 10 минут', at: serverTimestamp(), previous: { status: 'present', points: 2 } } })));
  });
  it('API-01 teacher of another offering is denied', async () => {
    await assertFails(setDoc(rec(as(T2), `held1_${S1}`), attendance(S1, { revision: 2, updatedBy: T2 })));
  });
  it('API-03 cannot mark a student who is not enrolled', async () => {
    await assertFails(setDoc(rec(as(T), `held1_${OUTSIDER}`), attendance(OUTSIDER)));
  });
  it('document id must be {sessionId}_{studentUid}', async () => {
    await assertFails(setDoc(rec(as(T), `whatever`), attendance(S2, { sessionId: 'held1' })));
  });
  it('actor and time are enforced (no forged updatedBy / client clock)', async () => {
    await assertFails(setDoc(rec(as(T), `held1_${S2}`), attendance(S2, { revision: 2, publication: 'published', updatedBy: T2 })));
    await assertFails(setDoc(rec(as(T), `held1_${S2}`), attendance(S2, { revision: 2, publication: 'published', updatedAt: Timestamp.now() })));
  });
  it('unknown fields are rejected', async () => {
    await assertFails(setDoc(grd(as(T), `q1_${S2}`), { ...grade(S2), risk: 'low' }));
  });
});

describe('attendance invariants', () => {
  it('API-08 revision must be exactly +1 (stale write rejected)', async () => {
    await assertFails(setDoc(rec(as(T), `held1_${S2}`), attendance(S2, { revision: 1, publication: 'published' })));
    await assertFails(setDoc(rec(as(T), `held1_${S2}`), attendance(S2, { revision: 3, publication: 'published' })));
  });
  it('points within [0, session.maxPoints]; unmarked has no points', async () => {
    const db = as(T);
    await assertFails(setDoc(rec(db, `held1_${S2}`), attendance(S2, { revision: 2, publication: 'published', points: 3 })));
    await assertFails(setDoc(rec(db, `held1_${S2}`), attendance(S2, { revision: 2, publication: 'published', status: 'unmarked', points: 0 })));
  });
  it('cannot mark a cancelled session; scheduled only together with switching it to held', async () => {
    const db = as(T);
    await assertFails(setDoc(doc(db, 'offerings', O, 'attendanceRecords', `canc1_${S1}`), attendance(S1, { sessionId: 'canc1' })));
    await assertFails(setDoc(doc(db, 'offerings', O, 'attendanceRecords', `sched1_${S1}`), attendance(S1, { sessionId: 'sched1' })));
    const b = writeBatch(db);
    b.update(doc(db, 'offerings', O, 'sessions', 'sched1'), { status: 'held', revision: 2, updatedBy: T, updatedAt: serverTimestamp() });
    b.set(doc(db, 'offerings', O, 'attendanceRecords', `sched1_${S1}`), attendance(S1, { sessionId: 'sched1' }));
    await assertSucceeds(b.commit());
  });
  it('API-10 changing a PUBLISHED mark requires a correction reason', async () => {
    const db = as(T);
    await assertFails(setDoc(rec(db, `held1_${S2}`), attendance(S2, { revision: 2, publication: 'published', status: 'absent', points: 0 })));
    await assertSucceeds(setDoc(rec(db, `held1_${S2}`), attendance(S2, {
      revision: 2, publication: 'published', status: 'absent', points: 0,
      correction: { reason: 'ошибочно отмечен', at: serverTimestamp(), previous: { status: 'present', points: 2 } },
    })));
  });
  it('access-call budget: 8 records + session switch + audit fit in one commit', async () => {
    const db = as(T);
    await env.withSecurityRulesDisabled(async (ctx) => {
      const adb = ctx.firestore() as unknown as Firestore;
      const uids = Array.from({ length: 8 }, (_, i) => `bulk-${i}`);
      await setDoc(doc(adb, 'offerings', O), { courseCode: 'M1', title: 'Calc', termId: 't', termLabel: 'F', groupLabel: 'G', status: 'active', staffUids: [T], studentUids: [S1, S2, ...uids], policy: { version: 'v' } });
    });
    const b = writeBatch(db);
    b.update(doc(db, 'offerings', O, 'sessions', 'sched1'), { status: 'held', revision: 2, updatedBy: T, updatedAt: serverTimestamp() });
    for (let i = 0; i < 8; i++) b.set(doc(db, 'offerings', O, 'attendanceRecords', `sched1_bulk-${i}`), attendance(`bulk-${i}`, { sessionId: 'sched1' }));
    b.set(doc(collection(db, 'offerings', O, 'audit')), { type: 'attendance.published', actorUid: T, at: serverTimestamp(), targetPath: 'x', reason: null, details: {} });
    await assertSucceeds(b.commit());
  });
});

describe('grades', () => {
  it('graded requires points within [0, max]; 0 is a real grade', async () => {
    const db = as(T);
    await assertSucceeds(setDoc(grd(db, `q1_${S2}`), grade(S2, { points: 0 })));
    await assertFails(setDoc(grd(db, `q1_${S1}`), grade(S1, { revision: 2, points: 11 })));
    await assertFails(setDoc(grd(db, `q1_${S1}`), grade(S1, { revision: 2, points: null })));
  });
  it('pending/missing/excused carry no points (pending is never 0)', async () => {
    const db = as(T);
    await assertFails(setDoc(grd(db, `q1_${S1}`), grade(S1, { revision: 2, gradeState: 'pending', points: 0 })));
    await assertSucceeds(setDoc(grd(db, `q1_${S1}`), grade(S1, { revision: 2, gradeState: 'pending', points: null })));
  });
  it('maxPoints must match the assessment', async () => {
    await assertFails(setDoc(grd(as(T), `q1_${S1}`), grade(S1, { revision: 2, maxPoints: 20, points: 15 })));
  });
  it('cannot grade in another offering', async () => {
    await assertFails(setDoc(doc(as(T), 'offerings', O2, 'assessmentRecords', `q1_${S1}`), grade(S1, { offeringId: O2 })));
  });
});

describe('audit trail', () => {
  it('append-only, staff-readable, never student-readable', async () => {
    const db = as(T);
    const ref = doc(collection(db, 'offerings', O, 'audit'));
    await assertSucceeds(setDoc(ref, { type: 'grade.corrected', actorUid: T, at: serverTimestamp(), targetPath: 'p', reason: 'опечатка', details: {} }));
    await assertFails(updateDoc(ref, { reason: 'other' }));
    await assertFails(getDoc(doc(as(S1), 'offerings', O, 'audit', ref.id)));
    await assertFails(setDoc(doc(collection(db, 'offerings', O, 'audit')), { type: 'grade.corrected', actorUid: T2, at: serverTimestamp(), targetPath: 'p', reason: null, details: {} }));
  });
});
