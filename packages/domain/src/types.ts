import type { CourseStanding, GradingPeriod, GradingScheme } from './grading.ts';

// Shared vocabulary of the academic domain. No Firebase and no UI imports here:
// this package must stay runnable in Node, in the browser and (later) in Cloud Functions.

export type Millis = number; // UTC epoch milliseconds

export type Publication = 'draft' | 'published';
export type RiskLevel = 'high' | 'medium' | 'low' | 'unknown';

export type SessionType = 'lecture' | 'practice' | 'lab';
export type SessionStatus = 'scheduled' | 'held' | 'cancelled';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused' | 'unmarked';

export type AssessmentCategory = 'quiz' | 'assignment' | 'lab' | 'project' | 'midterm' | 'endterm' | 'final';
export type SubmissionState = 'pending' | 'submitted' | 'late_submitted' | 'missing' | 'excused';
export type GradeState = 'pending' | 'graded' | 'missing' | 'excused';

export type ReasonCode = 'ATTENDANCE_LOW' | 'OVERDUE_WORK' | 'RECENT_GRADES_LOW' | 'ADMISSION_RISK' | 'SCHOLARSHIP_RISK';
export type ActionCode =
  | 'CHECK_ATTENDANCE'
  | 'COMPLETE_MISSING_WORK'
  | 'REVIEW_WEAK_ASSESSMENTS'
  | 'CONTACT_TEACHER'
  | 'MAKE_STUDY_PLAN'
  | 'RAISE_REGISTER'
  | 'PROTECT_SCHOLARSHIP';

export const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = ['present', 'late', 'absent', 'excused', 'unmarked'];
export const SESSION_STATUSES: readonly SessionStatus[] = ['scheduled', 'held', 'cancelled'];
export const SUBMISSION_STATES: readonly SubmissionState[] = ['pending', 'submitted', 'late_submitted', 'missing', 'excused'];
export const GRADE_STATES: readonly GradeState[] = ['pending', 'graded', 'missing', 'excused'];
export const ASSESSMENT_CATEGORIES: readonly AssessmentCategory[] = ['quiz', 'assignment', 'lab', 'project', 'midterm', 'endterm', 'final'];
export const RISK_ORDER: readonly RiskLevel[] = ['high', 'medium', 'low', 'unknown'];

// ---------- engine inputs (already flattened, one student, one offering) ----------
export interface AttendanceEntry {
  id: string;
  sessionStatus: SessionStatus;
  publication: Publication;
  status: AttendanceStatus;
}

export interface AssessmentEntry {
  id: string;
  /** Moment used to order results by recency (due date, else publication time). */
  at: Millis;
  publication: Publication;
  state: GradeState;
  pointsEarned: number | null;
  maxPoints: number;
  category: AssessmentCategory;
  /** AITU register this work belongs to and its syllabus weight inside it (absent = legacy demo mode). */
  period?: GradingPeriod | null;
  weight?: number | null;
}

export interface TaskEntry {
  id: string;
  publication: Publication;
  state: SubmissionState;
  dueAt: Millis;
}

// ---------- policy ----------
export interface RiskPolicy {
  version: string;
  attendanceLowBelowPercent: number;
  attendanceMinSessions: number;
  lateAttendanceCredit: number;
  overdueCountAtLeast: number;
  recentGradeLowBelowPercent: number;
  recentGradeMinCount: number;
  recentGradeWindow: number;
  lowMinIndependentChannels: number;
  /** Share of session.maxPoints suggested to the teacher for each status (LMS points, not risk). */
  attendancePointShare: Record<Exclude<AttendanceStatus, 'unmarked'>, number>;
  /** Official grading rules; used when assessments carry a register period + weight. */
  grading?: GradingScheme | null;
}

// ---------- engine outputs ----------
export interface RiskReason {
  code: ReasonCode;
  observed: number;
  threshold: number;
  evidenceCount: number;
}

export interface RiskMetrics {
  attendancePercent: number | null;
  attendanceCount: number;
  observedAssessmentPercent: number | null;
  recentGradePercent: number | null;
  recentGradeCount: number;
  overdueCount: number;
  taskCompletionPercent: number | null;
  evidenceChannels: number;
}

export interface RiskResult {
  ruleVersion: string;
  /** Registers, admission, total, GPA and "what is needed" — null without AITU periods. */
  standing: CourseStanding | null;
  level: RiskLevel;
  reasons: RiskReason[];
  actions: ActionCode[];
  metrics: RiskMetrics;
}
