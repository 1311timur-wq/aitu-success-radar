// Joining a course by code (student) and managing the code / roster (teacher).
// The batch shapes here are exactly what Security Rules expect (see firestore.rules: studentJoins, selfEnroll,
// staffRotatesJoinCode, staffWithdrawsStudent).
import { arrayRemove, arrayUnion, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { generateJoinCode, isJoinCode, normalizeJoinCode, type OfferingDTO } from '@aitu/domain';
import { firebase } from './firebase.ts';
import { refs } from './paths.ts';
import { toJoinCode, type JoinCodeDTO, type UserProfile } from './converters.ts';
import { DataError, toDataError } from './errors.ts';

const r = () => refs(firebase().db);
const db = () => firebase().db;

export type JoinLookup =
  | { status: 'ok'; code: JoinCodeDTO }
  | { status: 'invalid-format' | 'not-found' | 'revoked' };

/** Looks up ONE code (rules allow get, never list). */
export async function lookupJoinCode(input: string): Promise<JoinLookup> {
  const code = normalizeJoinCode(input);
  if (!isJoinCode(code)) return { status: 'invalid-format' };
  try {
    const s = await getDoc(r().joinCode(code));
    if (!s.exists()) return { status: 'not-found' };
    const jc = toJoinCode(s);
    return jc.active ? { status: 'ok', code: jc } : { status: 'revoked' };
  } catch (e) {
    throw toDataError(e);
  }
}

/** Student joins: adds HIMSELF to studentUids + enrollment that records the code, in one atomic batch. */
export async function joinCourse(profile: UserProfile, code: JoinCodeDTO): Promise<void> {
  if (profile.role !== 'student') throw new DataError('permission-denied', 'only students can join');
  const b = writeBatch(db());
  b.update(r().offering(code.offeringId), { studentUids: arrayUnion(profile.uid) });
  b.set(r().enrollment(code.offeringId, profile.uid), {
    studentUid: profile.uid, displayName: profile.displayName, studentNumber: profile.studentNumber, groupLabel: profile.groupLabel,
    status: 'active', enrolledAt: serverTimestamp(), via: 'code', joinCode: code.code,
  });
  try { await b.commit(); } catch (e) { throw toDataError(e); }
}

function joinCodeDoc(o: Pick<OfferingDTO, 'id' | 'courseCode' | 'title' | 'groupLabel' | 'termLabel'>, actorUid: string) {
  return {
    offeringId: o.id, courseCode: o.courseCode, title: o.title, groupLabel: o.groupLabel, termLabel: o.termLabel,
    active: true, createdBy: actorUid, createdAt: serverTimestamp(),
  };
}

/** A fresh code that is not taken yet (collision chance is ~1e-9, but checked anyway). */
export async function freeJoinCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const c = generateJoinCode();
    const s = await getDoc(r().joinCode(c)).catch(() => null);
    if (s && !s.exists()) return c;
  }
  throw new DataError('unavailable', 'could not allocate a join code');
}

/** Teacher (or admin): new code for the course; the previous one stops working immediately. */
export async function rotateJoinCode(offering: OfferingDTO, actorUid: string, opts: { asAdmin?: boolean } = {}): Promise<string> {
  const code = await freeJoinCode();
  const b = writeBatch(db());
  b.set(r().joinCode(code), joinCodeDoc(offering, actorUid));
  if (offering.joinCode) b.update(r().joinCode(offering.joinCode), { active: false, revokedAt: serverTimestamp(), revokedBy: actorUid });
  b.update(r().offering(offering.id), opts.asAdmin ? { joinCode: code, updatedAt: serverTimestamp() } : { joinCode: code });
  if (opts.asAdmin) {
    b.set(doc(r().adminLog()), { type: 'joincode.created', actorUid, at: serverTimestamp(), target: `offerings/${offering.id}`, details: { code, previous: offering.joinCode ?? null } });
  } else {
    b.set(doc(r().audit(offering.id)), { type: 'joincode.rotated', actorUid, at: serverTimestamp(), targetPath: `offerings/${offering.id}`, reason: null, details: { previous: offering.joinCode ?? null } });
  }
  try { await b.commit(); } catch (e) { throw toDataError(e); }
  return code;
}

/** Teacher (or admin): remove a student from the course. Records stay (history), access to new data ends. */
export async function withdrawStudent(offeringId: string, studentUid: string, actorUid: string, opts: { asAdmin?: boolean } = {}): Promise<void> {
  const b = writeBatch(db());
  b.update(r().offering(offeringId), opts.asAdmin ? { studentUids: arrayRemove(studentUid), updatedAt: serverTimestamp() } : { studentUids: arrayRemove(studentUid) });
  b.update(r().enrollment(offeringId, studentUid), { status: 'withdrawn', updatedAt: serverTimestamp(), updatedBy: actorUid });
  if (opts.asAdmin) {
    b.set(doc(r().adminLog()), { type: 'enrollment.removed', actorUid, at: serverTimestamp(), target: `offerings/${offeringId}/enrollments/${studentUid}`, details: {} });
  } else {
    b.set(doc(r().audit(offeringId)), { type: 'student.withdrawn', actorUid, at: serverTimestamp(), targetPath: `offerings/${offeringId}/enrollments/${studentUid}`, reason: null, details: {} });
  }
  try { await b.commit(); } catch (e) { throw toDataError(e); }
}
