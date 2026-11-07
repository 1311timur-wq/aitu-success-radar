import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCourseHealth, buildRosterRisk, summarizeRadar, DEFAULT_DEMO_POLICY, attendanceRecordId, assessmentRecordId,
  zonedWallTimeToUtc, utcToZonedWallTime, isSameZonedDay,
  type AssessmentDTO, type AssessmentRecordDTO, type AttendanceRecordDTO, type AttendanceStatus, type OfferingDTO, type SessionDTO,
} from '../src/index.ts';

const DAY = 86_400_000;
const now = Date.parse('2026-10-25T12:00:00Z');
const offering: OfferingDTO = {
  id: 'off-math', courseCode: 'MATH101', title: 'Calculus 1', termId: 't', termLabel: 'Fall 2026', groupLabel: 'SE-2419',
  status: 'active', staffUids: ['teacher'], studentUids: ['s1', 's2'], policy: { ...DEFAULT_DEMO_POLICY },
};
const sess = (i: number, status: SessionDTO['status'] = 'held'): SessionDTO => ({
  id: `ses${i}`, offeringId: offering.id, type: 'lecture', topic: null, room: null, startsAt: now - (10 - i) * DAY,
  durationMinutes: 50, status, maxPoints: 2, attendancePublication: 'published', publishedAt: now, revision: 1, updatedAt: now,
});
const att = (i: number, studentUid: string, status: AttendanceStatus, publication: 'draft' | 'published' = 'published'): AttendanceRecordDTO => ({
  id: attendanceRecordId(`ses${i}`, studentUid), offeringId: offering.id, sessionId: `ses${i}`, studentUid, status,
  points: status === 'unmarked' ? null : status === 'present' ? 2 : status === 'absent' ? 0 : 1,
  remark: '', publication, revision: 1, updatedBy: 'teacher', updatedAt: now - i, correction: null,
});
const asm = (id: string, dueOffsetDays: number, countsForOverdue = true): AssessmentDTO => ({
  id, offeringId: offering.id, title: id, category: 'quiz', maxPoints: 10, dueAt: now + dueOffsetDays * DAY, countsForOverdue, period: null, weight: null,
  gradesPublication: 'published', publishedAt: now, revision: 1, updatedAt: now,
});
const rec = (assessmentId: string, studentUid: string, o: Partial<AssessmentRecordDTO>): AssessmentRecordDTO => ({
  id: assessmentRecordId(assessmentId, studentUid), offeringId: offering.id, assessmentId, studentUid,
  submission: 'submitted', gradeState: 'graded', points: 8, maxPoints: 10, feedback: '', publication: 'published',
  revision: 1, updatedBy: 'teacher', updatedAt: now, correction: null, ...o,
});

const sessions = [1, 2, 3, 4].map((i) => sess(i)).concat(sess(5, 'cancelled'));
const assessments = [asm('q1', -9), asm('q2', -5), asm('hw3', -2), asm('hw4', 3)];

test('high: low attendance + two published missing submissions; drafts ignored', () => {
  const h = buildCourseHealth({
    offering, sessions, assessments, now,
    attendanceRecords: [att(1, 's1', 'present'), att(2, 's1', 'absent'), att(3, 's1', 'absent'), att(4, 's1', 'absent', 'draft'), att(5, 's1', 'absent')],
    assessmentRecords: [
      rec('q1', 's1', { points: 7 }),
      rec('q2', 's1', { submission: 'missing', gradeState: 'missing', points: null }),
      rec('hw3', 's1', { submission: 'missing', gradeState: 'pending', points: null }),
    ],
  });
  assert.equal(h.risk.level, 'high');
  assert.deepEqual(h.risk.reasons.map((r) => r.code), ['ATTENDANCE_LOW', 'OVERDUE_WORK']);
  assert.equal(h.attendance.timeline.length, 3, 'draft and cancelled-session records are not shown');
  assert.equal(h.attendance.pointsEarned, 2);
  assert.equal(h.attendance.pointsPossible, 6);
  assert.deepEqual(h.tasks.overdue.map((t) => t.assessmentId), ['q2', 'hw3']);
  assert.deepEqual(h.tasks.upcoming.map((t) => t.assessmentId), ['hw4'], 'future deadline is shown even without a record');
  assert.equal(h.grades.find((g) => g.assessmentId === 'hw3')?.percent, null, 'pending is never 0%');
});

test('inconsistent records are skipped and counted, not thrown', () => {
  const h = buildCourseHealth({
    offering, sessions, assessments, now,
    attendanceRecords: [att(1, 's1', 'present'), { ...att(2, 's1', 'present'), points: 99 }, { ...att(3, 's1', 'present'), sessionId: 'ghost' }],
    assessmentRecords: [rec('q1', 's1', { maxPoints: 20 })],
  });
  assert.equal(h.skippedRecords, 3);
  assert.equal(h.risk.level, 'unknown');
});

test('nothing published => unknown with dataAsOf null', () => {
  const h = buildCourseHealth({ offering, sessions, assessments, now, attendanceRecords: [att(1, 's1', 'present', 'draft')], assessmentRecords: [] });
  assert.equal(h.risk.level, 'unknown');
  assert.equal(h.dataAsOf, null);
});

test('roster risk computes each student independently; summary orders by attention', () => {
  const rows = buildRosterRisk({
    offering, sessions, assessments, now, studentUids: ['s1', 's2'],
    attendanceRecords: [1, 2, 3].map((i) => att(i, 's2', 'present')).concat([1, 2, 3].map((i) => att(i, 's1', 'absent'))),
    assessmentRecords: [rec('q1', 's2', {}), rec('q2', 's2', {})],
  });
  assert.equal(rows.find((r) => r.studentUid === 's1')?.health.risk.level, 'medium');
  assert.equal(rows.find((r) => r.studentUid === 's2')?.health.risk.level, 'low');
  const summary = summarizeRadar(rows.map((r) => ({ ...r.health, title: r.studentUid })));
  assert.equal(summary.ordered[0]?.risk.level, 'medium');
  assert.deepEqual(summary.counts, { high: 0, medium: 1, low: 1, unknown: 0 });
  assert.equal(summary.focus?.title, 's1');
});

test('time: Almaty wall time <-> UTC (UTC+5, no DST)', () => {
  const ms = zonedWallTimeToUtc('2026-10-26', '10:00');
  assert.equal(new Date(ms).toISOString(), '2026-10-26T05:00:00.000Z');
  assert.deepEqual(utcToZonedWallTime(ms), { date: '2026-10-26', time: '10:00' });
  assert.equal(isSameZonedDay(Date.parse('2026-10-25T19:30:00Z'), Date.parse('2026-10-26T03:00:00Z')), true, '00:30 and 08:00 local are the same day');
  assert.throws(() => zonedWallTimeToUtc('26.10.2026', '10:00'), RangeError);
});
