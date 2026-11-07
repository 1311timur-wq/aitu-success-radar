import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, serverTimestamp, Timestamp, type Firestore } from 'firebase/firestore';

export const O = 'off-1';           // offering taught by teacher T
export const O2 = 'off-2';          // offering taught by teacher T2
export const T = 'teacher-1';
export const T2 = 'teacher-2';
export const S1 = 'student-1';
export const S2 = 'student-2';
export const OUTSIDER = 'student-9'; // not enrolled anywhere

export async function makeEnv(projectId: string): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore/firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
}

const policy = { version: 'risk-demo-v1' };

/** Canonical fixture written with rules disabled (= trusted provisioning). */
export async function seedBase(env: RulesTestEnvironment) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    const at = Timestamp.fromMillis(Date.parse('2026-10-20T04:00:00Z'));
    await setDoc(doc(db, 'users', S1), { displayName: 'S1', role: 'student', email: 's1@x' });
    await setDoc(doc(db, 'users', T), { displayName: 'T', role: 'teacher', email: 't@x' });
    await setDoc(doc(db, 'offerings', O), { courseCode: 'M1', title: 'Calc', termId: 't', termLabel: 'F', groupLabel: 'G', status: 'active', staffUids: [T], studentUids: [S1, S2], policy });
    await setDoc(doc(db, 'offerings', O2), { courseCode: 'M2', title: 'LA', termId: 't', termLabel: 'F', groupLabel: 'G', status: 'active', staffUids: [T2], studentUids: [S1], policy });
    await setDoc(doc(db, 'offerings', O, 'enrollments', S1), { studentUid: S1, displayName: 'S1', studentNumber: '1', groupLabel: 'G', status: 'active' });
    await setDoc(doc(db, 'offerings', O, 'enrollments', S2), { studentUid: S2, displayName: 'S2', studentNumber: '2', groupLabel: 'G', status: 'active' });
    for (const [id, status] of [['held1', 'held'], ['sched1', 'scheduled'], ['canc1', 'cancelled']] as const) {
      await setDoc(doc(db, 'offerings', O, 'sessions', id), {
        offeringId: O, type: 'lecture', topic: null, room: null, startsAt: at, durationMinutes: 50, status, maxPoints: 2,
        attendancePublication: 'draft', publishedAt: null, revision: 1, createdBy: T, updatedBy: T, updatedAt: at,
      });
    }
    await setDoc(doc(db, 'offerings', O, 'assessments', 'q1'), {
      offeringId: O, title: 'Quiz 1', category: 'quiz', maxPoints: 10, dueAt: at, countsForOverdue: false, period: 'midterm', weight: 0.2,
      gradesPublication: 'draft', publishedAt: null, revision: 1, createdBy: T, updatedBy: T, updatedAt: at,
    });
    // one published and one draft attendance record per student
    for (const s of [S1, S2]) {
      await setDoc(doc(db, 'offerings', O, 'attendanceRecords', `held1_${s}`), attendance(s, { publication: 'published', revision: 1, updatedAt: at }));
    }
    await setDoc(doc(db, 'offerings', O, 'assessmentRecords', `q1_${S1}`), grade(S1, { publication: 'draft', revision: 1, updatedAt: at }));
  });
}

export function attendance(studentUid: string, o: Record<string, unknown> = {}) {
  return {
    offeringId: O, sessionId: 'held1', studentUid, status: 'present', points: 2, remark: '', publication: 'draft',
    revision: 1, updatedBy: T, updatedAt: serverTimestamp(), correction: null, ...o,
  };
}

export function grade(studentUid: string, o: Record<string, unknown> = {}) {
  return {
    offeringId: O, assessmentId: 'q1', studentUid, submission: 'submitted', gradeState: 'graded', points: 8, maxPoints: 10,
    feedback: '', publication: 'draft', revision: 1, updatedBy: T, updatedAt: serverTimestamp(), correction: null, ...o,
  };
}
