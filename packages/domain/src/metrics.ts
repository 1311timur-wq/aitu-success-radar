import { DEFAULT_DEMO_POLICY, assertPolicy } from './policy.ts';
import {
  ATTENDANCE_STATUSES, GRADE_STATES, SESSION_STATUSES, SUBMISSION_STATES,
  type AttendanceEntry, type AssessmentEntry, type AttendanceStatus, type Millis, type RiskPolicy, type TaskEntry,
} from './types.ts';

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isPublication = (x: unknown) => x === 'draft' || x === 'published';

export interface AttendanceMetrics {
  eligibleCount: number;
  excusedCount: number;
  unmarkedCount: number;
  percent: number | null;
  enoughForRisk: boolean;
}

/**
 * Attendance % among held + published + explicitly marked sessions.
 * cancelled/scheduled sessions, drafts, `excused` and `unmarked` never enter the denominator.
 * Validation is strict even for excluded entries, to surface corrupted canonical data early.
 */
export function calculateAttendance(entries: readonly AttendanceEntry[] = [], policy: RiskPolicy = DEFAULT_DEMO_POLICY): AttendanceMetrics {
  assertPolicy(policy);
  if (!Array.isArray(entries)) throw new TypeError('Attendance entries must be an array');
  let eligibleCount = 0, credit = 0, excusedCount = 0, unmarkedCount = 0;
  for (const e of entries) {
    if (!e || !ATTENDANCE_STATUSES.includes(e.status)) throw new TypeError('Invalid attendance status');
    if (!SESSION_STATUSES.includes(e.sessionStatus)) throw new TypeError('Invalid session status');
    if (!isPublication(e.publication)) throw new TypeError('Invalid attendance publication');
    if (e.publication !== 'published' || e.sessionStatus !== 'held') continue;
    if (e.status === 'excused') { excusedCount++; continue; }
    if (e.status === 'unmarked') { unmarkedCount++; continue; }
    eligibleCount++;
    if (e.status === 'present') credit += 1;
    else if (e.status === 'late') credit += policy.lateAttendanceCredit;
  }
  return {
    eligibleCount, excusedCount, unmarkedCount,
    percent: eligibleCount === 0 ? null : (100 * credit) / eligibleCount,
    enoughForRisk: eligibleCount >= policy.attendanceMinSessions,
  };
}

export interface AssessmentMetrics {
  gradedCount: number;
  observedPercent: number | null;
  recentGradePercent: number | null;
  recentGradeCount: number;
  recentEnoughForRisk: boolean;
}

/** Only published `graded` entries count. `pending` is never 0; explicit `missing` is not a grade. */
export function calculateAssessmentMetrics(entries: readonly AssessmentEntry[] = [], policy: RiskPolicy = DEFAULT_DEMO_POLICY): AssessmentMetrics {
  assertPolicy(policy);
  if (!Array.isArray(entries)) throw new TypeError('Assessments must be an array');
  const graded: AssessmentEntry[] = [];
  for (const e of entries) {
    if (!e || !GRADE_STATES.includes(e.state)) throw new TypeError('Invalid grade state');
    if (!isPublication(e.publication)) throw new TypeError('Invalid grade publication');
    if (!finite(e.maxPoints) || e.maxPoints <= 0) throw new RangeError('Invalid maxPoints');
    if (e.state === 'graded' && (!finite(e.pointsEarned) || e.pointsEarned < 0 || e.pointsEarned > e.maxPoints)) {
      throw new RangeError('Grade must be within [0, maxPoints]');
    }
    if (e.state !== 'graded' && e.pointsEarned != null) throw new TypeError('Non-graded state cannot carry points');
    if (e.publication === 'published' && e.state === 'graded') graded.push(e);
  }
  const earned = graded.reduce((s, x) => s + (x.pointsEarned as number), 0);
  const possible = graded.reduce((s, x) => s + x.maxPoints, 0);
  const recent = [...graded]
    .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))
    .slice(0, policy.recentGradeWindow);
  const recentGradePercent = recent.length === 0
    ? null
    : recent.reduce((s, x) => s + ((x.pointsEarned as number) / x.maxPoints) * 100, 0) / recent.length;
  return {
    gradedCount: graded.length,
    observedPercent: possible > 0 ? (earned / possible) * 100 : null,
    recentGradePercent,
    recentGradeCount: recent.length,
    recentEnoughForRisk: recent.length >= policy.recentGradeMinCount,
  };
}

export interface TaskMetrics {
  dueEligibleCount: number;
  overdueCount: number;
  submittedCount: number;
  completionPercent: number | null;
}

/**
 * Submission status is INDEPENDENT of the grade. Only an explicit, published `missing`
 * after the deadline is overdue. Pending/unpublished work is never inferred as missing.
 */
export function calculateTaskCompletion(entries: readonly TaskEntry[] = [], now: Millis = Date.now()): TaskMetrics {
  if (!Array.isArray(entries)) throw new TypeError('Tasks must be an array');
  if (!finite(now)) throw new TypeError('Invalid now');
  let dueEligibleCount = 0, overdueCount = 0, submittedCount = 0;
  const seen = new Set<string>();
  for (const e of entries) {
    if (!e || !SUBMISSION_STATES.includes(e.state) || !isPublication(e.publication)) throw new TypeError('Invalid task state/publication');
    if (typeof e.id !== 'string' || !e.id || seen.has(e.id)) throw new TypeError('Invalid or duplicate task id');
    seen.add(e.id);
    if (!finite(e.dueAt)) throw new TypeError('Task dueAt is required');
    if (e.publication !== 'published' || e.dueAt >= now) continue;
    if (e.state === 'pending' || e.state === 'excused') continue;
    dueEligibleCount++;
    if (e.state === 'missing') overdueCount++;
    else submittedCount++; // submitted | late_submitted
  }
  return {
    dueEligibleCount, overdueCount, submittedCount,
    completionPercent: dueEligibleCount === 0 ? null : (100 * submittedCount) / dueEligibleCount,
  };
}

/** LMS-style attendance points suggested for a status (teacher may still override within [0, max]). */
export function suggestedAttendancePoints(status: AttendanceStatus, maxPoints: number, policy: RiskPolicy = DEFAULT_DEMO_POLICY): number | null {
  if (status === 'unmarked') return null;
  if (!finite(maxPoints) || maxPoints < 0) throw new RangeError('Invalid maxPoints');
  // Round to 0.5 to keep values readable in the sheet (e.g. late on a 2-point session = 1).
  return Math.round(maxPoints * policy.attendancePointShare[status] * 2) / 2;
}
