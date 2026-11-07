// v1.0: registration validation, join codes, QR check-in, weekly plan.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFullName, validateEmail, checkPassword, validateGroup, normalizeGroup, validateStudentNumber, validateRegistration,
  programFromGroup, generateTempPassword, validateCourseCode,
  normalizeJoinCode, isJoinCode, formatJoinCode, generateJoinCode, JOIN_CODE_RE,
  generateCheckinCode, decodeCheckinPayload, encodeCheckinPayload, isCheckinWindow, suggestedStatusForCheckin, CHECKIN_CODE_RE,
  buildCourseHealth, buildWeeklyPlan, isoWeekId, startOfWeek, prunePlanTicks, DEFAULT_DEMO_POLICY, attendanceRecordId, assessmentRecordId,
  type AssessmentDTO, type AssessmentRecordDTO, type AttendanceRecordDTO, type OfferingDTO, type SessionDTO,
} from '../src/index.ts';

const DAY = 86_400_000;
const MIN = 60_000;

// ---------------------------------------------------------------- validation
test('full name: two words, letters of any alphabet, sane length', () => {
  assert.equal(validateFullName('Арман Серикбаев'), null);
  assert.equal(validateFullName('  Әсем   Нұрланқызы '), null, 'Kazakh letters and extra spaces are fine');
  assert.equal(validateFullName("Aidan O'Connor-Smith"), null);
  assert.equal(validateFullName(''), 'required');
  assert.equal(validateFullName('Арман'), 'nameTwoWords');
  assert.equal(validateFullName('Ar'), 'nameShort');
  assert.equal(validateFullName('Арман <script>'), 'nameChars');
  assert.equal(validateFullName('A'.repeat(81) + ' B'), 'nameLong');
});

test('email: format and corporate domain', () => {
  assert.equal(validateEmail('241913@astanait.edu.kz'), null);
  assert.equal(validateEmail(' Student01@DEMO.aitu.kz '), null, 'trimmed and lower-cased');
  assert.equal(validateEmail('me@gmail.com'), 'emailDomain');
  assert.equal(validateEmail('me@gmail.com', null), null, 'teachers created by an admin: any domain');
  assert.equal(validateEmail('not-an-email'), 'emailFormat');
  assert.equal(validateEmail(''), 'required');
});

test('password: length, letters + digits, not the e-mail name, strength score', () => {
  assert.equal(checkPassword('short1').code, 'passwordShort');
  assert.equal(checkPassword('onlyletters').code, 'passwordDigits');
  assert.equal(checkPassword('12345678').code, 'passwordLetters');
  assert.equal(checkPassword('arman2024x', 'arman@astanait.edu.kz').code, 'passwordEmail');
  const strong = checkPassword('Radar-Calculus-2026', 'x@astanait.edu.kz');
  assert.equal(strong.code, null);
  assert.ok(strong.score >= 3);
  assert.ok(checkPassword('abcdefg1').score < strong.score);
});

test('group, student number, course code', () => {
  assert.equal(validateGroup('SE-2419'), null);
  assert.equal(normalizeGroup(' se–2419 '), 'SE-2419', 'en dash and lower case are normalised');
  assert.equal(normalizeGroup('СЕ-2419'), 'CE-2419', 'Cyrillic look-alikes become Latin');
  assert.equal(validateGroup('SE2419'), 'groupFormat');
  assert.equal(validateStudentNumber('241913'), null);
  assert.equal(validateStudentNumber('24a913'), 'studentNumberFormat');
  assert.equal(validateCourseCode('math101'), null);
  assert.equal(validateCourseCode('MATH-101'), 'courseCodeFormat');
  assert.equal(programFromGroup('SE-2419'), 'se');
  assert.equal(programFromGroup('ZZ-2419'), null);
});

test('registration form: every field validated, valid form has no errors', () => {
  const ok = { fullName: 'Дана Касымова', email: 'dana@astanait.edu.kz', password: 'Calc-2026-ok', passwordRepeat: 'Calc-2026-ok',
    program: 'se', groupLabel: 'SE-2419', studentNumber: '241999', consent: true };
  assert.deepEqual(validateRegistration(ok), {});
  const bad = validateRegistration({ ...ok, passwordRepeat: 'other', consent: false, program: 'x', email: 'dana@mail.ru' });
  assert.deepEqual(Object.keys(bad).sort(), ['consent', 'email', 'passwordRepeat', 'program']);
});

test('temporary password always passes the password policy', () => {
  let seed = 1;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 200; i++) assert.equal(checkPassword(generateTempPassword(rand), 'teacher@astanait.edu.kz').code, null);
});

// ---------------------------------------------------------------- join codes
test('join codes: no look-alike characters, tolerant input, formatting', () => {
  for (let i = 0; i < 500; i++) assert.match(generateJoinCode(), JOIN_CODE_RE);
  assert.equal(normalizeJoinCode('k7q-4mx'), 'K7Q4MX');
  assert.equal(normalizeJoinCode(' K7Q 4MX '), 'K7Q4MX');
  assert.equal(normalizeJoinCode('К7Q-4МХ'), 'K7Q4MX', 'Cyrillic К, М, Х typed on a Russian layout');
  assert.equal(isJoinCode('K7Q-4MX'), true);
  assert.equal(isJoinCode('K0Q-4MX'), false, '0 is excluded (looks like O)');
  assert.equal(formatJoinCode('k7q4mx'), 'K7Q-4MX');
});

// ---------------------------------------------------------------- check-in
test('check-in payload: round trip and rejection of garbage', () => {
  const p = encodeCheckinPayload('demo-fall26-math101-se2419', 'w8-1', '048213');
  assert.deepEqual(decodeCheckinPayload(p), { offeringId: 'demo-fall26-math101-se2419', sessionId: 'w8-1', code: '048213' });
  assert.equal(decodeCheckinPayload('a~b~12'), null, 'code must be 6 digits');
  assert.equal(decodeCheckinPayload('../x~b~123456'), null, 'no path tricks in ids');
  assert.equal(decodeCheckinPayload(null), null);
  for (let i = 0; i < 200; i++) assert.match(generateCheckinCode(), CHECKIN_CODE_RE);
});

test('check-in window and suggested status', () => {
  const start = Date.parse('2026-10-26T05:00:00Z');
  const s = { startsAt: start, durationMinutes: 50, status: 'scheduled' };
  assert.equal(isCheckinWindow(s, start - 20 * MIN), false);
  assert.equal(isCheckinWindow(s, start - 10 * MIN), true);
  assert.equal(isCheckinWindow(s, start + 60 * MIN), true);
  assert.equal(isCheckinWindow(s, start + 70 * MIN), false);
  assert.equal(isCheckinWindow({ ...s, status: 'cancelled' }, start), false);
  assert.equal(suggestedStatusForCheckin(start + 9 * MIN, start), 'present');
  assert.equal(suggestedStatusForCheckin(start + 11 * MIN, start), 'late');
});

// ---------------------------------------------------------------- weekly plan
const now = Date.parse('2026-10-26T06:00:00Z'); // Monday 11:00 Almaty
const offering = (id: string, title: string): OfferingDTO => ({
  id, courseCode: id.toUpperCase(), title, termId: 't', termLabel: 'Fall 2026', groupLabel: 'SE-2419',
  status: 'active', staffUids: ['t'], studentUids: ['s1'], policy: { ...DEFAULT_DEMO_POLICY },
});
const session = (o: string, i: number, startsAt: number, status: SessionDTO['status'] = 'held'): SessionDTO => ({
  id: `s${i}`, offeringId: o, type: 'lecture', topic: `Topic ${i}`, room: 'C1.3.220L', startsAt, durationMinutes: 50, status,
  maxPoints: 2, attendancePublication: 'published', publishedAt: now, revision: 1, updatedAt: now,
});
const att = (o: string, i: number, status: AttendanceRecordDTO['status']): AttendanceRecordDTO => ({
  id: attendanceRecordId(`s${i}`, 's1'), offeringId: o, sessionId: `s${i}`, studentUid: 's1', status,
  points: status === 'present' ? 2 : 0, remark: '', publication: 'published', revision: 1, updatedBy: 't', updatedAt: now, correction: null,
});
const asm = (o: string, id: string, dueAt: number, extra: Partial<AssessmentDTO> = {}): AssessmentDTO => ({
  id, offeringId: o, title: id, category: 'assignment', maxPoints: 100, dueAt, countsForOverdue: true, period: null, weight: null,
  gradesPublication: 'published', publishedAt: now, revision: 1, updatedAt: now, ...extra,
});
const rec = (o: string, a: string, extra: Partial<AssessmentRecordDTO>): AssessmentRecordDTO => ({
  id: assessmentRecordId(a, 's1'), offeringId: o, assessmentId: a, studentUid: 's1', submission: 'submitted', gradeState: 'graded',
  points: 80, maxPoints: 100, feedback: '', publication: 'published', revision: 1, updatedBy: 't', updatedAt: now, correction: null, ...extra,
});

function riskyCourse() {
  const o = offering('math', 'Calculus 1');
  const past = [1, 2, 3, 4].map((i) => session(o.id, i, now - (10 - i) * DAY));
  const future = [session(o.id, 5, now + 1 * DAY, 'scheduled'), session(o.id, 6, now + 3 * DAY, 'scheduled'), session(o.id, 7, now + 9 * DAY, 'scheduled')];
  return buildCourseHealth({
    offering: o, sessions: [...past, ...future], now,
    assessments: [asm(o.id, 'hw1', now - 5 * DAY), asm(o.id, 'hw2', now - 2 * DAY), asm(o.id, 'hw3', now + 2 * DAY), asm(o.id, 'quiz', now - 6 * DAY)],
    attendanceRecords: [att(o.id, 1, 'present'), att(o.id, 2, 'absent'), att(o.id, 3, 'absent'), att(o.id, 4, 'absent')],
    assessmentRecords: [
      rec(o.id, 'hw1', { submission: 'missing', gradeState: 'missing', points: null }),
      rec(o.id, 'hw2', { submission: 'missing', gradeState: 'missing', points: null }),
      rec(o.id, 'quiz', { points: 41, feedback: 'Повторите производные' }),
    ],
  });
}
function calmCourse() {
  const o = offering('prog', 'Programming');
  return buildCourseHealth({
    offering: o, now, sessions: [1, 2, 3].map((i) => session(o.id, i, now - (10 - i) * DAY)),
    assessments: [asm(o.id, 'p1', now - 3 * DAY), asm(o.id, 'p2', now + 4 * DAY)],
    attendanceRecords: [att(o.id, 1, 'present'), att(o.id, 2, 'present'), att(o.id, 3, 'present')],
    assessmentRecords: [rec(o.id, 'p1', { points: 92 })],
  });
}

test('schedule: only upcoming, non-cancelled sessions inside the horizon', () => {
  const c = riskyCourse();
  assert.deepEqual(c.schedule.map((s) => s.sessionId), ['s5', 's6'], 's7 is 9 days ahead (outside the 8-day horizon)');
});

test('weekly plan: debts first, attendance-risk classes, deadlines, review; calm course adds only its deadline', () => {
  const plan = buildWeeklyPlan([calmCourse(), riskyCourse()], now);
  const kinds = plan.items.map((i) => `${i.kind}:${i.courseCode}`);
  assert.deepEqual(kinds.slice(0, 3), ['overdue:MATH', 'overdue:MATH', 'deadline:MATH'], 'priority 1: debts, then deadlines of the risky course');
  assert.ok(kinds.includes('attend:MATH'), 'classes of the low-attendance course become tasks');
  assert.equal(plan.items.filter((i) => i.kind === 'attend').length, 2, 'only classes inside 7 days');
  assert.ok(kinds.includes('contact:MATH'), 'high risk → contact the teacher');
  const review = plan.items.find((i) => i.kind === 'review');
  assert.equal(review?.data.percent, 41);
  assert.equal(review?.data.feedback, 'Повторите производные');
  assert.deepEqual(plan.items.filter((i) => i.courseCode === 'PROG').map((i) => i.kind), ['deadline'], 'calm course: just its deadline, priority 2');
  assert.equal(plan.items.find((i) => i.courseCode === 'PROG')?.priority, 2);
  assert.equal(plan.focusCourses, 1);
  assert.equal(new Set(plan.items.map((i) => i.id)).size, plan.items.length, 'ids are unique');
  assert.deepEqual(buildWeeklyPlan([riskyCourse(), calmCourse()], now).items.map((i) => i.id), plan.items.map((i) => i.id), 'deterministic order');
});

test('weekly plan: no courses → empty plan; ISO week in Almaty time', () => {
  assert.equal(buildWeeklyPlan([], now).items.length, 0);
  assert.equal(isoWeekId(now), '2026-W44');
  assert.equal(isoWeekId(Date.parse('2026-11-01T18:59:00Z')), '2026-W44', 'Sunday 23:59 Almaty');
  assert.equal(isoWeekId(Date.parse('2026-11-01T19:00:00Z')), '2026-W45', 'Monday 00:00 Almaty');
  assert.equal(isoWeekId(Date.parse('2027-01-01T06:00:00Z')), '2026-W53');
  assert.equal(new Date(startOfWeek(now)).toISOString(), '2026-10-25T19:00:00.000Z', 'Monday 00:00 Almaty = Sunday 19:00 UTC');
});

test('plan ticks older than 3 weeks are pruned', () => {
  const ticks = { a: now - 1 * DAY, b: now - 30 * DAY };
  assert.deepEqual(Object.keys(prunePlanTicks(ticks, now)), ['a']);
});
