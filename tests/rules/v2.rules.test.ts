// Security Rules v2: registration, roles, join codes, QR check-in, weekly plan, admin.
// Run: npm run test:rules   (needs Java for the Firestore emulator)
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch, type Firestore,
} from 'firebase/firestore';
import { makeEnv, O, O2, S1, S2, seedBase, T } from './helpers.ts';

let env: RulesTestEnvironment;
const NEW = 'student-new';
const ADMIN = 'admin-1';
const ctx = (uid: string | null, claims: Record<string, unknown> = {}): Firestore =>
  (uid ? env.authenticatedContext(uid, claims) : env.unauthenticatedContext()).firestore() as unknown as Firestore;
const admin = () => ctx(ADMIN, { admin: true, email: 'admin@demo.aitu.kz' });
const newStudent = () => ctx(NEW, { email: 'dana@astanait.edu.kz', email_verified: true });

const profile = (o: Record<string, unknown> = {}) => ({
  displayName: 'Дана Касымова', email: 'dana@astanait.edu.kz', role: 'student', program: 'se', groupLabel: 'SE-2419',
  studentNumber: '241999', source: 'self', createdAt: serverTimestamp(), consentAt: serverTimestamp(), ...o,
});
const enrollment = (code: string, o: Record<string, unknown> = {}) => ({
  studentUid: NEW, displayName: 'Дана Касымова', studentNumber: '241999', groupLabel: 'SE-2419', status: 'active',
  enrolledAt: serverTimestamp(), via: 'code', joinCode: code, ...o,
});

async function seedV2() {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore() as unknown as Firestore;
    await setDoc(doc(db, 'joinCodes', 'K7Q4MX'), { offeringId: O, courseCode: 'M1', title: 'Calc', groupLabel: 'G', termLabel: 'F', active: true, createdBy: T, createdAt: Timestamp.now() });
    await setDoc(doc(db, 'joinCodes', 'OLD234'), { offeringId: O, courseCode: 'M1', title: 'Calc', groupLabel: 'G', termLabel: 'F', active: false, createdBy: T, createdAt: Timestamp.now() });
    await setDoc(doc(db, 'joinCodes', 'LAB777'), { offeringId: O2, courseCode: 'M2', title: 'LA', groupLabel: 'G', termLabel: 'F', active: true, createdBy: T, createdAt: Timestamp.now() });
    await setDoc(doc(db, 'users', NEW), profile({ createdAt: Timestamp.now(), consentAt: Timestamp.now() }));
    await setDoc(doc(db, 'offerings', O, 'checkinTokens', 'held1'), { sessionId: 'held1', open: true, code: '111111', prevCode: '222222', rotatedAt: Timestamp.now(), updatedBy: T });
    await setDoc(doc(db, 'offerings', O, 'checkinTokens', 'sched1'), { sessionId: 'sched1', open: true, code: '333333', prevCode: null, rotatedAt: Timestamp.fromMillis(Date.now() - 120_000), updatedBy: T });
  });
}

beforeAll(async () => { env = await makeEnv('demo-aitu-radar-rules-v2'); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedBase(env); await seedV2(); });

describe('student self-registration', () => {
  const fresh = () => ctx('student-fresh', { email: 'dana@astanait.edu.kz' });
  it('creates own student profile with server timestamps', async () => {
    await assertSucceeds(setDoc(doc(fresh(), 'users', 'student-fresh'), profile()));
  });
  it('cannot register as a teacher or admin', async () => {
    await assertFails(setDoc(doc(fresh(), 'users', 'student-fresh'), profile({ role: 'teacher' })));
    await assertFails(setDoc(doc(fresh(), 'users', 'student-fresh'), profile({ role: 'admin' })));
  });
  it('e-mail must be the signed-in one and corporate', async () => {
    await assertFails(setDoc(doc(fresh(), 'users', 'student-fresh'), profile({ email: 'other@astanait.edu.kz' })));
    const gmail = ctx('student-g', { email: 'me@gmail.com' });
    await assertFails(setDoc(doc(gmail, 'users', 'student-g'), profile({ email: 'me@gmail.com' })));
  });
  it('validates group, student number, programme; cannot write someone else\'s profile', async () => {
    await assertFails(setDoc(doc(fresh(), 'users', 'student-fresh'), profile({ groupLabel: 'se2419' })));
    await assertFails(setDoc(doc(fresh(), 'users', 'student-fresh'), profile({ studentNumber: '12' })));
    await assertFails(setDoc(doc(fresh(), 'users', 'student-fresh'), profile({ program: 'magic' })));
    await assertFails(setDoc(doc(fresh(), 'users', 'student-fresh'), profile({ extra: true })));
    await assertFails(setDoc(doc(fresh(), 'users', S2), profile()));
  });
  it('student edits profile fields but never role or e-mail', async () => {
    await assertSucceeds(updateDoc(doc(newStudent(), 'users', NEW), { groupLabel: 'SE-2420' }));
    await assertFails(updateDoc(doc(newStudent(), 'users', NEW), { role: 'teacher' }));
    await assertFails(updateDoc(doc(newStudent(), 'users', NEW), { email: 'x@astanait.edu.kz' }));
  });
  it('users cannot list or read other profiles', async () => {
    await assertFails(getDocs(collection(newStudent(), 'users')));
    await assertFails(getDoc(doc(newStudent(), 'users', S1)));
  });
});

describe('admin', () => {
  it('admin claim reads every course and every profile; a teacher cannot', async () => {
    await assertSucceeds(getDocs(collection(admin(), 'offerings')));
    await assertSucceeds(getDocs(collection(admin(), 'users')));
    await assertFails(getDocs(collection(ctx(T), 'users')));
  });
  it('an "admin" role in a profile document gives nothing (only the token claim counts)', async () => {
    await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore() as unknown as Firestore, 'users', 'fake'), { role: 'admin' }); });
    await assertFails(getDocs(collection(ctx('fake'), 'users')));
  });
  it('admin creates a teacher account; nobody else can', async () => {
    const teacher = { displayName: 'Нурлан Ахметов', email: 'n.akhmetov@astanait.edu.kz', role: 'teacher', source: 'admin', mustChangePassword: true, createdAt: serverTimestamp(), createdBy: ADMIN };
    await assertSucceeds(setDoc(doc(admin(), 'users', 'teacher-new'), teacher));
    await assertFails(setDoc(doc(ctx(T), 'users', 'teacher-x'), { ...teacher, createdBy: T }));
    await assertFails(setDoc(doc(admin(), 'users', 'teacher-y'), { ...teacher, role: 'admin' }));
  });
  it('teacher clears own mustChangePassword flag only', async () => {
    await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore() as unknown as Firestore, 'users', 'teacher-z'), { displayName: 'TZ', role: 'teacher', email: 'tz@x.kz', mustChangePassword: true }); });
    await assertSucceeds(updateDoc(doc(ctx('teacher-z'), 'users', 'teacher-z'), { mustChangePassword: false, passwordChangedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(ctx('teacher-z'), 'users', 'teacher-z'), { role: 'admin' }));
  });
  it('admin creates a course with a join code in one batch; admin journal is append-only', async () => {
    const db = admin();
    const b = writeBatch(db);
    b.set(doc(db, 'offerings', 'off-new'), { courseCode: 'PHYS101', title: 'Physics 1', termId: 't', termLabel: 'F', groupLabel: 'SE-2419', status: 'active', staffUids: [T], studentUids: [], policy: {}, joinCode: 'NEW234', createdAt: serverTimestamp(), createdBy: ADMIN, updatedAt: serverTimestamp() });
    b.set(doc(db, 'joinCodes', 'NEW234'), { offeringId: 'off-new', courseCode: 'PHYS101', title: 'Physics 1', groupLabel: 'SE-2419', termLabel: 'F', active: true, createdBy: ADMIN, createdAt: serverTimestamp() });
    await assertSucceeds(b.commit());
    await assertSucceeds(setDoc(doc(db, 'adminLog', 'e1'), { type: 'offering.created', actorUid: ADMIN, at: serverTimestamp(), target: 'offerings/off-new', details: {} }));
    await assertFails(updateDoc(doc(db, 'adminLog', 'e1'), { target: 'x' }));
  });
});

describe('join a course by code', () => {
  const join = (code: string, o = O, who = newStudent(), enr = enrollment(code)) => {
    const b = writeBatch(who);
    b.update(doc(who, 'offerings', o), { studentUids: arrayUnion(NEW) });
    b.set(doc(who, 'offerings', o, 'enrollments', NEW), enr);
    return b.commit();
  };
  it('anyone signed in can look up ONE code, nobody can list codes', async () => {
    await assertSucceeds(getDoc(doc(newStudent(), 'joinCodes', 'K7Q4MX')));
    await assertFails(getDocs(collection(newStudent(), 'joinCodes')));
    await assertFails(getDoc(doc(ctx(null), 'joinCodes', 'K7Q4MX')));
  });
  it('valid active code → joined, then the course is readable', async () => {
    await assertSucceeds(join('K7Q4MX'));
    await assertSucceeds(getDoc(doc(newStudent(), 'offerings', O, 'sessions', 'held1')));
  });
  it('the e-mail must be confirmed before joining (registration alone proves nothing)', async () => {
    await assertFails(join('K7Q4MX', O, ctx(NEW, { email: 'dana@astanait.edu.kz', email_verified: false })));
    // unverified demo accounts may join demo courses only (ids "demo-…"), never a real one
    await assertFails(join('K7Q4MX', O, ctx(NEW, { email: 'dana@demo.aitu.kz', email_verified: false })));
    await assertSucceeds(join('K7Q4MX'));
  });
  it('revoked code, code of another course, or no code → denied', async () => {
    await assertFails(join('OLD234'));
    await assertFails(join('LAB777'));
    await assertFails(join('NOPE22'));
  });
  it('enrollment must copy the real profile (no fake name)', async () => {
    await assertFails(join('K7Q4MX', O, newStudent(), enrollment('K7Q4MX', { displayName: 'Someone Else' })));
  });
  it('cannot add another student or touch other fields', async () => {
    const db = newStudent();
    const b = writeBatch(db);
    b.update(doc(db, 'offerings', O), { studentUids: arrayUnion(NEW, 'student-ghost') });
    b.set(doc(db, 'offerings', O, 'enrollments', NEW), enrollment('K7Q4MX'));
    await assertFails(b.commit());
    await assertFails(updateDoc(doc(db, 'offerings', O), { title: 'Hacked', studentUids: arrayUnion(NEW) }));
  });
  it('a teacher account cannot join as a student', async () => {
    const tdb = ctx(T);
    const b = writeBatch(tdb);
    b.update(doc(tdb, 'offerings', O2), { studentUids: arrayUnion(T) });
    b.set(doc(tdb, 'offerings', O2, 'enrollments', T), { ...enrollment('LAB777'), studentUid: T });
    await assertFails(b.commit());
  });
});

describe('teacher manages the roster and the code', () => {
  it('rotates the join code of own course', async () => {
    const db = ctx(T);
    const b = writeBatch(db);
    b.set(doc(db, 'joinCodes', 'ZZZ999'), { offeringId: O, courseCode: 'M1', title: 'Calc', groupLabel: 'G', termLabel: 'F', active: true, createdBy: T, createdAt: serverTimestamp() });
    b.update(doc(db, 'joinCodes', 'K7Q4MX'), { active: false, revokedAt: serverTimestamp(), revokedBy: T });
    b.update(doc(db, 'offerings', O), { joinCode: 'ZZZ999' });
    await assertSucceeds(b.commit());
  });
  it('cannot issue a code for someone else\'s course', async () => {
    await assertFails(setDoc(doc(ctx(T), 'joinCodes', 'ABC234'), { offeringId: O2, courseCode: 'M2', title: 'LA', groupLabel: 'G', termLabel: 'F', active: true, createdBy: T, createdAt: serverTimestamp() }));
  });
  it('withdraws exactly one student; cannot add one', async () => {
    const db = ctx(T);
    const b = writeBatch(db);
    b.update(doc(db, 'offerings', O), { studentUids: arrayRemove(S2) });
    b.update(doc(db, 'offerings', O, 'enrollments', S2), { status: 'withdrawn', updatedAt: serverTimestamp(), updatedBy: T });
    await assertSucceeds(b.commit());
    await assertFails(updateDoc(doc(db, 'offerings', O), { studentUids: arrayUnion('student-ghost') }));
  });
});

describe('QR check-in', () => {
  const checkin = (sessionId: string, code: string, who = S1) => setDoc(doc(ctx(who), 'offerings', O, 'checkins', `${sessionId}_${who}`), {
    offeringId: O, sessionId, studentUid: who, code, at: serverTimestamp(), method: 'qr',
  });
  it('enrolled student with the current or previous code → accepted, once', async () => {
    await assertSucceeds(checkin('held1', '111111'));
    await assertFails(checkin('held1', '111111')); // no second write (update is denied)
    await assertSucceeds(checkin('held1', '222222', S2));
  });
  it('wrong code, expired code, or not enrolled → denied', async () => {
    await assertFails(checkin('held1', '999999'));
    await assertFails(checkin('sched1', '333333')); // rotated 2 minutes ago → expired
    await assertFails(checkin('held1', '111111', 'student-9'));
  });
  it('cannot check in for another student', async () => {
    await assertFails(setDoc(doc(ctx(S1), 'offerings', O, 'checkins', `held1_${S2}`), { offeringId: O, sessionId: 'held1', studentUid: S2, code: '111111', at: serverTimestamp(), method: 'qr' }));
  });
  it('students never read the token; the teacher rotates it', async () => {
    await assertFails(getDoc(doc(ctx(S1), 'offerings', O, 'checkinTokens', 'held1')));
    await assertSucceeds(setDoc(doc(ctx(T), 'offerings', O, 'checkinTokens', 'held1'), { sessionId: 'held1', open: true, code: '444444', prevCode: '111111', rotatedAt: serverTimestamp(), updatedBy: T }));
    await assertFails(setDoc(doc(ctx(T), 'offerings', O, 'checkinTokens', 'canc1'), { sessionId: 'canc1', open: true, code: '444444', prevCode: null, rotatedAt: serverTimestamp(), updatedBy: T })); // cancelled session
  });
});

describe('weekly plan ticks', () => {
  it('own plan state only', async () => {
    await assertSucceeds(setDoc(doc(ctx(S1), 'users', S1, 'planState', 'current'), { done: { 'deadline:o:hw3': 1 }, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(ctx(S2), 'users', S1, 'planState', 'current'), { done: {}, updatedAt: serverTimestamp() }));
    await assertFails(getDoc(doc(ctx(S2), 'users', S1, 'planState', 'current')));
  });
});
