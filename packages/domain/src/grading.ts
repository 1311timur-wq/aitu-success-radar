// AITU grading rules (provided by the student body guide; verify against the Academic Policy / syllabus):
//   Register Midterm (weeks 1–5) and Register Endterm (weeks 6–10): weighted per syllabus, 0–100 each.
//   RegTerm = 0.5·RegMid + 0.5·RegEnd.  Admission to the final: RegMid ≥ 25, RegEnd ≥ 25, RegTerm ≥ 50 (else F).
//   Total   = 0.3·RegMid + 0.3·RegEnd + 0.4·Final.   Final 25–49 → FX (paid retake), Final < 25 → F (summer term).
//   Scholarship: every course GPA ≥ 2.33 (≥ 70%); 80% (3.0) is the comfortable target.
// Pure functions, no Firebase. All scores are on a 0–100 scale.
import type { GradeState } from './types.ts';

export type GradingPeriod = 'midterm' | 'endterm' | 'final';
export const GRADING_PERIODS: readonly GradingPeriod[] = ['midterm', 'endterm', 'final'];

export interface GradingScheme {
  version: string;
  regMidWeight: number;   // in Total
  regEndWeight: number;
  finalWeight: number;
  regTermMidShare: number; // in RegTerm
  admissionRegisterMin: number; // each register
  admissionRegTermMin: number;
  finalFxMin: number;      // Final < this -> F
  finalPassMin: number;    // Final < this -> FX
  scholarshipPercent: number;
  recommendedPercent: number;
  /** A missing submission after the deadline counts as 0 in its register (AITU practice). */
  missingCountsAsZero: boolean;
}

export const AITU_GRADING: Readonly<GradingScheme> = Object.freeze({
  version: 'aitu-grading-2026',
  regMidWeight: 0.3,
  regEndWeight: 0.3,
  finalWeight: 0.4,
  regTermMidShare: 0.5,
  admissionRegisterMin: 25,
  admissionRegTermMin: 50,
  finalFxMin: 25,
  finalPassMin: 50,
  scholarshipPercent: 70,
  recommendedPercent: 80,
  missingCountsAsZero: true,
});

// Kazakhstan credit-system letter scale (70% = 2.33, 80% = 3.0).
const SCALE: { min: number; letter: string; gpa: number }[] = [
  { min: 95, letter: 'A', gpa: 4.0 }, { min: 90, letter: 'A-', gpa: 3.67 }, { min: 85, letter: 'B+', gpa: 3.33 },
  { min: 80, letter: 'B', gpa: 3.0 }, { min: 75, letter: 'B-', gpa: 2.67 }, { min: 70, letter: 'C+', gpa: 2.33 },
  { min: 65, letter: 'C', gpa: 2.0 }, { min: 60, letter: 'C-', gpa: 1.67 }, { min: 55, letter: 'D+', gpa: 1.33 },
  { min: 50, letter: 'D', gpa: 1.0 }, { min: 0, letter: 'F', gpa: 0 },
];
export function letterGrade(percent: number): { letter: string; gpa: number } {
  const p = Math.max(0, Math.min(100, percent));
  const row = SCALE.find((r) => p >= r.min - 1e-9)!;
  return { letter: row.letter, gpa: row.gpa };
}

export interface GradingItem {
  id: string;
  period: GradingPeriod;
  /** Share within its register from the syllabus (e.g. 0.2 = 20 %). */
  weight: number;
  state: GradeState;
  /** 0–100 for graded items, otherwise null. */
  percent: number | null;
}

export interface RegisterStatus {
  period: GradingPeriod;
  /** Sum of configured weights (should be 1; values are normalised if not). */
  weightTotal: number;
  /** Weight already decided (graded, or missing counted as 0). */
  decidedWeight: number;
  remainingWeight: number;
  /** Points secured so far on the register's 0–100 scale. */
  secured: number;
  /** Average over decided work (the current pace), null if nothing decided. */
  current: number | null;
  /** Final register value when complete, else null. */
  value: number | null;
  min: number; // if everything left scored 0
  max: number; // if everything left scored 100
  complete: boolean;
  itemCount: number;
}

const EPS = 1e-9;

export function registerStatus(items: readonly GradingItem[], period: GradingPeriod, scheme: GradingScheme = AITU_GRADING): RegisterStatus {
  const own = items.filter((i) => i.period === period);
  for (const i of own) {
    if (!Number.isFinite(i.weight) || i.weight < 0 || i.weight > 1) throw new RangeError(`Invalid weight for ${i.id}`);
    if (i.state === 'graded' && (i.percent == null || i.percent < 0 || i.percent > 100)) throw new RangeError(`Invalid percent for ${i.id}`);
  }
  const active = own.filter((i) => i.state !== 'excused'); // excused work is taken out and the rest re-weighted
  const weightTotal = active.reduce((s, i) => s + i.weight, 0);
  let decided = 0, points = 0;
  for (const i of active) {
    if (i.state === 'graded') { decided += i.weight; points += i.weight * (i.percent as number); }
    else if (i.state === 'missing' && scheme.missingCountsAsZero) decided += i.weight;
  }
  const norm = weightTotal > EPS ? 1 / weightTotal : 0;
  const remaining = Math.max(0, weightTotal - decided);
  const secured = points * norm;
  const complete = weightTotal > EPS && remaining <= EPS;
  return {
    period, weightTotal, decidedWeight: decided * norm, remainingWeight: remaining * norm, secured,
    current: decided > EPS ? points / decided : null,
    value: complete ? secured : null,
    min: secured, max: Math.min(100, secured + remaining * norm * 100),
    complete, itemCount: own.length,
  };
}

/** Average needed on what is left of a register to reach `target` (null if decided; >100 means unreachable). */
export function neededOnRemaining(r: RegisterStatus, target: number): number | null {
  if (r.remainingWeight <= EPS) return null;
  return Math.max(0, (target - r.secured) / r.remainingWeight);
}

export type Admission = 'admitted' | 'on-track' | 'at-risk' | 'not-admitted' | 'unknown';
export type Outcome = 'pass' | 'FX' | 'F' | null;
export type Scholarship = 'safe' | 'at-risk' | 'lost' | 'unknown';

export interface CourseStanding {
  scheme: GradingScheme;
  regMid: RegisterStatus;
  regEnd: RegisterStatus;
  final: RegisterStatus;
  regTerm: { value: number | null; estimate: number | null };
  total: { value: number | null; estimate: number | null };
  admission: Admission;
  outcome: Outcome;
  scholarship: Scholarship;
  grade: { letter: string; gpa: number } | null; // of value, else of estimate
  needs: {
    /** RegEnd score needed for admission given the final RegMid (max of 25 and 2·50 − RegMid). */
    regEndForAdmission: number | null;
    /** Average needed on the remaining work of the open register for admission. */
    remainingForAdmission: number | null;
    /** Same, to keep the course at the scholarship level (70). */
    remainingForScholarship: number | null;
    /** Final exam score needed (≥ finalPassMin anyway) for Total ≥ 50 / 70 / 80; > 100 = unreachable. */
    finalToPass: number | null;
    finalForScholarship: number | null;
    finalForRecommended: number | null;
  };
  /** Enough decided work to say anything about grades (≥ 2 items or ≥ 30 % of a register). */
  hasEvidence: boolean;
}

export function computeStanding(items: readonly GradingItem[], scheme: GradingScheme = AITU_GRADING): CourseStanding {
  const regMid = registerStatus(items, 'midterm', scheme);
  const regEnd = registerStatus(items, 'endterm', scheme);
  const final = registerStatus(items, 'final', scheme);
  const s = scheme;
  const term = (m: number, e: number) => s.regTermMidShare * m + (1 - s.regTermMidShare) * e;
  const totalOf = (m: number, e: number, f: number) => s.regMidWeight * m + s.regEndWeight * e + s.finalWeight * f;

  const regTermValue = regMid.value != null && regEnd.value != null ? term(regMid.value, regEnd.value) : null;
  const midPace = regMid.value ?? regMid.current;
  const endPace = regEnd.value ?? regEnd.current;
  const regTermEstimate = regTermValue ?? (midPace != null && endPace != null ? term(midPace, endPace) : midPace ?? endPace);

  // ----- admission to the final -----
  let admission: Admission = 'unknown';
  // A register without configured work cannot fail anyone yet: treat its ceiling as 100.
  const midMax = regMid.weightTotal > EPS ? regMid.max : 100;
  const endMax = regEnd.weightTotal > EPS ? regEnd.max : 100;
  const certainFail = midMax < s.admissionRegisterMin - EPS || endMax < s.admissionRegisterMin - EPS
    || term(midMax, endMax) < s.admissionRegTermMin - EPS;
  if (certainFail) admission = 'not-admitted';
  else if (regTermValue != null) {
    admission = regMid.value! >= s.admissionRegisterMin && regEnd.value! >= s.admissionRegisterMin && regTermValue >= s.admissionRegTermMin ? 'admitted' : 'not-admitted';
  } else if (regTermEstimate != null) {
    const paceBelow = (midPace != null && midPace < s.admissionRegisterMin) || (endPace != null && endPace < s.admissionRegisterMin) || regTermEstimate < s.admissionRegTermMin;
    admission = paceBelow ? 'at-risk' : 'on-track';
  }

  // ----- final outcome & total -----
  let outcome: Outcome = null;
  let totalValue: number | null = null;
  if (final.value != null && regTermValue != null) {
    if (admission === 'not-admitted') outcome = 'F';
    else {
      totalValue = totalOf(regMid.value!, regEnd.value!, final.value);
      outcome = final.value < s.finalFxMin ? 'F' : final.value < s.finalPassMin ? 'FX' : totalValue >= 50 ? 'pass' : 'FX';
    }
  } else if (admission === 'not-admitted' && regTermValue != null) outcome = 'F';
  // Estimate: if the final is still ahead, assume the student keeps the RegTerm pace on it.
  const finalPace = final.value ?? final.current ?? regTermEstimate;
  const totalEstimate = totalValue ?? (midPace != null && endPace != null && finalPace != null ? totalOf(midPace, endPace, finalPace) : regTermEstimate);

  // ----- what is needed -----
  const needs: CourseStanding['needs'] = {
    regEndForAdmission: null, remainingForAdmission: null, remainingForScholarship: null,
    finalToPass: null, finalForScholarship: null, finalForRecommended: null,
  };
  if (regMid.value != null && regEnd.value == null) {
    needs.regEndForAdmission = Math.max(s.admissionRegisterMin, (s.admissionRegTermMin - s.regTermMidShare * regMid.value) / (1 - s.regTermMidShare));
    needs.remainingForAdmission = neededOnRemaining(regEnd, needs.regEndForAdmission);
    needs.remainingForScholarship = neededOnRemaining(regEnd, Math.max(needs.regEndForAdmission, s.scholarshipPercent));
  } else if (regMid.value == null) {
    needs.remainingForAdmission = neededOnRemaining(regMid, s.admissionRegisterMin);
    needs.remainingForScholarship = neededOnRemaining(regMid, s.scholarshipPercent);
  }
  if (regTermValue != null && admission !== 'not-admitted' && final.value == null) {
    const finalFor = (target: number) => Math.max(s.finalPassMin, (target - s.regMidWeight * regMid.value! - s.regEndWeight * regEnd.value!) / s.finalWeight);
    needs.finalToPass = finalFor(50);
    needs.finalForScholarship = finalFor(s.scholarshipPercent);
    needs.finalForRecommended = finalFor(s.recommendedPercent);
  }

  // ----- scholarship (course GPA ≥ 2.33 ⇔ ≥ 70 %) -----
  const basis = totalValue ?? totalEstimate;
  let scholarship: Scholarship = 'unknown';
  if (outcome === 'F' || outcome === 'FX' || admission === 'not-admitted') scholarship = 'lost';
  else if (totalValue != null) scholarship = totalValue >= s.scholarshipPercent ? 'safe' : 'lost';
  else if (basis != null) {
    const maxTotal = totalOf(midMax, endMax, 100);
    scholarship = maxTotal < s.scholarshipPercent ? 'lost' : basis >= s.scholarshipPercent ? 'safe' : 'at-risk';
  }

  const decidedItems = items.filter((i) => i.state === 'graded' || (i.state === 'missing' && s.missingCountsAsZero)).length;
  const hasEvidence = decidedItems >= 2 || regMid.decidedWeight >= 0.3 || regEnd.decidedWeight >= 0.3;

  return {
    scheme: s, regMid, regEnd, final,
    regTerm: { value: regTermValue, estimate: regTermEstimate },
    total: { value: totalValue, estimate: totalEstimate },
    admission, outcome, scholarship,
    grade: basis != null ? letterGrade(basis) : null,
    needs, hasEvidence,
  };
}

/** Total for given register/final scores (used by the "what if" examples and tests). */
export function totalScore(regMid: number, regEnd: number, final: number, s: GradingScheme = AITU_GRADING): number {
  return s.regMidWeight * regMid + s.regEndWeight * regEnd + s.finalWeight * final;
}
