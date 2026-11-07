// Administrator: accounts, courses, statistics, backup/export. Admin power comes from the `admin` custom
// claim in the ID token (set only by `npm run make-admin`), checked by Security Rules on every request.
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail, signOut } from 'firebase/auth';
import {
  arrayUnion, collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, writeBatch,
  type DocumentData, type Unsubscribe,
} from 'firebase/firestore';
import {
  ATTENDANCE_STATUSES, buildRosterRisk, DEFAULT_DEMO_POLICY, generateTempPassword, normalizeEmail, normalizeName,
  utcToZonedWallTime, type AssessmentDTO, type AssessmentRecordDTO, type AttendanceRecordDTO, type CheckinDTO,
  type EnrollmentDTO, type OfferingDTO, type RiskLevel, type SessionDTO,
} from '@aitu/domain';
import { firebase } from './firebase.ts';
import { C, refs } from './paths.ts';
import {
  toAdminLog, toAssessment, toAssessmentRecord, toAttendanceRecord, toCheckin, toEnrollment, toOffering, toSession, toTerm, toUser,
  type AdminLogEntry, type TermDTO, type UserProfile,
} from './converters.ts';
import { DataError, toDataError } from './errors.ts';
import { watchDoc, watchQuery, type Live, type OnError } from './live.ts';
import { authErrorKind, AuthFlowError } from './account.ts';
import { freeJoinCode } from './enroll.ts';

const r = () => refs(firebase().db);
const db = () => firebase().db;

const log = (type: string, actorUid: string, target: string, details: Record<string, unknown> = {}) =>
  ({ type, actorUid, at: serverTimestamp(), target, details });

// ---------------------------------------------------------------- live lists
export const watchAllUsers = (next: (v: Live<UserProfile[]>) => void, onError: OnError): Unsubscribe =>
  watchQuery(r().users(), toUser, (v) => next({ ...v, data: [...v.data].sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru')) }), onError);

export const watchAllOfferings = (next: (v: Live<OfferingDTO[]>) => void, onError: OnError): Unsubscribe =>
  watchQuery(r().offerings(), toOffering, (v) => next({ ...v, data: [...v.data].sort((a, b) => a.courseCode.localeCompare(b.courseCode) || a.groupLabel.localeCompare(b.groupLabel)) }), onError);

export const watchTerms = (next: (v: Live<TermDTO[]>) => void, onError: OnError): Unsubscribe =>
  watchQuery(r().terms(), toTerm, next, onError);

export const watchAdminLog = (n: number, next: (v: Live<AdminLogEntry[]>) => void, onError: OnError): Unsubscribe =>
  watchQuery(query(r().adminLog(), orderBy('at', 'desc'), limit(n)), toAdminLog, next, onError);

export const watchCourseEnrollments = (o: string, next: (v: Live<EnrollmentDTO[]>) => void, onError: OnError): Unsubscribe =>
  watchQuery(r().enrollments(o), toEnrollment, (v) => next({ ...v, data: [...v.data].sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru')) }), onError);

export const watchStats = (next: (v: Live<AdminStats | null>) => void, onError: OnError): Unsubscribe =>
  watchDoc(r().stats(), (s) => {
    const d = s.data({ serverTimestamps: 'estimate' }) as DocumentData;
    const at = d.computedAt instanceof Timestamp ? d.computedAt.toMillis() : null;
    return { ...(d.data as Omit<AdminStats, 'computedAt'>), computedAt: at } as AdminStats;
  }, next, onError);

// ---------------------------------------------------------------- accounts
/**
 * Creates a teacher's Auth account from a SECOND, throw-away app instance (so the admin stays signed in),
 * then writes the profile with role 'teacher' and mustChangePassword. Returns the one-time temporary password.
 */
export async function createTeacherAccount(input: { displayName: string; email: string; department: string }, adminUid: string): Promise<{ uid: string; tempPassword: string }> {
  const { config, usingEmulators, emulatorHost } = firebase();
  const email = normalizeEmail(input.email);
  const tempPassword = generateTempPassword();
  const secondary = initializeApp(config, `admin-create-${Date.now()}`);
  let uid: string;
  try {
    const auth2 = getAuth(secondary);
    if (usingEmulators) connectAuthEmulator(auth2, `http://${emulatorHost}:9099`, { disableWarnings: true });
    uid = (await createUserWithEmailAndPassword(auth2, email, tempPassword)).user.uid;
    await signOut(auth2).catch(() => {});
  } catch (e) {
    throw new AuthFlowError(authErrorKind(e), {}, e);
  } finally {
    await deleteApp(secondary).catch(() => {});
  }
  const b = writeBatch(db());
  const department = input.department.trim();
  b.set(r().user(uid), {
    displayName: normalizeName(input.displayName), email, role: 'teacher', ...(department ? { department } : {}),
    source: 'admin', mustChangePassword: true, createdAt: serverTimestamp(), createdBy: adminUid,
  });
  b.set(doc(r().adminLog()), log('user.teacher.created', adminUid, `users/${uid}`, { email }));
  try { await b.commit(); } catch (e) { throw toDataError(e); }
  return { uid, tempPassword };
}

export async function updateTeacher(uid: string, patch: { displayName: string; department: string }, adminUid: string): Promise<void> {
  const b = writeBatch(db());
  b.update(r().user(uid), { displayName: normalizeName(patch.displayName), department: patch.department.trim() });
  b.set(doc(r().adminLog()), log('user.updated', adminUid, `users/${uid}`));
  try { await b.commit(); } catch (e) { throw toDataError(e); }
}

/** Sends Firebase's password-reset e-mail to the user (works for real mailboxes only). */
export async function sendPasswordResetFor(user: UserProfile, adminUid: string): Promise<void> {
  try {
    await sendPasswordResetEmail(firebase().auth, user.email);
    await setDoc(doc(r().adminLog()), log('user.password-reset', adminUid, `users/${user.uid}`));
  } catch (e) {
    throw toDataError(e);
  }
}

// ---------------------------------------------------------------- courses
export interface NewOffering { courseCode: string; title: string; groupLabel: string; termId: string; termLabel: string; staffUids: string[] }

export const offeringIdFor = (code: string, group: string, termId: string) =>
  `${termId.replace(/^demo-term-/, '').replace(/[^a-z0-9]+/gi, '').toLowerCase().slice(0, 12)}-${code.toLowerCase()}-${group.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

/** Course + its first join code + catalogue entry + journal, in one batch. */
export async function createOffering(input: NewOffering, adminUid: string): Promise<{ id: string; joinCode: string }> {
  const courseCode = input.courseCode.trim().toUpperCase();
  const id = offeringIdFor(courseCode, input.groupLabel, input.termId);
  const existing = await getDoc(r().offering(id)).catch(() => null);
  if (existing?.exists()) throw new DataError('conflict', 'offering exists');
  const joinCode = await freeJoinCode();
  const title = input.title.trim();
  const b = writeBatch(db());
  b.set(r().offering(id), {
    courseCode, title, termId: input.termId, termLabel: input.termLabel, groupLabel: input.groupLabel, status: 'active',
    staffUids: input.staffUids, studentUids: [],
    policy: { ...DEFAULT_DEMO_POLICY, attendancePointShare: { ...DEFAULT_DEMO_POLICY.attendancePointShare } }, policyVersion: DEFAULT_DEMO_POLICY.version,
    joinCode, createdAt: serverTimestamp(), createdBy: adminUid, updatedAt: serverTimestamp(),
  });
  b.set(r().joinCode(joinCode), {
    offeringId: id, courseCode, title, groupLabel: input.groupLabel, termLabel: input.termLabel,
    active: true, createdBy: adminUid, createdAt: serverTimestamp(),
  });
  b.set(r().courseCatalogEntry(courseCode), { code: courseCode, title });
  b.set(doc(r().adminLog()), log('offering.created', adminUid, `offerings/${id}`, { courseCode, groupLabel: input.groupLabel }));
  try { await b.commit(); } catch (e) { throw toDataError(e); }
  return { id, joinCode };
}

export async function updateOffering(o: string, patch: Partial<Pick<OfferingDTO, 'title' | 'status' | 'staffUids'>>, adminUid: string): Promise<void> {
  const b = writeBatch(db());
  b.update(r().offering(o), { ...patch, updatedAt: serverTimestamp() });
  b.set(doc(r().adminLog()), log(patch.staffUids ? 'offering.staff.changed' : 'offering.updated', adminUid, `offerings/${o}`, { fields: Object.keys(patch) }));
  try { await b.commit(); } catch (e) { throw toDataError(e); }
}

/** Admin enrols a registered student directly (no code). */
export async function adminEnrollStudent(o: string, student: UserProfile, adminUid: string): Promise<void> {
  const b = writeBatch(db());
  b.update(r().offering(o), { studentUids: arrayUnion(student.uid), updatedAt: serverTimestamp() });
  b.set(r().enrollment(o, student.uid), {
    studentUid: student.uid, displayName: student.displayName, studentNumber: student.studentNumber, groupLabel: student.groupLabel,
    status: 'active', enrolledAt: serverTimestamp(), via: 'admin', updatedAt: serverTimestamp(), updatedBy: adminUid,
  });
  b.set(doc(r().adminLog()), log('enrollment.added', adminUid, `offerings/${o}/enrollments/${student.uid}`));
  try { await b.commit(); } catch (e) { throw toDataError(e); }
}

// ---------------------------------------------------------------- full read (stats, backup, CSV)
export interface CourseBundle {
  offering: OfferingDTO;
  enrollments: EnrollmentDTO[];
  sessions: SessionDTO[];
  attendance: AttendanceRecordDTO[];
  assessments: AssessmentDTO[];
  grades: AssessmentRecordDTO[];
  checkins: CheckinDTO[];
}
export interface Everything { users: UserProfile[]; courses: CourseBundle[]; raw: Record<string, DocumentData> }

const SUBCOLLECTIONS = [C.enrollments, C.sessions, C.attendanceRecords, C.assessments, C.assessmentRecords, C.audit, C.checkins, C.checkinTokens] as const;

/**
 * Reads the whole database once (≈ 6 000 documents for the demo base → ~12 % of the free daily read quota).
 * Called only on an explicit admin action, never on page load.
 */
export async function loadEverything(onProgress?: (done: number, total: number) => void): Promise<Everything> {
  const raw: Record<string, DocumentData> = {};
  const grab = async (path: string, ...segments: string[]) => {
    const snap = await getDocs(collection(db(), path, ...segments));
    for (const d of snap.docs) raw[d.ref.path] = d.data();
    return snap.docs;
  };
  try {
    const [users, offerings] = await Promise.all([grab(C.users), grab(C.offerings), grab(C.joinCodes), grab(C.terms), grab(C.courseCatalog), grab(C.adminLog), grab(C.stats)]);
    const courses: CourseBundle[] = [];
    let i = 0;
    for (const od of offerings) {
      const parts = await Promise.all(SUBCOLLECTIONS.map((sub) => grab(C.offerings, od.id, sub)));
      const [enr, ses, att, asm, gr, , chk] = parts;
      courses.push({
        offering: toOffering(od), enrollments: enr!.map(toEnrollment), sessions: ses!.map(toSession), attendance: att!.map(toAttendanceRecord),
        assessments: asm!.map(toAssessment), grades: gr!.map(toAssessmentRecord), checkins: chk!.map(toCheckin),
      });
      onProgress?.(++i, offerings.length);
    }
    return { users: users.map(toUser), courses, raw };
  } catch (e) {
    throw toDataError(e);
  }
}

// ---------------------------------------------------------------- statistics (also: Endterm Part C5)
export interface AdminStats {
  computedAt: number | null;
  totals: { students: number; teachers: number; admins: number; selfRegistered: number; registeredLast7Days: number;
    offerings: number; activeOfferings: number; enrollments: number; sessionsHeld: number; attendanceRecords: number; gradeRecords: number; checkins: number };
  risk: Record<RiskLevel, number>;
  admission: Record<'admitted' | 'on-track' | 'at-risk' | 'not-admitted' | 'unknown', number>;
  courses: { offeringId: string; label: string; students: number; attendancePercent: number | null; avgGradePercent: number | null;
    high: number; medium: number; low: number; unknown: number }[];
  /** Mon..Sun (0..6): share of absences among marked attendance, published records only. */
  absenceByWeekday: { weekday: number; marked: number; absencePercent: number | null }[];
  /** Hour of day (Almaty) → share of late arrivals. */
  lateByHour: { hour: number; marked: number; latePercent: number | null }[];
  gradeByCategory: { category: string; n: number; avgPercent: number | null }[];
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/** Pure: everything → numbers for the dashboard and charts. Uses only PUBLISHED records (same as students see). */
export function computeAdminStats(e: Everything, now: number): AdminStats {
  const users = e.users;
  const risk: AdminStats['risk'] = { high: 0, medium: 0, low: 0, unknown: 0 };
  const admission: AdminStats['admission'] = { admitted: 0, 'on-track': 0, 'at-risk': 0, 'not-admitted': 0, unknown: 0 };
  const weekday = Array.from({ length: 7 }, (_, d) => ({ weekday: d, marked: 0, absent: 0 }));
  const hours = new Map<number, { marked: number; late: number }>();
  const cats = new Map<string, { n: number; sum: number }>();
  let sessionsHeld = 0, attendanceRecords = 0, gradeRecords = 0, checkins = 0, enrollments = 0;
  const courses: AdminStats['courses'] = [];

  for (const c of e.courses) {
    const sessionsById = new Map(c.sessions.map((s) => [s.id, s]));
    const assessmentsById = new Map(c.assessments.map((a) => [a.id, a]));
    sessionsHeld += c.sessions.filter((s) => s.status === 'held').length;
    attendanceRecords += c.attendance.length;
    gradeRecords += c.grades.length;
    checkins += c.checkins.length;
    enrollments += c.enrollments.filter((x) => x.status === 'active').length;

    let present = 0, marked = 0;
    for (const a of c.attendance) {
      if (a.publication !== 'published' || !ATTENDANCE_STATUSES.includes(a.status) || a.status === 'unmarked' || a.status === 'excused') continue;
      const s = sessionsById.get(a.sessionId);
      if (!s) continue;
      marked++;
      if (a.status === 'present' || a.status === 'late') present++;
      const wall = new Date(utcToZonedWallTime(s.startsAt).date + 'T00:00:00Z');
      const wd = weekday[(wall.getUTCDay() + 6) % 7]!;
      wd.marked++; if (a.status === 'absent') wd.absent++;
      if (a.status !== 'absent') {
        const hour = Number(utcToZonedWallTime(s.startsAt).time.slice(0, 2));
        const h = hours.get(hour) ?? { marked: 0, late: 0 };
        h.marked++; if (a.status === 'late') h.late++;
        hours.set(hour, h);
      }
    }
    let gSum = 0, gN = 0;
    for (const g of c.grades) {
      if (g.publication !== 'published' || g.gradeState !== 'graded' || g.points == null) continue;
      const a = assessmentsById.get(g.assessmentId);
      if (!a || a.maxPoints <= 0) continue;
      const p = (g.points / a.maxPoints) * 100;
      gSum += p; gN++;
      const k = cats.get(a.category) ?? { n: 0, sum: 0 };
      k.n++; k.sum += p; cats.set(a.category, k);
    }
    const roster = buildRosterRisk({
      offering: c.offering, sessions: c.sessions, assessments: c.assessments, now,
      studentUids: c.offering.studentUids, attendanceRecords: c.attendance, assessmentRecords: c.grades,
    });
    const dist = { high: 0, medium: 0, low: 0, unknown: 0 } as Record<RiskLevel, number>;
    for (const s of roster) {
      dist[s.health.risk.level]++; risk[s.health.risk.level]++;
      const adm = s.health.risk.standing?.admission ?? 'unknown';
      admission[adm]++;
    }
    courses.push({
      offeringId: c.offering.id, label: `${c.offering.courseCode} · ${c.offering.groupLabel}`, students: c.offering.studentUids.length,
      attendancePercent: pct(present, marked), avgGradePercent: gN ? Math.round((gSum / gN) * 10) / 10 : null, ...dist,
    });
  }

  return {
    computedAt: null,
    totals: {
      students: users.filter((u) => u.role === 'student').length, teachers: users.filter((u) => u.role === 'teacher').length,
      admins: users.filter((u) => u.role === 'admin').length, selfRegistered: users.filter((u) => u.source === 'self').length,
      registeredLast7Days: users.filter((u) => u.source === 'self' && u.createdAt != null && now - u.createdAt <= 7 * 86_400_000).length,
      offerings: e.courses.length, activeOfferings: e.courses.filter((c) => c.offering.status === 'active').length,
      enrollments, sessionsHeld, attendanceRecords, gradeRecords, checkins,
    },
    risk, admission, courses,
    absenceByWeekday: weekday.map((w) => ({ weekday: w.weekday, marked: w.marked, absencePercent: pct(w.absent, w.marked) })),
    lateByHour: [...hours.entries()].sort((a, b) => a[0] - b[0]).map(([hour, h]) => ({ hour, marked: h.marked, latePercent: pct(h.late, h.marked) })),
    gradeByCategory: [...cats.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([category, k]) => ({ category, n: k.n, avgPercent: Math.round((k.sum / k.n) * 10) / 10 })),
  };
}

export async function refreshStats(adminUid: string, onProgress?: (done: number, total: number) => void): Promise<AdminStats> {
  const all = await loadEverything(onProgress);
  const stats = computeAdminStats(all, Date.now());
  const { computedAt: _, ...data } = stats;
  const b = writeBatch(db());
  b.set(r().stats(), { computedAt: serverTimestamp(), computedBy: adminUid, data });
  b.set(doc(r().adminLog()), log('stats.refreshed', adminUid, 'stats/latest', { courses: stats.courses.length }));
  try { await b.commit(); } catch (e) { throw toDataError(e); }
  return { ...stats, computedAt: Date.now() };
}

// ---------------------------------------------------------------- backup & CSV
export const BACKUP_FORMAT = 'aitu-success-radar-backup';
export const BACKUP_VERSION = 2;

/** Firestore value → JSON (Timestamps become {"__ts": ms}); `scripts/restore.ts` reverses it. */
function toJson(v: unknown): unknown {
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(toJson);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, toJson(x)]));
  return v;
}

export async function exportBackup(adminUid: string, onProgress?: (done: number, total: number) => void): Promise<{ fileName: string; json: string; documents: number }> {
  const all = await loadEverything(onProgress);
  const documents = Object.fromEntries(Object.entries(all.raw).sort(([a], [b]) => a.localeCompare(b)).map(([p, d]) => [p, toJson(d)]));
  const exportedAt = new Date();
  const payload = {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: exportedAt.toISOString(), projectId: firebase().config.projectId ?? null,
    note: 'Client export by an administrator. Does not include passwords (Firebase Auth) or students\' private plan ticks. Restore: npm run restore -- <file> --yes',
    count: Object.keys(documents).length, documents,
  };
  await setDoc(doc(r().adminLog()), log('backup.exported', adminUid, 'all', { documents: payload.count })).catch(() => {});
  const stamp = exportedAt.toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return { fileName: `aitu-radar-backup-${stamp}.json`, json: JSON.stringify(payload, null, 1), documents: payload.count };
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** One decimal for CSV (65.80000000000001 → 65.8); empty when unknown. */
const r1 = (v: number | null | undefined) => (v == null ? '' : Math.round(v * 10) / 10);
const csv = (header: string[], rows: unknown[][]) => '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

/** Analysis-ready CSV (Google Sheets / Excel pivot tables). Students are pseudonymous ids — no names. */
export async function exportCsv(adminUid: string, onProgress?: (done: number, total: number) => void): Promise<{ name: string; content: string; rows: number }[]> {
  const all = await loadEverything(onProgress);
  const now = Date.now();
  const pseudo = new Map<string, string>();
  const pid = (uid: string) => { let p = pseudo.get(uid); if (!p) { p = `S${String(pseudo.size + 1).padStart(3, '0')}`; pseudo.set(uid, p); } return p; };
  const attendance: unknown[][] = [];
  const grades: unknown[][] = [];
  const riskRows: unknown[][] = [];
  const weekdayName = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  for (const c of all.courses) {
    const o = c.offering;
    const sById = new Map(c.sessions.map((s) => [s.id, s]));
    const aById = new Map(c.assessments.map((a) => [a.id, a]));
    for (const a of c.attendance) {
      if (a.publication !== 'published') continue;
      const s = sById.get(a.sessionId); if (!s) continue;
      const wall = utcToZonedWallTime(s.startsAt);
      const wd = (new Date(wall.date + 'T00:00:00Z').getUTCDay() + 6) % 7;
      attendance.push([o.courseCode, o.groupLabel, s.id, wall.date, weekdayName[wd], wall.time.slice(0, 2), s.type, s.room ?? '', pid(a.studentUid), a.status, a.points ?? '']);
    }
    for (const g of c.grades) {
      if (g.publication !== 'published') continue;
      const a = aById.get(g.assessmentId); if (!a) continue;
      grades.push([o.courseCode, o.groupLabel, a.id, a.title, a.category, a.period ?? '', a.weight ?? '', pid(g.studentUid), g.submission, g.gradeState,
        g.points ?? '', a.maxPoints, g.points != null ? Math.round((g.points / a.maxPoints) * 1000) / 10 : '']);
    }
    for (const s of buildRosterRisk({ offering: o, sessions: c.sessions, assessments: c.assessments, now, studentUids: o.studentUids, attendanceRecords: c.attendance, assessmentRecords: c.grades })) {
      const st = s.health.risk.standing;
      riskRows.push([o.courseCode, o.groupLabel, pid(s.studentUid), s.health.risk.level, s.health.risk.reasons.map((x) => x.code).join(' '),
        s.health.risk.metrics.attendancePercent == null ? '' : Math.round(s.health.risk.metrics.attendancePercent), s.health.risk.metrics.overdueCount,
        r1(st?.regMid.value ?? st?.regMid.current), r1(st?.regTerm.value ?? st?.regTerm.estimate), st?.admission ?? '']);
    }
  }
  await setDoc(doc(r().adminLog()), log('csv.exported', adminUid, 'all', { attendance: attendance.length, grades: grades.length })).catch(() => {});
  return [
    { name: 'attendance.csv', rows: attendance.length, content: csv(['course', 'group', 'session', 'date', 'weekday', 'hour', 'type', 'room', 'student', 'status', 'points'], attendance) },
    { name: 'grades.csv', rows: grades.length, content: csv(['course', 'group', 'assessment', 'title', 'category', 'register', 'weight', 'student', 'submission', 'grade_state', 'points', 'max_points', 'percent'], grades) },
    { name: 'risk.csv', rows: riskRows.length, content: csv(['course', 'group', 'student', 'risk', 'reasons', 'attendance_percent', 'overdue', 'reg_mid', 'reg_term', 'admission'], riskRows) },
  ];
}

export const userById = (users: readonly UserProfile[]) => new Map(users.map((u) => [u.uid, u]));
