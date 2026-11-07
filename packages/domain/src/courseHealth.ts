import { computeRisk } from './risk.ts';
import { RISK_ORDER, type AssessmentCategory, type AssessmentEntry, type AttendanceEntry, type AttendanceStatus, type GradeState,
  type Millis, type RiskLevel, type RiskPolicy, type RiskResult, type SessionType, type SubmissionState, type TaskEntry } from './types.ts';
import type { AssessmentDTO, AssessmentRecordDTO, AttendanceRecordDTO, OfferingDTO, SessionDTO } from './model.ts';
import type { GradingPeriod } from './grading.ts';
import type { ScheduledSession } from './checkin.ts';

/** How far ahead the schedule (weekly plan, check-in) looks. */
export const SCHEDULE_HORIZON_DAYS = 8;

export interface AttendanceTimelineItem {
  sessionId: string;
  startsAt: Millis;
  type: SessionType;
  topic: string | null;
  status: AttendanceStatus;
  points: number | null;
  maxPoints: number;
  remark: string;
  corrected: boolean;
}

export interface GradeItem {
  assessmentId: string;
  title: string;
  category: AssessmentCategory;
  maxPoints: number;
  dueAt: Millis | null;
  submission: SubmissionState;
  gradeState: GradeState;
  points: number | null;
  /** points / maxPoints * 100 for graded items, else null (pending is never 0). */
  percent: number | null;
  feedback: string;
  corrected: boolean;
  period: GradingPeriod | null;
  weight: number | null;
}

export interface TaskItem {
  assessmentId: string;
  title: string;
  dueAt: Millis;
  submission: SubmissionState;
  overdue: boolean;
}

export interface CourseHealth {
  offeringId: string;
  courseCode: string;
  title: string;
  termLabel: string;
  risk: RiskResult;
  /** Thresholds the student is measured against (shown as goals in the UI). */
  policy: Pick<RiskPolicy, 'version' | 'attendanceLowBelowPercent' | 'recentGradeLowBelowPercent' | 'overdueCountAtLeast'>;
  attendance: {
    timeline: AttendanceTimelineItem[]; // newest first
    pointsEarned: number;
    pointsPossible: number;
  };
  grades: GradeItem[]; // newest first
  tasks: { overdue: TaskItem[]; upcoming: TaskItem[] };
  /** Sessions from 3 h ago up to SCHEDULE_HORIZON_DAYS ahead (not cancelled), oldest first. */
  schedule: ScheduledSession[];
  /** Latest updatedAt among the published records used (null = nothing published yet). */
  dataAsOf: Millis | null;
  /** Records skipped because they failed validation (corrupted / inconsistent data). */
  skippedRecords: number;
}

export interface CourseHealthInput {
  offering: OfferingDTO;
  sessions: readonly SessionDTO[];
  assessments: readonly AssessmentDTO[];
  /** Records of ONE student. Drafts are ignored even if passed in (teacher-side reuse). */
  attendanceRecords: readonly AttendanceRecordDTO[];
  assessmentRecords: readonly AssessmentRecordDTO[];
  now: Millis;
}

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/**
 * Canonical documents -> engine inputs -> student-facing course view.
 * Uses ONLY published records. Inconsistent records are skipped and counted instead of crashing the UI.
 */
export function buildCourseHealth(input: CourseHealthInput): CourseHealth {
  const { offering, now } = input;
  const sessionsById = new Map(input.sessions.map((s) => [s.id, s]));
  const assessmentsById = new Map(input.assessments.map((a) => [a.id, a]));
  let skipped = 0;
  let dataAsOf: Millis | null = null;
  const touch = (t: Millis | null) => { if (t != null && (dataAsOf == null || t > dataAsOf)) dataAsOf = t; };

  // ----- attendance -----
  const attendanceEntries: AttendanceEntry[] = [];
  const timeline: AttendanceTimelineItem[] = [];
  let pointsEarned = 0, pointsPossible = 0;
  for (const r of input.attendanceRecords) {
    if (r.publication !== 'published') continue;
    const s = sessionsById.get(r.sessionId);
    if (!s) { skipped++; continue; }
    if (r.status !== 'unmarked' && (!finite(r.points) || r.points < 0 || r.points > s.maxPoints)) { skipped++; continue; }
    attendanceEntries.push({ id: r.id, sessionStatus: s.status, publication: 'published', status: r.status });
    touch(r.updatedAt);
    if (s.status !== 'held') continue;
    timeline.push({
      sessionId: s.id, startsAt: s.startsAt, type: s.type, topic: s.topic, status: r.status,
      points: r.points, maxPoints: s.maxPoints, remark: r.remark, corrected: r.correction != null,
    });
    if (r.status !== 'unmarked') { pointsEarned += r.points ?? 0; pointsPossible += s.maxPoints; }
  }
  timeline.sort((a, b) => b.startsAt - a.startsAt || a.sessionId.localeCompare(b.sessionId));

  // ----- assessments & tasks -----
  const assessmentEntries: AssessmentEntry[] = [];
  const taskEntries: TaskEntry[] = [];
  const grades: GradeItem[] = [];
  const overdue: TaskItem[] = [];
  const upcoming: TaskItem[] = [];
  for (const r of input.assessmentRecords) {
    if (r.publication !== 'published') continue;
    const a = assessmentsById.get(r.assessmentId);
    if (!a || r.maxPoints !== a.maxPoints) { skipped++; continue; }
    const graded = r.gradeState === 'graded';
    if (graded ? !finite(r.points) || r.points < 0 || r.points > a.maxPoints : r.points != null) { skipped++; continue; }
    touch(r.updatedAt);
    assessmentEntries.push({
      id: a.id, at: a.dueAt ?? a.publishedAt ?? 0, publication: 'published', state: r.gradeState,
      pointsEarned: r.points, maxPoints: a.maxPoints, category: a.category, period: a.period, weight: a.weight,
    });
    grades.push({
      assessmentId: a.id, title: a.title, category: a.category, maxPoints: a.maxPoints, dueAt: a.dueAt,
      submission: r.submission, gradeState: r.gradeState, points: r.points,
      percent: graded ? ((r.points as number) / a.maxPoints) * 100 : null,
      feedback: r.feedback, corrected: r.correction != null, period: a.period, weight: a.weight,
    });
    if (a.countsForOverdue && a.dueAt != null) {
      taskEntries.push({ id: a.id, publication: 'published', state: r.submission, dueAt: a.dueAt });
      const item: TaskItem = { assessmentId: a.id, title: a.title, dueAt: a.dueAt, submission: r.submission, overdue: false };
      if (a.dueAt < now && r.submission === 'missing') overdue.push({ ...item, overdue: true });
      else if (a.dueAt >= now && (r.submission === 'pending' || r.submission === 'missing')) upcoming.push(item);
    }
  }
  // Registers need EVERY configured piece of work (e.g. the Endterm exam still ahead), not only graded ones:
  // work without a published result enters as `pending` (never as 0).
  const withResult = new Set(assessmentEntries.map((e) => e.id));
  for (const a of input.assessments) {
    if (a.period == null || a.weight == null || withResult.has(a.id)) continue;
    assessmentEntries.push({
      id: a.id, at: a.dueAt ?? a.publishedAt ?? 0, publication: 'published', state: 'pending',
      pointsEarned: null, maxPoints: a.maxPoints, category: a.category, period: a.period, weight: a.weight,
    });
  }
  // Upcoming deadlines are useful even before the teacher publishes any record for them.
  for (const a of input.assessments) {
    if (!a.countsForOverdue || a.dueAt == null || a.dueAt < now) continue;
    if (upcoming.some((u) => u.assessmentId === a.id) || grades.some((g) => g.assessmentId === a.id && g.submission !== 'pending' && g.submission !== 'missing')) continue;
    upcoming.push({ assessmentId: a.id, title: a.title, dueAt: a.dueAt, submission: 'pending', overdue: false });
  }
  grades.sort((x, y) => (y.dueAt ?? 0) - (x.dueAt ?? 0) || x.assessmentId.localeCompare(y.assessmentId));
  overdue.sort((x, y) => x.dueAt - y.dueAt);
  upcoming.sort((x, y) => x.dueAt - y.dueAt);

  const schedule: ScheduledSession[] = input.sessions
    .filter((x) => x.status !== 'cancelled' && x.startsAt >= now - 3 * 3_600_000 && x.startsAt <= now + SCHEDULE_HORIZON_DAYS * 86_400_000)
    .map((x) => ({ sessionId: x.id, startsAt: x.startsAt, durationMinutes: x.durationMinutes, type: x.type, topic: x.topic, room: x.room, status: x.status }))
    .sort((x, y) => x.startsAt - y.startsAt || x.sessionId.localeCompare(y.sessionId));

  const risk = computeRisk({ attendance: attendanceEntries, assessments: assessmentEntries, tasks: taskEntries, now, policy: offering.policy });

  return {
    offeringId: offering.id, courseCode: offering.courseCode, title: offering.title, termLabel: offering.termLabel,
    risk,
    policy: {
      version: offering.policy.version, attendanceLowBelowPercent: offering.policy.attendanceLowBelowPercent,
      recentGradeLowBelowPercent: offering.policy.recentGradeLowBelowPercent, overdueCountAtLeast: offering.policy.overdueCountAtLeast,
    },
    attendance: { timeline, pointsEarned, pointsPossible }, grades, tasks: { overdue, upcoming }, schedule,
    dataAsOf, skippedRecords: skipped,
  };
}

/** Deterministic ordering for the dashboard: High -> Medium -> Low -> Unknown, more reasons first, then title. */
export function compareByAttention(a: { risk: RiskResult; title: string }, b: { risk: RiskResult; title: string }): number {
  return RISK_ORDER.indexOf(a.risk.level) - RISK_ORDER.indexOf(b.risk.level)
    || b.risk.reasons.length - a.risk.reasons.length
    || a.title.localeCompare(b.title);
}

export interface RadarSummary {
  counts: Record<RiskLevel, number>;
  ordered: CourseHealth[];
  /** The one course to look at first (high/medium only); null when nothing needs attention. */
  focus: CourseHealth | null;
}

/** Replaces the old undefined "72/100" score: an honest count of courses per state + the focus course. */
export function summarizeRadar(courses: readonly CourseHealth[]): RadarSummary {
  const counts: Record<RiskLevel, number> = { high: 0, medium: 0, low: 0, unknown: 0 };
  for (const c of courses) counts[c.risk.level]++;
  const ordered = [...courses].sort(compareByAttention);
  const first = ordered[0];
  return { counts, ordered, focus: first && (first.risk.level === 'high' || first.risk.level === 'medium') ? first : null };
}

export interface StudentRisk {
  studentUid: string;
  health: CourseHealth;
}

/** Teacher side: the same computation per enrolled student, from ALL records of the offering. */
export function buildRosterRisk(input: Omit<CourseHealthInput, 'attendanceRecords' | 'assessmentRecords'> & {
  studentUids: readonly string[];
  attendanceRecords: readonly AttendanceRecordDTO[];
  assessmentRecords: readonly AssessmentRecordDTO[];
}): StudentRisk[] {
  const byStudent = <T extends { studentUid: string }>(rows: readonly T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) { const list = m.get(r.studentUid); if (list) list.push(r); else m.set(r.studentUid, [r]); }
    return m;
  };
  const att = byStudent(input.attendanceRecords);
  const asm = byStudent(input.assessmentRecords);
  return input.studentUids.map((studentUid) => ({
    studentUid,
    health: buildCourseHealth({
      offering: input.offering, sessions: input.sessions, assessments: input.assessments, now: input.now,
      attendanceRecords: att.get(studentUid) ?? [], assessmentRecords: asm.get(studentUid) ?? [],
    }),
  }));
}
