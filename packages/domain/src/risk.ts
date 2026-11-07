import { DEFAULT_DEMO_POLICY, assertPolicy } from './policy.ts';
import { calculateAssessmentMetrics, calculateAttendance, calculateTaskCompletion } from './metrics.ts';
import type { ActionCode, AssessmentEntry, AttendanceEntry, Millis, ReasonCode, RiskLevel, RiskPolicy, RiskReason, RiskResult, TaskEntry } from './types.ts';
import { computeStanding, type CourseStanding, type GradingItem } from './grading.ts';

const RECOMMENDATIONS: Record<ReasonCode, ActionCode[]> = {
  ATTENDANCE_LOW: ['CHECK_ATTENDANCE', 'CONTACT_TEACHER'],
  OVERDUE_WORK: ['COMPLETE_MISSING_WORK', 'MAKE_STUDY_PLAN'],
  RECENT_GRADES_LOW: ['REVIEW_WEAK_ASSESSMENTS', 'CONTACT_TEACHER'],
  ADMISSION_RISK: ['RAISE_REGISTER', 'CONTACT_TEACHER'],
  SCHOLARSHIP_RISK: ['PROTECT_SCHOLARSHIP', 'REVIEW_WEAK_ASSESSMENTS'],
};

/** Published entries that carry an AITU register period -> grading items (0–100 scale). */
function gradingItems(assessments: readonly AssessmentEntry[]): GradingItem[] {
  return assessments
    .filter((e) => e.publication === 'published' && e.period != null && typeof e.weight === 'number')
    .map((e) => ({
      id: e.id, period: e.period!, weight: e.weight!, state: e.state,
      percent: e.state === 'graded' && e.pointsEarned != null ? (e.pointsEarned / e.maxPoints) * 100 : null,
    }));
}

export interface RiskInput {
  attendance?: readonly AttendanceEntry[];
  assessments?: readonly AssessmentEntry[];
  tasks?: readonly TaskEntry[];
  now?: Millis;
  policy?: RiskPolicy;
}

/**
 * risk-aitu-v1. Pure and deterministic for an explicit `now`.
 * Signals: ATTENDANCE_LOW, OVERDUE_WORK, and — when assessments carry AITU register periods —
 * ADMISSION_RISK (the pace leads below RegMid/RegEnd 25 or RegTerm 50) or SCHOLARSHIP_RISK (course below 70 %).
 * Without periods the legacy RECENT_GRADES_LOW signal is used instead.
 *  high    — at least 2 independent signals, or ADMISSION_RISK alone (missing the final means a summer term)
 *  medium  — exactly 1 signal
 *  low     — no signals AND enough evidence in >= lowMinIndependentChannels channels
 *  unknown — no signals but not enough evidence (Unknown is NOT Low)
 */
export function computeRisk({ attendance = [], assessments = [], tasks = [], now = Date.now(), policy = DEFAULT_DEMO_POLICY }: RiskInput = {}): RiskResult {
  assertPolicy(policy);
  const a = calculateAttendance(attendance, policy);
  const g = calculateAssessmentMetrics(assessments, policy);
  const t = calculateTaskCompletion(tasks, now);

  const items = policy.grading ? gradingItems(assessments) : [];
  const standing: CourseStanding | null = items.length ? computeStanding(items, policy.grading!) : null;

  const reasons: RiskReason[] = [];
  if (a.enoughForRisk && a.percent !== null && a.percent < policy.attendanceLowBelowPercent) {
    reasons.push({ code: 'ATTENDANCE_LOW', observed: a.percent, threshold: policy.attendanceLowBelowPercent, evidenceCount: a.eligibleCount });
  }
  if (t.overdueCount >= policy.overdueCountAtLeast) {
    reasons.push({ code: 'OVERDUE_WORK', observed: t.overdueCount, threshold: policy.overdueCountAtLeast, evidenceCount: t.dueEligibleCount });
  }
  if (standing) {
    const decided = items.filter((i) => i.state === 'graded' || i.state === 'missing').length;
    if (standing.hasEvidence && (standing.admission === 'at-risk' || standing.admission === 'not-admitted')) {
      reasons.push({ code: 'ADMISSION_RISK', observed: standing.regTerm.value ?? standing.regTerm.estimate ?? 0, threshold: standing.scheme.admissionRegTermMin, evidenceCount: decided });
    } else if (standing.hasEvidence && (standing.scholarship === 'at-risk' || standing.scholarship === 'lost')) {
      reasons.push({ code: 'SCHOLARSHIP_RISK', observed: standing.total.value ?? standing.total.estimate ?? 0, threshold: standing.scheme.scholarshipPercent, evidenceCount: decided });
    }
  } else if (g.recentEnoughForRisk && g.recentGradePercent !== null && g.recentGradePercent < policy.recentGradeLowBelowPercent) {
    reasons.push({ code: 'RECENT_GRADES_LOW', observed: g.recentGradePercent, threshold: policy.recentGradeLowBelowPercent, evidenceCount: g.recentGradeCount });
  }

  const gradeChannel = standing ? standing.hasEvidence : g.recentEnoughForRisk;
  const channels = Number(a.enoughForRisk) + Number(t.dueEligibleCount > 0) + Number(gradeChannel);
  const admissionRisk = reasons.some((r) => r.code === 'ADMISSION_RISK');
  const level: RiskLevel =
    reasons.length >= 2 || admissionRisk ? 'high'
      : reasons.length === 1 ? 'medium'
        : channels >= policy.lowMinIndependentChannels ? 'low' : 'unknown';

  let actions = [...new Set(reasons.flatMap((r) => RECOMMENDATIONS[r.code]))];
  if (level === 'high' && actions.length < 2) {
    actions = [...new Set<ActionCode>([...actions, 'CONTACT_TEACHER', 'MAKE_STUDY_PLAN'])];
  }

  return {
    ruleVersion: policy.version,
    standing,
    level,
    reasons,
    actions,
    metrics: {
      attendancePercent: a.percent,
      attendanceCount: a.eligibleCount,
      observedAssessmentPercent: g.observedPercent,
      recentGradePercent: g.recentGradePercent,
      recentGradeCount: g.recentGradeCount,
      overdueCount: t.overdueCount,
      taskCompletionPercent: t.completionPercent,
      evidenceChannels: channels,
    },
  };
}

/** Monotonic guard for any future materialized view (server-side projections). */
export function shouldApplyProjection(current: { sourceRevision: number } | null | undefined, incomingSourceRevision: number): boolean {
  if (!Number.isSafeInteger(incomingSourceRevision) || incomingSourceRevision < 0) throw new RangeError('Invalid sourceRevision');
  return current == null || (Number.isSafeInteger(current.sourceRevision) && incomingSourceRevision >= current.sourceRevision);
}
