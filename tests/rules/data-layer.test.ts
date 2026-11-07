// The real teacher commands (@aitu/data) against the emulator WITH Security Rules on:
// chunked saves, scheduled -> held switch, publish barrier, conflicts, student visibility.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where, type Firestore } from 'firebase/firestore';
import { publishAttendance, saveAttendance, setFirestoreForTesting, toAttendanceRecord, toSession } from '@aitu/data';
import { makeEnv, O, seedBase, T } from './helpers.ts';

let env: RulesTestEnvironment;
const ROSTER = Array.from({ length: 19 }, (_, i) => `roster-${String(i).padStart(2, '0')}`);

beforeAll(async () => { env = await makeEnv('demo-aitu-radar-data'); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seedBase(env);
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, 'offerings', O), {
      courseCode: 'M1', title: 'Calc', termId: 't', termLabel: 'F', groupLabel: 'G', status: 'active', staffUids: [T], studentUids: ROSTER, policy: { version: 'v' },
    });
  });
  setFirestoreForTesting(env.authenticatedContext(T).firestore() as unknown as Firestore);
});

const loadSession = async (db: Firestore, id: string) => toSession(await getDoc(doc(db, 'offerings', O, 'sessions', id)));

describe('saveAttendance + publishAttendance', () => {
  it('saves 19 rows in 3 commits, switches the session to held, then publishes everything', async () => {
    const db = env.authenticatedContext(T).firestore() as unknown as Firestore;
    const session = await loadSession(db, 'sched1');
    const rows = ROSTER.map((studentUid, i) => ({
      studentUid, status: i % 5 === 0 ? ('absent' as const) : ('present' as const), points: i % 5 === 0 ? 0 : 2, remark: '', expectedRevision: 0,
    }));
    const saved = await saveAttendance({ offeringId: O, session, rows, actorUid: T });
    expect(saved).toEqual({ committed: ROSTER, conflicts: [], failed: [] });
    const held = await loadSession(db, 'sched1');
    expect(held.status).toBe('held');

    const all = (await getDocs(query(collection(db, 'offerings', O, 'attendanceRecords'), where('sessionId', '==', 'sched1')))).docs.map(toAttendanceRecord);
    expect(all.every((r) => r.publication === 'draft' && r.revision === 1)).toBe(true);

    const pub = await publishAttendance({ offeringId: O, session: held, records: all, actorUid: T });
    expect(pub.failed).toEqual([]);
    expect(pub.committed).toHaveLength(19);
    expect((await loadSession(db, 'sched1')).attendancePublication).toBe('published');

    // a student sees exactly their own published mark
    const student = env.authenticatedContext(ROSTER[5]!).firestore() as unknown as Firestore;
    const own = await getDocs(query(collection(student, 'offerings', O, 'attendanceRecords'),
      where('studentUid', '==', ROSTER[5]), where('publication', '==', 'published')));
    expect(own.docs.map((d) => d.id)).toEqual([`sched1_${ROSTER[5]}`]);
  });

  it('reports a stale row as a conflict and writes the others', async () => {
    const db = env.authenticatedContext(T).firestore() as unknown as Firestore;
    const session = await loadSession(db, 'held1');
    await saveAttendance({ offeringId: O, session, rows: [{ studentUid: ROSTER[0]!, status: 'present', points: 2, remark: '', expectedRevision: 0 }], actorUid: T });
    const res = await saveAttendance({
      offeringId: O, session, actorUid: T,
      rows: [
        { studentUid: ROSTER[0]!, status: 'absent', points: 0, remark: '', expectedRevision: 0 }, // someone already saved revision 1
        { studentUid: ROSTER[1]!, status: 'late', points: 1, remark: '', expectedRevision: 0 },
      ],
    });
    expect(res.conflicts).toEqual([ROSTER[0]]);
    expect(res.committed).toEqual([ROSTER[1]]);
  });

  it('a correction of a published mark needs a reason', async () => {
    const db = env.authenticatedContext(T).firestore() as unknown as Firestore;
    const session = await loadSession(db, 'held1');
    await saveAttendance({ offeringId: O, session, rows: [{ studentUid: ROSTER[2]!, status: 'present', points: 2, remark: '', expectedRevision: 0 }], actorUid: T });
    const recs = (await getDocs(query(collection(db, 'offerings', O, 'attendanceRecords'), where('sessionId', '==', 'held1')))).docs.map(toAttendanceRecord);
    await publishAttendance({ offeringId: O, session, records: recs.filter((r) => r.studentUid === ROSTER[2]), actorUid: T });
    const fix = { studentUid: ROSTER[2]!, status: 'excused' as const, points: 1, remark: 'справка', expectedRevision: 2 };
    expect((await saveAttendance({ offeringId: O, session, rows: [fix], actorUid: T })).failed).toHaveLength(1);
    expect((await saveAttendance({ offeringId: O, session, rows: [fix], actorUid: T, correctionReason: 'принесли справку' })).committed).toEqual([ROSTER[2]]);
  });
});
