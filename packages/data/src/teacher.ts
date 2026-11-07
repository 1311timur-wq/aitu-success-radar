// Teacher commands and subscriptions. Every write is validated AGAIN by Security Rules;
// the checks here exist to give the teacher precise, row-level feedback before the server says no.
import {
  doc, getDoc, query, runTransaction, serverTimestamp, setDoc, Timestamp, where,
  type DocumentReference, type DocumentSnapshot, type Transaction, type Unsubscribe,
} from 'firebase/firestore';
import type {
  AssessmentCategory, AssessmentDTO, AssessmentRecordDTO, AttendanceRecordDTO, AttendanceStatus, EnrollmentDTO,
  GradeState, GradingPeriod, Millis, OfferingDTO, SessionDTO, SessionStatus, SessionType, SubmissionState,
} from '@aitu/domain';
import { firebase } from './firebase.ts';
import { refs } from './paths.ts';
import {
  toAssessment, toAssessmentRecord, toAttendanceRecord, toEnrollment, toOffering, toSession, toUser, type UserProfile,
} from './converters.ts';
import { DataError, toDataError, type RowsResult } from './errors.ts';
import { chunk, watchDoc, watchQuery, type Live, type OnError } from './live.ts';

/**
 * Rules spend <= 2 document access calls per record write (offering + session/assessment) and allow 20 per
 * commit. 8 records + 1 session update + 1 audit event = at most 18 calls.
 */
export const RECORDS_PER_COMMIT = 8;

const r = () => refs(firebase().db);
const db = () => firebase().db;

// ---------------------------------------------------------------- reads
export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const s = await getDoc(r().user(uid));
  return s.exists() ? toUser(s) : null;
};

export const watchMyOfferings = (uid: string, next: (v: Live<OfferingDTO[]>) => void, onError: OnError): Unsubscribe =>
  watchQuery(query(r().offerings(), where('staffUids', 'array-contains', uid)), toOffering, next, onError);

export const watchOffering = (o: string, next: (v: Live<OfferingDTO | null>) => void, onError: OnError) =>
  watchDoc(r().offering(o), toOffering, next, onError);

export const watchEnrollments = (o: string, next: (v: Live<EnrollmentDTO[]>) => void, onError: OnError) =>
  watchQuery(r().enrollments(o), toEnrollment, (v) => next({ ...v, data: [...v.data].sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru')) }), onError);

export const watchSessions = (o: string, next: (v: Live<SessionDTO[]>) => void, onError: OnError) =>
  watchQuery(r().sessions(o), toSession, (v) => next({ ...v, data: [...v.data].sort((a, b) => b.startsAt - a.startsAt) }), onError);

export const watchAttendanceRecords = (o: string, sessionId: string | null, next: (v: Live<AttendanceRecordDTO[]>) => void, onError: OnError) =>
  watchQuery(sessionId ? query(r().attendanceRecords(o), where('sessionId', '==', sessionId)) : r().attendanceRecords(o), toAttendanceRecord, next, onError);

/** Only unpublished marks of an offering (dashboard counter): reads a handful of docs instead of the whole journal. */
export const watchDraftAttendance = (o: string, next: (v: Live<AttendanceRecordDTO[]>) => void, onError: OnError) =>
  watchQuery(query(r().attendanceRecords(o), where('publication', '==', 'draft')), toAttendanceRecord, next, onError);

export const watchAssessments = (o: string, next: (v: Live<AssessmentDTO[]>) => void, onError: OnError) =>
  watchQuery(r().assessments(o), toAssessment, (v) => next({ ...v, data: [...v.data].sort(byDueThenTitle) }), onError);

export const watchAssessmentRecords = (o: string, assessmentId: string | null, next: (v: Live<AssessmentRecordDTO[]>) => void, onError: OnError) =>
  watchQuery(assessmentId ? query(r().assessmentRecords(o), where('assessmentId', '==', assessmentId)) : r().assessmentRecords(o), toAssessmentRecord, next, onError);

function byDueThenTitle(a: AssessmentDTO, b: AssessmentDTO) {
  return (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title);
}

// ---------------------------------------------------------------- sessions
export interface SessionInput {
  type: SessionType;
  topic: string;
  room: string;
  startsAt: Millis;
  durationMinutes: number;
  maxPoints: number;
}

export async function createSession(o: string, input: SessionInput, actorUid: string): Promise<string> {
  const ref = doc(r().sessions(o));
  try {
    await setDoc(ref, {
      offeringId: o, type: input.type, topic: input.topic.trim() || null, room: input.room.trim() || null,
      startsAt: Timestamp.fromMillis(input.startsAt), durationMinutes: Math.round(input.durationMinutes), status: 'scheduled',
      maxPoints: input.maxPoints, attendancePublication: 'draft', publishedAt: null, revision: 1,
      createdBy: actorUid, updatedBy: actorUid, updatedAt: serverTimestamp(),
    });
  } catch (e) { throw toDataError(e); }
  return ref.id;
}

export async function updateSession(
  o: string, session: SessionDTO, patch: Partial<SessionInput> & { status?: SessionStatus }, actorUid: string,
): Promise<void> {
  const ref = r().session(o, session.id);
  try {
    await runTransaction(db(), async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new DataError('not-found');
      const current = toSession(snap);
      if (current.revision !== session.revision) throw new DataError('conflict', 'Session changed by someone else');
      const data: Record<string, unknown> = { revision: current.revision + 1, updatedBy: actorUid, updatedAt: serverTimestamp() };
      if (patch.type) data.type = patch.type;
      if (patch.topic !== undefined) data.topic = patch.topic.trim() || null;
      if (patch.room !== undefined) data.room = patch.room.trim() || null;
      if (patch.startsAt !== undefined) data.startsAt = Timestamp.fromMillis(patch.startsAt);
      if (patch.durationMinutes !== undefined) data.durationMinutes = Math.round(patch.durationMinutes);
      if (patch.maxPoints !== undefined) data.maxPoints = patch.maxPoints;
      if (patch.status) data.status = patch.status;
      tx.update(ref, data);
      if (patch.status === 'cancelled' && current.status !== 'cancelled') {
        audit(tx, o, actorUid, 'session.cancelled', `offerings/${o}/sessions/${session.id}`, null, {});
      }
    });
  } catch (e) { throw toDataError(e); }
}

// ---------------------------------------------------------------- attendance
export interface AttendanceRowInput {
  studentUid: string;
  status: AttendanceStatus;
  points: number | null;
  remark: string;
  /** Revision the teacher saw; 0 when no record existed yet. */
  expectedRevision: number;
}

/**
 * Saves marks for one session in commits of RECORDS_PER_COMMIT rows.
 * - Rows whose revision moved since the teacher loaded the sheet are NOT written (reported as conflicts).
 * - Changing an already published mark requires `correctionReason` (stored on the record + audit event).
 * - The first commit switches a `scheduled` session to `held` atomically with the first marks.
 */
export async function saveAttendance(args: {
  offeringId: string; session: SessionDTO; rows: AttendanceRowInput[]; actorUid: string; correctionReason?: string;
}): Promise<RowsResult> {
  const { offeringId: o, session, actorUid } = args;
  if (session.status === 'cancelled') throw new DataError('invalid', 'Session is cancelled');
  const reason = args.correctionReason?.trim() ?? '';
  const result: RowsResult = { committed: [], conflicts: [], failed: [] };
  const sessionRef = r().session(o, session.id);
  let sessionHeld = session.status === 'held';
  for (const row of args.rows) validateAttendanceRow(row, session.maxPoints);

  for (const part of chunk(args.rows, RECORDS_PER_COMMIT)) {
    try {
      const outcome = await runTransaction(db(), async (tx) => {
        const local = { committed: [] as string[], conflicts: [] as string[], corrected: [] as string[] };
        const snaps = await Promise.all(part.map((row) => tx.get(r().attendanceRecord(o, session.id, row.studentUid))));
        const sessSnap = sessionHeld ? null : await tx.get(sessionRef);
        if (sessSnap) {
          if (!sessSnap.exists()) throw new DataError('not-found');
          const s = toSession(sessSnap);
          if (s.status === 'cancelled') throw new DataError('invalid', 'Session is cancelled');
          if (s.status !== 'held') tx.update(sessionRef, { status: 'held', revision: s.revision + 1, updatedBy: actorUid, updatedAt: serverTimestamp() });
        }
        part.forEach((row, i) => {
          const snap = snaps[i] as DocumentSnapshot;
          const current = snap.exists() ? toAttendanceRecord(snap) : null;
          const currentRevision = current?.revision ?? 0;
          if (currentRevision !== row.expectedRevision) { local.conflicts.push(row.studentUid); return; }
          const changed = !!current && (current.status !== row.status || current.points !== row.points);
          const isCorrection = current?.publication === 'published' && changed;
          if (isCorrection && reason.length < 3) throw new DataError('invalid', 'Correction reason is required');
          tx.set(snap.ref, {
            offeringId: o, sessionId: session.id, studentUid: row.studentUid, status: row.status,
            points: row.status === 'unmarked' ? null : row.points, remark: row.remark.trim(),
            publication: current?.publication ?? session.attendancePublication,
            revision: currentRevision + 1, updatedBy: actorUid, updatedAt: serverTimestamp(),
            correction: isCorrection
              ? { reason, at: serverTimestamp(), previous: { status: current.status, points: current.points } }
              : rawField(snap, 'correction'),
          });
          local.committed.push(row.studentUid);
          if (isCorrection) local.corrected.push(row.studentUid);
        });
        if (local.corrected.length) {
          audit(tx, o, actorUid, 'attendance.corrected', `offerings/${o}/sessions/${session.id}`, reason, { studentUids: local.corrected });
        }
        return local;
      });
      sessionHeld = true;
      result.committed.push(...outcome.committed);
      result.conflicts.push(...outcome.conflicts);
    } catch (e) {
      const kind = toDataError(e).kind;
      result.failed.push(...part.map((row) => ({ studentUid: row.studentUid, kind })));
    }
  }
  return result;
}

function validateAttendanceRow(row: AttendanceRowInput, maxPoints: number) {
  if (row.status === 'unmarked') return;
  if (typeof row.points !== 'number' || !Number.isFinite(row.points) || row.points < 0 || row.points > maxPoints) {
    throw new DataError('invalid', `Points must be within 0..${maxPoints}`);
  }
  if (row.remark.length > 500) throw new DataError('invalid', 'Remark is too long');
}

/**
 * Makes the session's saved marks visible to students. Records are switched first (in commits),
 * the session flag last — so `attendancePublication == 'published'` means "everything is out".
 * Unmarked students stay unmarked: they are never turned into absences.
 */
export async function publishAttendance(args: { offeringId: string; session: SessionDTO; records: AttendanceRecordDTO[]; actorUid: string }): Promise<RowsResult> {
  const { offeringId: o, session, actorUid } = args;
  if (session.status !== 'held') throw new DataError('invalid', 'Nothing to publish: no marks saved yet');
  const drafts = args.records.filter((x) => x.publication === 'draft');
  const result = await publishRecords(drafts, (rec) => r().attendanceRecord(o, session.id, rec.studentUid), actorUid);
  if (result.conflicts.length || result.failed.length) return result;
  try {
    await runTransaction(db(), async (tx) => {
      const ref = r().session(o, session.id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new DataError('not-found');
      const s = toSession(snap);
      tx.update(ref, { attendancePublication: 'published', publishedAt: serverTimestamp(), revision: s.revision + 1, updatedBy: actorUid, updatedAt: serverTimestamp() });
      audit(tx, o, actorUid, 'attendance.published', ref.path, null, { records: drafts.length });
    });
  } catch (e) { throw toDataError(e); }
  return result;
}

async function publishRecords<T extends { studentUid: string; revision: number }>(
  records: T[], refOf: (rec: T) => DocumentReference, actorUid: string,
): Promise<RowsResult> {
  const result: RowsResult = { committed: [], conflicts: [], failed: [] };
  for (const part of chunk(records, RECORDS_PER_COMMIT)) {
    try {
      const outcome = await runTransaction(db(), async (tx) => {
        const local = { committed: [] as string[], conflicts: [] as string[] };
        const snaps = await Promise.all(part.map((rec) => tx.get(refOf(rec))));
        part.forEach((rec, i) => {
          const snap = snaps[i] as DocumentSnapshot;
          const rev = snap.exists() ? Number(snap.get('revision')) : -1;
          if (rev !== rec.revision) { local.conflicts.push(rec.studentUid); return; }
          tx.update(snap.ref, { publication: 'published', revision: rev + 1, updatedBy: actorUid, updatedAt: serverTimestamp() });
          local.committed.push(rec.studentUid);
        });
        return local;
      });
      result.committed.push(...outcome.committed);
      result.conflicts.push(...outcome.conflicts);
    } catch (e) {
      const kind = toDataError(e).kind;
      result.failed.push(...part.map((rec) => ({ studentUid: rec.studentUid, kind })));
    }
  }
  return result;
}

// ---------------------------------------------------------------- assessments & grades
export interface AssessmentInput {
  title: string;
  category: AssessmentCategory;
  maxPoints: number;
  dueAt: Millis | null;
  countsForOverdue: boolean;
  /** AITU register and syllabus weight inside it (0..1); null = not part of the registers. */
  period: GradingPeriod | null;
  weight: number | null;
}

export async function createAssessment(o: string, input: AssessmentInput, actorUid: string): Promise<string> {
  const ref = doc(r().assessments(o));
  try {
    await setDoc(ref, {
      offeringId: o, title: input.title.trim(), category: input.category, maxPoints: input.maxPoints,
      dueAt: input.dueAt == null ? null : Timestamp.fromMillis(input.dueAt),
      countsForOverdue: input.countsForOverdue && input.dueAt != null,
      period: input.period, weight: input.period == null ? null : input.weight,
      gradesPublication: 'draft', publishedAt: null, revision: 1, createdBy: actorUid, updatedBy: actorUid, updatedAt: serverTimestamp(),
    });
  } catch (e) { throw toDataError(e); }
  return ref.id;
}

export async function updateAssessment(o: string, assessment: AssessmentDTO, patch: Partial<AssessmentInput>, actorUid: string): Promise<void> {
  const ref = r().assessment(o, assessment.id);
  try {
    await runTransaction(db(), async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new DataError('not-found');
      const current = toAssessment(snap);
      if (current.revision !== assessment.revision) throw new DataError('conflict');
      if (patch.maxPoints !== undefined && patch.maxPoints !== current.maxPoints && current.gradesPublication === 'published') {
        throw new DataError('invalid', 'Max points cannot change after grades were published');
      }
      const dueAt = patch.dueAt !== undefined ? patch.dueAt : current.dueAt;
      const data: Record<string, unknown> = { revision: current.revision + 1, updatedBy: actorUid, updatedAt: serverTimestamp() };
      if (patch.title !== undefined) data.title = patch.title.trim();
      if (patch.category) data.category = patch.category;
      if (patch.period !== undefined) data.period = patch.period;
      if (patch.weight !== undefined) data.weight = patch.weight;
      if (patch.maxPoints !== undefined) data.maxPoints = patch.maxPoints;
      if (patch.dueAt !== undefined) data.dueAt = patch.dueAt == null ? null : Timestamp.fromMillis(patch.dueAt);
      if (patch.countsForOverdue !== undefined || patch.dueAt !== undefined) {
        data.countsForOverdue = (patch.countsForOverdue ?? current.countsForOverdue) && dueAt != null;
      }
      tx.update(ref, data);
    });
  } catch (e) { throw toDataError(e); }
}

export interface GradeRowInput {
  studentUid: string;
  submission: SubmissionState;
  gradeState: GradeState;
  points: number | null;
  feedback: string;
  expectedRevision: number;
}

export function validateGradeRow(row: Pick<GradeRowInput, 'gradeState' | 'points' | 'feedback'>, maxPoints: number): string | null {
  if (row.gradeState === 'graded') {
    if (typeof row.points !== 'number' || !Number.isFinite(row.points)) return 'points-required';
    if (row.points < 0 || row.points > maxPoints) return 'points-range';
  } else if (row.points != null) return 'points-not-allowed';
  if (row.feedback.length > 1000) return 'feedback-too-long';
  return null;
}

export async function saveGrades(args: {
  offeringId: string; assessment: AssessmentDTO; rows: GradeRowInput[]; actorUid: string; correctionReason?: string;
}): Promise<RowsResult> {
  const { offeringId: o, assessment, actorUid } = args;
  const reason = args.correctionReason?.trim() ?? '';
  for (const row of args.rows) {
    const problem = validateGradeRow(row, assessment.maxPoints);
    if (problem) throw new DataError('invalid', `${row.studentUid}: ${problem}`);
  }
  const result: RowsResult = { committed: [], conflicts: [], failed: [] };
  for (const part of chunk(args.rows, RECORDS_PER_COMMIT)) {
    try {
      const outcome = await runTransaction(db(), async (tx) => {
        const local = { committed: [] as string[], conflicts: [] as string[], corrected: [] as string[] };
        const snaps = await Promise.all(part.map((row) => tx.get(r().assessmentRecord(o, assessment.id, row.studentUid))));
        part.forEach((row, i) => {
          const snap = snaps[i] as DocumentSnapshot;
          const current = snap.exists() ? toAssessmentRecord(snap) : null;
          const currentRevision = current?.revision ?? 0;
          if (currentRevision !== row.expectedRevision) { local.conflicts.push(row.studentUid); return; }
          const isCorrection = current?.publication === 'published' && current.gradeState === 'graded'
            && (current.gradeState !== row.gradeState || current.points !== row.points);
          if (isCorrection && reason.length < 3) throw new DataError('invalid', 'Correction reason is required');
          tx.set(snap.ref, {
            offeringId: o, assessmentId: assessment.id, studentUid: row.studentUid, submission: row.submission,
            gradeState: row.gradeState, points: row.gradeState === 'graded' ? row.points : null, maxPoints: assessment.maxPoints,
            feedback: row.feedback.trim(), publication: current?.publication ?? assessment.gradesPublication,
            revision: currentRevision + 1, updatedBy: actorUid, updatedAt: serverTimestamp(),
            correction: isCorrection
              ? { reason, at: serverTimestamp(), previous: { gradeState: current.gradeState, points: current.points } }
              : rawField(snap, 'correction'),
          });
          local.committed.push(row.studentUid);
          if (isCorrection) local.corrected.push(row.studentUid);
        });
        if (local.corrected.length) {
          audit(tx, o, actorUid, 'grade.corrected', `offerings/${o}/assessments/${assessment.id}`, reason, { studentUids: local.corrected });
        }
        return local;
      });
      result.committed.push(...outcome.committed);
      result.conflicts.push(...outcome.conflicts);
    } catch (e) {
      const kind = toDataError(e).kind;
      result.failed.push(...part.map((row) => ({ studentUid: row.studentUid, kind })));
    }
  }
  return result;
}

/** Publishes saved results of one assessment. Pending stays pending (never becomes 0). */
export async function publishGrades(args: { offeringId: string; assessment: AssessmentDTO; records: AssessmentRecordDTO[]; actorUid: string }): Promise<RowsResult> {
  const { offeringId: o, assessment, actorUid } = args;
  const drafts = args.records.filter((x) => x.publication === 'draft');
  const result = await publishRecords(drafts, (rec) => r().assessmentRecord(o, assessment.id, rec.studentUid), actorUid);
  if (result.conflicts.length || result.failed.length) return result;
  try {
    await runTransaction(db(), async (tx) => {
      const ref = r().assessment(o, assessment.id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new DataError('not-found');
      tx.update(ref, { gradesPublication: 'published', publishedAt: serverTimestamp(), revision: toAssessment(snap).revision + 1, updatedBy: actorUid, updatedAt: serverTimestamp() });
      audit(tx, o, actorUid, 'grades.published', ref.path, null, { records: drafts.length });
    });
  } catch (e) { throw toDataError(e); }
  return result;
}

// ---------------------------------------------------------------- helpers
type AuditType = 'attendance.published' | 'attendance.corrected' | 'grades.published' | 'grade.corrected' | 'session.cancelled';

function audit(tx: Transaction, o: string, actorUid: string, type: AuditType, targetPath: string, reason: string | null, details: Record<string, unknown>) {
  tx.set(doc(r().audit(o)), { type, actorUid, at: serverTimestamp(), targetPath, reason, details });
}

/** The stored value exactly as Firestore has it (rules compare `correction` byte-for-byte when unchanged). */
function rawField(snap: DocumentSnapshot, field: string): unknown {
  return snap.exists() ? (snap.get(field) ?? null) : null;
}
