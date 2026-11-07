import {
  computeStanding, GRADING_PERIODS, normalizePolicy,
  type AssessmentDTO, type AssessmentRecordDTO, type CourseStanding, type GradingItem, type GradingPeriod, type OfferingDTO,
} from '@aitu/domain';

/** Teacher view: registers from ALL saved results (drafts included), like the LMS grader report. */
export function teacherStanding(offering: OfferingDTO, assessments: readonly AssessmentDTO[], records: readonly AssessmentRecordDTO[], studentUid: string): CourseStanding | null {
  const scheme = offering.policy.grading ?? normalizePolicy(null).grading!;
  const byAssessment = new Map(records.filter((r) => r.studentUid === studentUid).map((r) => [r.assessmentId, r]));
  const items: GradingItem[] = assessments
    .filter((a) => a.period != null && a.weight != null)
    .map((a) => {
      const r = byAssessment.get(a.id);
      const state = r?.gradeState ?? 'pending';
      return { id: a.id, period: a.period!, weight: a.weight!, state, percent: state === 'graded' && r?.points != null ? (r.points / a.maxPoints) * 100 : null };
    });
  return items.length ? computeStanding(items, scheme) : null;
}

/** Sum of syllabus weights per register (should be 100 %). */
export function weightSums(assessments: readonly AssessmentDTO[]): Record<GradingPeriod, number> {
  const sums = Object.fromEntries(GRADING_PERIODS.map((p) => [p, 0])) as Record<GradingPeriod, number>;
  for (const a of assessments) if (a.period && a.weight != null) sums[a.period] += a.weight;
  return sums;
}

export const PERIOD_ORDER: (GradingPeriod | null)[] = ['midterm', 'endterm', 'final', null];
