// Ported from architecture v1 (DOM-01..DOM-15) + new cases. Run: npm --workspace @aitu/domain test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAssessmentMetrics, calculateAttendance, calculateTaskCompletion, computeRisk, shouldApplyProjection,
  suggestedAttendancePoints, normalizePolicy, DEFAULT_DEMO_POLICY,
  type AssessmentEntry, type AttendanceEntry, type AttendanceStatus, type TaskEntry,
} from '../src/index.ts';

const now = Date.parse('2026-10-25T12:00:00.000Z');
const session = (status: AttendanceStatus, id: string, o: Partial<AttendanceEntry> = {}): AttendanceEntry =>
  ({ id, sessionStatus: 'held', publication: 'published', status, ...o });
const grade = (pointsEarned: number | null, id: string, o: Partial<AssessmentEntry> = {}): AssessmentEntry =>
  ({ id, at: Date.parse(`2026-10-${id.padStart(2, '0')}T10:00:00Z`), publication: 'published', state: 'graded', pointsEarned, maxPoints: 10, category: 'quiz', ...o });
const task = (id: string, state: TaskEntry['state'], due = '2026-10-20T11:00:00Z'): TaskEntry =>
  ({ id, publication: 'published', state, dueAt: Date.parse(due) });

test('DOM-01 unknown with no evidence; an ungraded student is not "low"', () => {
  assert.equal(computeRisk({ now }).level, 'unknown');
});

test('DOM-02 attendance ignores cancelled/unmarked/excused/draft and credits lateness', () => {
  const r = calculateAttendance([
    session('present', 's1'), session('late', 's2'), session('absent', 's3'), session('excused', 's4'), session('unmarked', 's5'),
    session('absent', 's6', { sessionStatus: 'cancelled' }), session('absent', 's7', { publication: 'draft' }),
  ]);
  assert.equal(r.eligibleCount, 3);
  assert.equal(r.percent, 50);
  assert.equal(r.excusedCount, 1);
  assert.equal(r.unmarkedCount, 1);
});

test('DOM-03 two independent negative signals => high + >= 2 actions', () => {
  const r = computeRisk({ now, attendance: [session('present', '1'), session('absent', '2'), session('absent', '3')], tasks: [task('t1', 'missing'), task('t2', 'missing')] });
  assert.equal(r.level, 'high');
  assert.deepEqual(r.reasons.map((x) => x.code), ['ATTENDANCE_LOW', 'OVERDUE_WORK']);
  assert.ok(r.actions.length >= 2);
});

test('DOM-04 exactly one negative signal => medium', () => {
  assert.equal(computeRisk({ now, attendance: [session('absent', '1'), session('absent', '2'), session('present', '3')] }).level, 'medium');
});

test('DOM-05 low only with >= 2 evidence channels', () => {
  const r = computeRisk({ now, attendance: [session('present', '1'), session('present', '2'), session('present', '3')], assessments: [grade(9, '1'), grade(8, '2')] });
  assert.equal(r.level, 'low');
  assert.equal(r.metrics.evidenceChannels, 2);
});

test('DOM-06 exactly 80% attendance is not a warning', () => {
  const events = ['1', '2', '3', '4'].map((i) => session('present', i)).concat(session('absent', '5'));
  const r = computeRisk({ now, attendance: events, assessments: [grade(8, '1'), grade(7, '2')] });
  assert.equal(r.metrics.attendancePercent, 80);
  assert.equal(r.level, 'low');
});

test('DOM-07 graded zero is real, pending is not zero', () => {
  const r = calculateAssessmentMetrics([grade(0, '1'), grade(null, '2', { state: 'pending' }), grade(10, '3')]);
  assert.equal(r.gradedCount, 2);
  assert.equal(r.observedPercent, 50);
  assert.equal(r.recentGradePercent, 50);
});

test('DOM-08 missing with a future deadline is not overdue', () => {
  assert.equal(calculateTaskCompletion([task('t3', 'missing', '2026-11-01T00:00:00Z')], now).overdueCount, 0);
});

test('DOM-09 draft grades cannot affect risk', () => {
  assert.equal(computeRisk({ now, assessments: [grade(0, '1', { publication: 'draft' }), grade(0, '2', { publication: 'draft' })] }).level, 'unknown');
});

test('DOM-10 invalid grades are rejected, never clamped', () => {
  assert.throws(() => calculateAssessmentMetrics([grade(11, '1')]), RangeError);
  assert.throws(() => calculateAssessmentMetrics([grade(-1, '1')]), RangeError);
  assert.throws(() => calculateAssessmentMetrics([grade(0, '1', { state: 'pending' })]), TypeError);
});

test('DOM-11 stale revisions cannot replace a newer projection', () => {
  assert.equal(shouldApplyProjection({ sourceRevision: 7 }, 6), false);
  assert.equal(shouldApplyProjection({ sourceRevision: 7 }, 7), true);
  assert.equal(shouldApplyProjection({ sourceRevision: 7 }, 8), true);
});

test('DOM-12 recent window = last three graded results', () => {
  const r = calculateAssessmentMetrics([grade(0, '1'), grade(10, '2'), grade(10, '3'), grade(10, '4')]);
  assert.equal(r.recentGradeCount, 3);
  assert.equal(r.recentGradePercent, 100);
});

test('DOM-13 submitted but ungraded work is not missing', () => {
  const t = calculateTaskCompletion([task('t1', 'submitted')], now);
  assert.equal(t.overdueCount, 0);
  assert.equal(t.completionPercent, 100);
  assert.equal(computeRisk({ now, tasks: [task('t1', 'submitted')] }).level, 'unknown');
});

test('DOM-14 pending task after the deadline is not inferred missing', () => {
  const t = calculateTaskCompletion([task('t1', 'pending')], now);
  assert.equal(t.overdueCount, 0);
  assert.equal(t.completionPercent, null);
});

test('DOM-15 missing grades without missing submissions give no overdue signal', () => {
  const r = computeRisk({ now, assessments: [grade(null, '1', { state: 'missing' }), grade(null, '2', { state: 'missing' })] });
  assert.equal(r.metrics.overdueCount, 0);
  assert.equal(r.level, 'unknown');
});

test('NEW high with a single reason still gets >= 2 actions (fallback)', () => {
  const policy = normalizePolicy({ overdueCountAtLeast: 1 });
  const r = computeRisk({ now, policy, tasks: [task('t1', 'missing')], attendance: [session('absent', '1'), session('absent', '2'), session('absent', '3')] });
  assert.equal(r.level, 'high');
  assert.ok(r.actions.length >= 2);
});

test('NEW invalid policy is rejected', () => {
  assert.throws(() => normalizePolicy({ lateAttendanceCredit: 2 }), TypeError);
  assert.throws(() => normalizePolicy({ recentGradeWindow: 1, recentGradeMinCount: 2 }), TypeError);
});

test('NEW suggested LMS points per status (DEMO: P=2, L=1, E=1, A=0 on a 2-point session)', () => {
  assert.equal(suggestedAttendancePoints('present', 2), 2);
  assert.equal(suggestedAttendancePoints('late', 2), 1);
  assert.equal(suggestedAttendancePoints('excused', 2), 1);
  assert.equal(suggestedAttendancePoints('absent', 2), 0);
  assert.equal(suggestedAttendancePoints('unmarked', 2), null);
  assert.equal(DEFAULT_DEMO_POLICY.version, 'risk-aitu-v1');
});
