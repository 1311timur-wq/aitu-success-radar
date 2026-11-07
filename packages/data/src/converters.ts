// Firestore snapshot -> domain DTO. Defensive: unknown enum values or wrong types become safe
// defaults that the domain will then skip/flag, instead of crashing a screen.
import { Timestamp, type DocumentSnapshot, type QueryDocumentSnapshot } from 'firebase/firestore';
import {
  normalizePolicy, ATTENDANCE_STATUSES, ASSESSMENT_CATEGORIES, GRADE_STATES, SESSION_STATUSES, SUBMISSION_STATES,
  type AssessmentDTO, type AssessmentRecordDTO, type AttendanceRecordDTO, type Correction, type EnrollmentDTO,
  type CheckinDTO, type Millis, type OfferingDTO, type Publication, type SessionDTO, type SessionType,
} from '@aitu/domain';

type Snap = QueryDocumentSnapshot | DocumentSnapshot;
type Raw = Record<string, unknown>;

const raw = (s: Snap): Raw => (s.data({ serverTimestamps: 'estimate' }) ?? {}) as Raw;
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const optStr = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const optNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);
const pub = (v: unknown): Publication => (v === 'published' ? 'published' : 'draft');

export function millis(v: unknown): Millis | null {
  if (v instanceof Timestamp) return v.toMillis();
  if (v && typeof v === 'object' && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return null;
}

function correction(v: unknown): Correction | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Raw;
  return { reason: str(c.reason), at: millis(c.at), previous: (c.previous as Record<string, unknown>) ?? null };
}

export function toOffering(s: Snap): OfferingDTO {
  const d = raw(s);
  let policy;
  try { policy = normalizePolicy(d.policy as never); } catch { policy = normalizePolicy(null); }
  return {
    id: s.id, courseCode: str(d.courseCode), title: str(d.title, s.id), termId: str(d.termId), termLabel: str(d.termLabel),
    groupLabel: str(d.groupLabel), status: d.status === 'archived' ? 'archived' : 'active',
    staffUids: strArr(d.staffUids), studentUids: strArr(d.studentUids), policy,
    joinCode: optStr(d.joinCode),
  };
}

export function toEnrollment(s: Snap): EnrollmentDTO {
  const d = raw(s);
  return {
    studentUid: str(d.studentUid, s.id), displayName: str(d.displayName, '—'), studentNumber: str(d.studentNumber),
    groupLabel: str(d.groupLabel), status: d.status === 'withdrawn' ? 'withdrawn' : 'active',
    via: d.via === 'code' || d.via === 'admin' ? d.via : 'seed', enrolledAt: millis(d.enrolledAt),
  };
}

export function toSession(s: Snap): SessionDTO {
  const d = raw(s);
  return {
    id: s.id, offeringId: str(d.offeringId), type: oneOf<SessionType>(d.type, ['lecture', 'practice', 'lab'], 'lecture'),
    topic: optStr(d.topic), room: optStr(d.room), startsAt: millis(d.startsAt) ?? 0, durationMinutes: num(d.durationMinutes, 50),
    status: oneOf(d.status, SESSION_STATUSES, 'scheduled'), maxPoints: num(d.maxPoints), attendancePublication: pub(d.attendancePublication),
    publishedAt: millis(d.publishedAt), revision: num(d.revision), updatedAt: millis(d.updatedAt),
  };
}

export function toAttendanceRecord(s: Snap): AttendanceRecordDTO {
  const d = raw(s);
  return {
    id: s.id, offeringId: str(d.offeringId), sessionId: str(d.sessionId), studentUid: str(d.studentUid),
    status: oneOf(d.status, ATTENDANCE_STATUSES, 'unmarked'), points: optNum(d.points), remark: str(d.remark),
    publication: pub(d.publication), revision: num(d.revision), updatedBy: str(d.updatedBy), updatedAt: millis(d.updatedAt),
    correction: correction(d.correction),
  };
}

export function toAssessment(s: Snap): AssessmentDTO {
  const d = raw(s);
  return {
    id: s.id, offeringId: str(d.offeringId), title: str(d.title, s.id), category: oneOf(d.category, ASSESSMENT_CATEGORIES, 'quiz'),
    maxPoints: num(d.maxPoints, 1), dueAt: millis(d.dueAt), countsForOverdue: d.countsForOverdue === true,
    period: d.period === 'midterm' || d.period === 'endterm' || d.period === 'final' ? d.period : null,
    weight: typeof d.weight === 'number' && d.weight >= 0 && d.weight <= 1 ? d.weight : null,
    gradesPublication: pub(d.gradesPublication), publishedAt: millis(d.publishedAt), revision: num(d.revision), updatedAt: millis(d.updatedAt),
  };
}

export function toAssessmentRecord(s: Snap): AssessmentRecordDTO {
  const d = raw(s);
  return {
    id: s.id, offeringId: str(d.offeringId), assessmentId: str(d.assessmentId), studentUid: str(d.studentUid),
    submission: oneOf(d.submission, SUBMISSION_STATES, 'pending'), gradeState: oneOf(d.gradeState, GRADE_STATES, 'pending'),
    points: optNum(d.points), maxPoints: num(d.maxPoints), feedback: str(d.feedback), publication: pub(d.publication),
    revision: num(d.revision), updatedBy: str(d.updatedBy), updatedAt: millis(d.updatedAt), correction: correction(d.correction),
  };
}

export type UserRole = 'admin' | 'teacher' | 'student' | 'unknown';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  /** Drives the UI only. Real authority: offering.staffUids/studentUids and the `admin` token claim (Security Rules). */
  role: UserRole;
  studentNumber: string;
  groupLabel: string;
  program: string;
  department: string;
  /** 'self' = student registered himself, 'admin' = created by an administrator, 'seed' = demo data. */
  source: 'self' | 'admin' | 'seed';
  mustChangePassword: boolean;
  createdAt: Millis | null;
}

export function toUser(s: Snap): UserProfile {
  const d = raw(s);
  return {
    uid: s.id, displayName: str(d.displayName, '—'), email: str(d.email),
    role: oneOf(d.role, ['admin', 'teacher', 'student'] as const, 'unknown'),
    studentNumber: str(d.studentNumber), groupLabel: str(d.groupLabel), program: str(d.program), department: str(d.department),
    source: d.source === 'self' || d.source === 'admin' ? d.source : 'seed',
    mustChangePassword: d.mustChangePassword === true, createdAt: millis(d.createdAt),
  };
}

export function emptyProfile(uid: string, email: string): UserProfile {
  return { uid, displayName: email || '—', email, role: 'unknown', studentNumber: '', groupLabel: '', program: '', department: '', source: 'self', mustChangePassword: false, createdAt: null };
}

export interface JoinCodeDTO {
  code: string;
  offeringId: string;
  courseCode: string;
  title: string;
  groupLabel: string;
  termLabel: string;
  active: boolean;
  createdAt: Millis | null;
}

export function toJoinCode(s: Snap): JoinCodeDTO {
  const d = raw(s);
  return {
    code: s.id, offeringId: str(d.offeringId), courseCode: str(d.courseCode), title: str(d.title), groupLabel: str(d.groupLabel),
    termLabel: str(d.termLabel), active: d.active === true, createdAt: millis(d.createdAt),
  };
}

export function toCheckin(s: Snap): CheckinDTO {
  const d = raw(s);
  return {
    id: s.id, offeringId: str(d.offeringId), sessionId: str(d.sessionId), studentUid: str(d.studentUid), at: millis(d.at) ?? 0,
    method: d.method === 'code' ? 'code' : d.method === 'simulated' ? 'simulated' : 'qr',
  };
}

export interface CheckinTokenDTO { sessionId: string; open: boolean; code: string; prevCode: string | null; rotatedAt: Millis | null }
export function toCheckinToken(s: Snap): CheckinTokenDTO {
  const d = raw(s);
  return { sessionId: str(d.sessionId, s.id), open: d.open === true, code: str(d.code), prevCode: optStr(d.prevCode), rotatedAt: millis(d.rotatedAt) };
}

export interface TermDTO { id: string; label: string; status: string }
export const toTerm = (s: Snap): TermDTO => { const d = raw(s); return { id: s.id, label: str(d.label, s.id), status: str(d.status, 'active') }; };

export interface AdminLogEntry { id: string; type: string; actorUid: string; at: Millis | null; target: string; details: Record<string, unknown> }
export function toAdminLog(s: Snap): AdminLogEntry {
  const d = raw(s);
  return { id: s.id, type: str(d.type), actorUid: str(d.actorUid), at: millis(d.at), target: str(d.target), details: (d.details as Record<string, unknown>) ?? {} };
}

export interface PlanStateDTO { done: Record<string, Millis> }
export function toPlanState(s: Snap): PlanStateDTO {
  const d = raw(s);
  const done: Record<string, Millis> = {};
  if (d.done && typeof d.done === 'object') for (const [k, v] of Object.entries(d.done as Raw)) if (typeof v === 'number') done[k] = v;
  return { done };
}
