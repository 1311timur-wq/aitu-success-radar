import type { RiskPolicy } from './types.ts';
import { AITU_GRADING } from './grading.ts';

// Risk thresholds (attendance 80 %, 2 overdue works) are DEMO values, not approved AITU rules (Q-01..Q-06).
// The grading block (registers, admission, Total, scholarship) follows the AITU rules in grading.ts.
export const RISK_RULE_VERSION = 'risk-aitu-v1';

export const DEFAULT_DEMO_POLICY: Readonly<RiskPolicy> = Object.freeze({
  version: RISK_RULE_VERSION,
  attendanceLowBelowPercent: 80,
  attendanceMinSessions: 3,
  lateAttendanceCredit: 0.5,
  overdueCountAtLeast: 2,
  recentGradeLowBelowPercent: 60,
  recentGradeMinCount: 2,
  recentGradeWindow: 3,
  lowMinIndependentChannels: 2,
  attendancePointShare: Object.freeze({ present: 1, late: 0.5, excused: 0.5, absent: 0 }),
  grading: AITU_GRADING,
});

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const posInt = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 1;
const share = (x: unknown) => finite(x) && x >= 0 && x <= 1;

export function assertPolicy(p: RiskPolicy | null | undefined): asserts p is RiskPolicy {
  const ok =
    !!p &&
    typeof p.version === 'string' && p.version.length > 0 &&
    finite(p.attendanceLowBelowPercent) &&
    finite(p.recentGradeLowBelowPercent) &&
    posInt(p.attendanceMinSessions) &&
    posInt(p.recentGradeMinCount) &&
    posInt(p.recentGradeWindow) && p.recentGradeWindow >= p.recentGradeMinCount &&
    posInt(p.lowMinIndependentChannels) &&
    posInt(p.overdueCountAtLeast) &&
    share(p.lateAttendanceCredit) &&
    !!p.attendancePointShare &&
    share(p.attendancePointShare.present) && share(p.attendancePointShare.late) &&
    share(p.attendancePointShare.excused) && share(p.attendancePointShare.absent);
  if (!ok) throw new TypeError('Invalid academic risk policy');
}

/** Accepts a policy stored in Firestore; missing new fields fall back to the demo defaults. */
export function normalizePolicy(raw: Partial<RiskPolicy> | null | undefined): RiskPolicy {
  const merged: RiskPolicy = {
    ...DEFAULT_DEMO_POLICY,
    ...(raw ?? {}),
    attendancePointShare: { ...DEFAULT_DEMO_POLICY.attendancePointShare, ...(raw?.attendancePointShare ?? {}) },
    grading: raw?.grading === null ? null : { ...AITU_GRADING, ...(raw?.grading ?? {}) },
  };
  assertPolicy(merged);
  return merged;
}
