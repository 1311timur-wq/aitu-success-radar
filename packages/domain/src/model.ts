// Plain DTOs of the canonical Firestore documents (data model v1.1), with timestamps as epoch ms.
// The data package converts Firestore snapshots into these; the domain never sees Firebase types.
import type {
  AssessmentCategory, AttendanceStatus, GradeState, Millis, Publication, RiskPolicy, SessionStatus, SessionType, SubmissionState,
} from './types.ts';
import type { GradingPeriod } from './grading.ts';

export interface Correction {
  reason: string;
  at: Millis | null;
  previous: Record<string, unknown> | null;
}

export interface OfferingDTO {
  id: string;
  courseCode: string;
  title: string;
  termId: string;
  termLabel: string;
  groupLabel: string;
  status: 'active' | 'archived';
  staffUids: string[];
  studentUids: string[];
  policy: RiskPolicy;
  /** Current join code (students type it in My DU); null = joining by code is closed. */
  joinCode?: string | null;
}

export interface EnrollmentDTO {
  studentUid: string;
  displayName: string;
  studentNumber: string;
  groupLabel: string;
  status: 'active' | 'withdrawn';
  /** How the student got in: 'code' (joined himself), 'admin' or 'seed'. */
  via?: 'code' | 'admin' | 'seed';
  enrolledAt?: Millis | null;
}

export interface SessionDTO {
  id: string;
  offeringId: string;
  type: SessionType;
  topic: string | null;
  room: string | null;
  startsAt: Millis;
  durationMinutes: number;
  status: SessionStatus;
  maxPoints: number;
  attendancePublication: Publication;
  publishedAt: Millis | null;
  revision: number;
  updatedAt: Millis | null;
}

export interface AttendanceRecordDTO {
  id: string;
  offeringId: string;
  sessionId: string;
  studentUid: string;
  status: AttendanceStatus;
  points: number | null;
  remark: string;
  publication: Publication;
  revision: number;
  updatedBy: string;
  updatedAt: Millis | null;
  correction: Correction | null;
}

export interface AssessmentDTO {
  id: string;
  offeringId: string;
  title: string;
  category: AssessmentCategory;
  maxPoints: number;
  dueAt: Millis | null;
  countsForOverdue: boolean;
  /** AITU register (weeks 1–5 / 6–10 / final) and syllabus weight inside it; null = not part of the registers. */
  period: GradingPeriod | null;
  weight: number | null;
  gradesPublication: Publication;
  publishedAt: Millis | null;
  revision: number;
  updatedAt: Millis | null;
}

export interface AssessmentRecordDTO {
  id: string;
  offeringId: string;
  assessmentId: string;
  studentUid: string;
  submission: SubmissionState;
  gradeState: GradeState;
  points: number | null;
  maxPoints: number;
  feedback: string;
  publication: Publication;
  revision: number;
  updatedBy: string;
  updatedAt: Millis | null;
  correction: Correction | null;
}

// ---------- deterministic document IDs (natural idempotency: a retry overwrites the same doc) ----------
export const attendanceRecordId = (sessionId: string, studentUid: string) => `${sessionId}_${studentUid}`;
export const assessmentRecordId = (assessmentId: string, studentUid: string) => `${assessmentId}_${studentUid}`;
