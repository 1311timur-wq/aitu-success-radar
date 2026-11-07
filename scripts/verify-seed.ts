/**
 * Offline check of the demo dataset (no Firebase needed):
 *  1. every canonical document has exactly the fields Security Rules require;
 *  2. running the shared Risk Engine on it gives the intended scenarios.
 * Run: npm run verify:seed
 */
import assert from 'node:assert/strict';
import {
  buildCourseHealth, buildRosterRisk, normalizePolicy,
  type AssessmentDTO, type AssessmentRecordDTO, type AttendanceRecordDTO, type OfferingDTO, type SessionDTO,
} from '../packages/domain/src/index.ts';
import { buildSeed, SeedTimestamp, ADMINS, COURSES, GROUPS, STUDENTS, offeringIdOf } from './seed-data.ts';
import { COURSE_CODE_RE, GROUP_RE, JOIN_CODE_RE } from '../packages/domain/src/index.ts';

const RULE_KEYS: Record<string, string[]> = {
  sessions: ['offeringId', 'type', 'topic', 'room', 'startsAt', 'durationMinutes', 'status', 'maxPoints', 'attendancePublication', 'publishedAt', 'revision', 'createdBy', 'updatedBy', 'updatedAt'],
  attendanceRecords: ['offeringId', 'sessionId', 'studentUid', 'status', 'points', 'remark', 'publication', 'revision', 'updatedBy', 'updatedAt', 'correction'],
  assessments: ['offeringId', 'title', 'category', 'maxPoints', 'dueAt', 'countsForOverdue', 'period', 'weight', 'gradesPublication', 'publishedAt', 'revision', 'createdBy', 'updatedBy', 'updatedAt'],
  assessmentRecords: ['offeringId', 'assessmentId', 'studentUid', 'submission', 'gradeState', 'points', 'maxPoints', 'feedback', 'publication', 'revision', 'updatedBy', 'updatedAt', 'correction'],
  audit: ['type', 'actorUid', 'at', 'targetPath', 'reason', 'details'],
  joinCodes: ['offeringId', 'courseCode', 'title', 'groupLabel', 'termLabel', 'active', 'createdBy', 'createdAt'],
};
const OFFERING_ALLOWED = ['courseCode', 'title', 'termId', 'termLabel', 'groupLabel', 'status', 'staffUids', 'studentUids', 'policy', 'policyVersion', 'joinCode', 'createdAt', 'createdBy', 'updatedAt'];
const SPARK_DAILY_WRITES = 20_000;

const now = process.env.SEED_NOW ? Date.parse(process.env.SEED_NOW) : Date.now();
const { docs } = buildSeed(now);
const plain = (v: unknown): unknown => v instanceof SeedTimestamp ? v.ms
  : Array.isArray(v) ? v.map(plain)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v;

type Any = Record<string, any>;
const byCollection = new Map<string, { id: string; parent: string; data: Any }[]>();
for (const d of docs) {
  const parts = d.path.split('/');
  const col = parts.length >= 4 ? parts[2]! : parts[0]!;
  const list = byCollection.get(col) ?? [];
  list.push({ id: parts.at(-1)!, parent: parts.length >= 4 ? parts[1]! : '', data: plain(d.data) as Any });
  byCollection.set(col, list);
}

// 1. field contract with the rules
let checked = 0;
for (const [col, keys] of Object.entries(RULE_KEYS)) {
  for (const d of byCollection.get(col) ?? []) {
    assert.deepEqual(Object.keys(d.data).sort(), [...keys].sort(), `${col}/${d.id} fields differ from rules`);
    if (col === 'attendanceRecords') assert.equal(d.id, `${d.data.sessionId}_${d.data.studentUid}`);
    if (col === 'assessmentRecords') {
      assert.equal(d.id, `${d.data.assessmentId}_${d.data.studentUid}`);
      assert.ok(d.data.gradeState === 'graded' ? typeof d.data.points === 'number' && d.data.points <= d.data.maxPoints : d.data.points === null, `${d.id} points/gradeState`);
    }
    checked++;
  }
}

// 1b. v2 contract: offerings, join codes (each course has exactly one active code pointing back), enrollments, admin
const codes = new Map((byCollection.get('joinCodes') ?? []).map((d) => [d.id, d.data]));
for (const o of byCollection.get('offerings') ?? []) {
  assert.ok(Object.keys(o.data).every((k) => OFFERING_ALLOWED.includes(k)), `offerings/${o.id}: unexpected field`);
  assert.match(o.data.courseCode, COURSE_CODE_RE); assert.match(o.data.groupLabel, GROUP_RE); assert.match(o.data.joinCode, JOIN_CODE_RE);
  const jc = codes.get(o.data.joinCode);
  assert.ok(jc && jc.offeringId === o.id && jc.active === true, `offerings/${o.id}: join code missing or not pointing back`);
  assert.equal(jc.title, o.data.title); assert.equal(jc.groupLabel, o.data.groupLabel); assert.equal(jc.termLabel, o.data.termLabel);
}
assert.equal(codes.size, (byCollection.get('offerings') ?? []).length, 'one code per course, codes unique');
for (const e of byCollection.get('enrollments') ?? []) assert.equal(e.data.via, 'seed');
const adminDoc = (byCollection.get('users') ?? []).find((u) => u.id === ADMINS[0]!.uid);
assert.equal(adminDoc?.data.role, 'admin', 'admin profile exists');
console.log(`Join codes OK: ${codes.size} courses, e.g. ${[...codes.entries()].slice(0, 2).map(([c, d]) => `${d.courseCode} ${d.groupLabel} → ${c.slice(0, 3)}-${c.slice(3)}`).join(', ')}.`);

// 2. scenarios
const expected: Record<string, string> = { MATH101: 'high', SE101: 'low', MATH102: 'medium', CSE104: 'medium', ENG101: 'unknown' };
const expectedReasons: Record<string, string[]> = { MATH101: ['ATTENDANCE_LOW', 'OVERDUE_WORK', 'ADMISSION_RISK'], MATH102: ['ATTENDANCE_LOW'], CSE104: ['SCHOLARSHIP_RISK'], SE101: [], ENG101: [] };
const me = STUDENTS[0]!.uid;
console.log(`Field contract OK for ${checked} documents (${docs.length} total; Spark allows ${SPARK_DAILY_WRITES} writes/day).`);
assert.ok(docs.length < SPARK_DAILY_WRITES / 2.5, 'seed must stay well below the Spark daily write quota');
assert.equal(new Set(docs.map((d) => d.path)).size, docs.length, 'duplicate document paths');
assert.equal(new Set(STUDENTS.map((s) => s.displayName)).size, STUDENTS.length, 'duplicate student names');

const groupTotals: Record<string, number> = { high: 0, medium: 0, low: 0, unknown: 0 };
for (const g of GROUPS) {
  console.log(`\n${g.label}:`);
  for (const c of COURSES) {
    const id = offeringIdOf(c.code, g.id);
    const pick = (col: string) => (byCollection.get(col) ?? []).filter((d) => d.parent === id);
    const o = (byCollection.get('offerings') ?? []).find((d) => d.id === id)!.data;
    const offering: OfferingDTO = { id, ...o, policy: normalizePolicy(o.policy) } as OfferingDTO;
    const sessions = pick('sessions').map((d) => ({ id: d.id, ...d.data }) as SessionDTO);
    const assessments = pick('assessments').map((d) => ({ id: d.id, ...d.data }) as AssessmentDTO);
    const attendance = pick('attendanceRecords').map((d) => ({ id: d.id, ...d.data }) as AttendanceRecordDTO);
    const grades = pick('assessmentRecords').map((d) => ({ id: d.id, ...d.data }) as AssessmentRecordDTO);
    const roster = buildRosterRisk({ offering, sessions, assessments, now, studentUids: offering.studentUids, attendanceRecords: attendance, assessmentRecords: grades });
    for (const r of roster) { groupTotals[r.health.risk.level]!++; assert.equal(r.health.skippedRecords, 0, `${id}/${r.studentUid} has inconsistent records`); }
    const dist = ['high', 'medium', 'low', 'unknown'].map((l) => `${l[0]!.toUpperCase()}${roster.filter((r) => r.health.risk.level === l).length}`).join(' ');
    let line = `  ${c.title.padEnd(21)} group ${dist}`;
    if (g.id === 'se2419') {
      const h = buildCourseHealth({
        offering, sessions, assessments, now,
        attendanceRecords: attendance.filter((r) => r.studentUid === me), assessmentRecords: grades.filter((r) => r.studentUid === me),
      });
      const m = h.risk.metrics;
      const st = h.risk.standing;
      line += `   Арман: ${h.risk.level.toUpperCase().padEnd(8)} att=${m.attendancePercent?.toFixed(0) ?? '—'}% RegMid=${st?.regMid.value?.toFixed(1) ?? '—'} RegEnd~${st?.regEnd.current?.toFixed(1) ?? '—'} adm=${st?.admission ?? '—'} sch=${st?.scholarship ?? '—'} need=${st?.needs.regEndForAdmission?.toFixed(0) ?? '—'}/${st?.needs.remainingForAdmission?.toFixed(1) ?? '—'}% [${h.risk.reasons.map((r) => r.code).join(', ')}]`;
      assert.equal(h.risk.level, expected[c.code], `${c.title}: expected ${expected[c.code]} for the main demo student`);
      assert.deepEqual(h.risk.reasons.map((r) => r.code), expectedReasons[c.code], `${c.title}: reasons`);
      if (h.risk.level === 'high') assert.ok(h.risk.actions.length >= 2, 'SC2: High has >= 2 actions');
    }
    console.log(line);
  }
}
console.log(`\nAll offerings: ${JSON.stringify(groupTotals)}`);
// The demo must show every state, and most students should be fine (a realistic, not alarmist, picture).
assert.ok(groupTotals.high! > 0 && groupTotals.medium! > 0 && groupTotals.low! > 0 && groupTotals.unknown! > 0, 'all four states present');
assert.ok(groupTotals.low! > groupTotals.high! + groupTotals.medium!, 'most course-students are on track');
console.log('All seed scenarios OK.');
