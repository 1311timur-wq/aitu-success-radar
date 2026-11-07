// AITU grading rules: registers, admission, Total, FX/F, GPA, scholarship and "what is needed".
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeStanding, computeRisk, letterGrade, registerStatus, totalScore, neededOnRemaining, DEFAULT_DEMO_POLICY,
  type AssessmentEntry, type AttendanceEntry, type GradingItem,
} from '../src/index.ts';

const close = (a: number | null | undefined, b: number, eps = 1e-6) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} != ${b}`);
const g = (id: string, period: GradingItem['period'], weight: number, percent: number | null, state: GradingItem['state'] = percent == null ? 'pending' : 'graded'): GradingItem =>
  ({ id, period, weight, state, percent: state === 'graded' ? percent : null });

// Syllabus example: 20 % A1, 20 % A2, 20 % Quiz, 40 % Midterm exam (same shape for Endterm).
const mid = (a1: number | null, a2: number | null, q: number | null, ex: number | null) =>
  [g('a1', 'midterm', 0.2, a1), g('a2', 'midterm', 0.2, a2), g('q1', 'midterm', 0.2, q), g('mid', 'midterm', 0.4, ex)];
const end = (a3: number | null, a4: number | null, q: number | null, ex: number | null) =>
  [g('a3', 'endterm', 0.2, a3), g('a4', 'endterm', 0.2, a4), g('q2', 'endterm', 0.2, q), g('end', 'endterm', 0.4, ex)];
const fin = (f: number | null) => [g('final', 'final', 1, f)];

test('Total = 0.3·RegMid + 0.3·RegEnd + 0.4·Final (guide example 80 / 86 / 70 → 77.8)', () => {
  close(totalScore(80, 86, 70), 77.8);
  const s = computeStanding([...mid(80, 80, 80, 80), ...end(86, 86, 86, 86), ...fin(70)]);
  close(s.regMid.value, 80); close(s.regEnd.value, 86); close(s.regTerm.value, 83); close(s.total.value, 77.8);
  assert.equal(s.admission, 'admitted');
  assert.equal(s.outcome, 'pass');
  assert.equal(s.grade?.letter, 'B-');
});

test('register = weighted sum per syllabus; missing counts as 0, excused is re-weighted', () => {
  close(registerStatus(mid(50, 100, 80, 70), 'midterm').value, 0.2 * 50 + 0.2 * 100 + 0.2 * 80 + 0.4 * 70);
  close(registerStatus([...mid(100, null, 100, 100).slice(0, 1), g('a2', 'midterm', 0.2, null, 'missing'), ...mid(100, null, 100, 100).slice(2)], 'midterm').value, 80);
  const excused = registerStatus([g('a1', 'midterm', 0.2, null, 'excused'), g('a2', 'midterm', 0.2, 50), g('q1', 'midterm', 0.2, 50), g('mid', 'midterm', 0.4, 50)], 'midterm');
  close(excused.value, 50);
});

test('admission: RegMid ≥ 25, RegEnd ≥ 25, RegTerm ≥ 50 — otherwise F', () => {
  assert.equal(computeStanding([...mid(60, 60, 60, 60), ...end(40, 40, 40, 40)]).admission, 'admitted');      // 50 exactly
  assert.equal(computeStanding([...mid(80, 80, 80, 80), ...end(20, 20, 20, 20)]).admission, 'not-admitted');  // RegEnd 20 < 25
  const s = computeStanding([...mid(50, 50, 50, 50), ...end(45, 45, 45, 45)]);                                  // RegTerm 47.5
  assert.equal(s.admission, 'not-admitted');
  assert.equal(s.outcome, 'F');
});

test('final outcome: < 25 F, 25–49 FX, ≥ 50 pass', () => {
  const base = [...mid(80, 80, 80, 80), ...end(80, 80, 80, 80)];
  assert.equal(computeStanding([...base, ...fin(20)]).outcome, 'F');
  assert.equal(computeStanding([...base, ...fin(40)]).outcome, 'FX');
  assert.equal(computeStanding([...base, ...fin(50)]).outcome, 'pass');
});

test('what is needed: RegEnd for admission and the final for 50 / 70 / 80', () => {
  const afterMid = computeStanding([...mid(0, 0, 55, 50), ...end(60, null, null, null)]); // RegMid 31, A3 = 60
  close(afterMid.regMid.value, 31);
  close(afterMid.needs.regEndForAdmission, 69);                 // 2·50 − 31
  close(afterMid.needs.remainingForAdmission, (69 - 12) / 0.8); // 71.25 % on the remaining 80 %
  assert.equal(afterMid.admission, 'at-risk');

  const beforeFinal = computeStanding([...mid(80, 80, 80, 80), ...end(70, 70, 70, 70)]);
  close(beforeFinal.needs.finalToPass, 50);                     // the final itself must be ≥ 50
  close(beforeFinal.needs.finalForScholarship, (70 - 24 - 21) / 0.4); // 62.5
  close(beforeFinal.needs.finalForRecommended, (80 - 24 - 21) / 0.4); // 87.5
});

test('scholarship: ≥ 70 % safe, below = at risk, unreachable = lost', () => {
  assert.equal(computeStanding([...mid(90, 90, 90, 90), ...end(88, null, null, null)]).scholarship, 'safe');
  assert.equal(computeStanding([...mid(60, 60, 60, 60), ...end(65, null, null, null)]).scholarship, 'at-risk');
  assert.equal(computeStanding([...mid(30, 30, 30, 30), ...end(30, 30, 30, 30)]).scholarship, 'lost');
});

test('GPA scale: 70 % = 2.33, 80 % = 3.0, 95 % = 4.0', () => {
  assert.deepEqual(letterGrade(70), { letter: 'C+', gpa: 2.33 });
  assert.deepEqual(letterGrade(80), { letter: 'B', gpa: 3.0 });
  assert.deepEqual(letterGrade(95), { letter: 'A', gpa: 4.0 });
  assert.equal(letterGrade(49.9).letter, 'F');
});

test('pending never counts as 0; empty register cannot fail anyone', () => {
  const s = computeStanding(mid(90, null, null, null));
  close(s.regMid.current, 90);
  assert.equal(s.regMid.complete, false);
  assert.equal(s.admission, 'on-track');
  assert.equal(neededOnRemaining(registerStatus(mid(90, 90, 90, 90), 'midterm'), 50), null);
});

test('risk-aitu-v1: admission risk alone is HIGH with concrete actions; scholarship risk is MEDIUM', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  const att: AttendanceEntry[] = ['1', '2', '3', '4'].map((id) => ({ id, sessionStatus: 'held', publication: 'published', status: 'present' }));
  const entry = (id: string, period: 'midterm' | 'endterm', weight: number, pts: number | null, state: AssessmentEntry['state'] = 'graded'): AssessmentEntry =>
    ({ id, at: now - 1000, publication: 'published', state, pointsEarned: pts, maxPoints: 100, category: 'quiz', period, weight });
  const failing = computeRisk({ now, attendance: att, policy: DEFAULT_DEMO_POLICY, assessments: [
    entry('a1', 'midterm', 0.2, null, 'missing'), entry('a2', 'midterm', 0.2, null, 'missing'), entry('q1', 'midterm', 0.2, 55), entry('mid', 'midterm', 0.4, 50),
    entry('a3', 'endterm', 0.2, 60), entry('a4', 'endterm', 0.2, null, 'pending'), entry('q2', 'endterm', 0.2, null, 'pending'), entry('end', 'endterm', 0.4, null, 'pending'),
  ] });
  assert.equal(failing.level, 'high');
  assert.deepEqual(failing.reasons.map((r) => r.code), ['ADMISSION_RISK']);
  assert.ok(failing.actions.includes('RAISE_REGISTER') && failing.actions.length >= 2);
  close(failing.standing?.needs.regEndForAdmission, 69);

  const average = computeRisk({ now, attendance: att, policy: DEFAULT_DEMO_POLICY, assessments: [
    entry('a1', 'midterm', 0.2, 65), entry('a2', 'midterm', 0.2, 60), entry('q1', 'midterm', 0.2, 70), entry('mid', 'midterm', 0.4, 66),
  ] });
  assert.equal(average.level, 'medium');
  assert.deepEqual(average.reasons.map((r) => r.code), ['SCHOLARSHIP_RISK']);
});

import { ROOMS, searchRooms, findRoom, normaliseRoomQuery } from '../src/index.ts';
test('rooms: 3 blocks × floors 2–3 × x20–x40; prefix and Cyrillic search', () => {
  assert.equal(ROOMS.length, 3 * 2 * 21);
  assert.equal(normaliseRoomQuery(' с1.3.2 '), 'C1.3.2');
  const b3f2 = searchRooms('С1.3.2');
  assert.ok(b3f2.length >= 21 && b3f2.slice(0, 21).every((r) => r.block === 3 && r.floor === 2));
  assert.ok(searchRooms('C1.1').every((r) => r.code.startsWith('C1.1')));
  const by237 = searchRooms('237');
  assert.ok(by237.length === 3 && by237.every((r) => r.number === 237));
  assert.equal(findRoom('c1.3.240')?.block, 3);
  assert.equal(searchRooms('C1.2.3', 'K')[0]?.kind, 'K');
  assert.ok(!ROOMS.some((r) => r.number < 220), 'rooms start at x20');
});
