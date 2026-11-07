import { collection, doc, type CollectionReference, type DocumentReference, type Firestore } from 'firebase/firestore';
import { assessmentRecordId, attendanceRecordId, checkinRecordId } from '@aitu/domain';

// Single source of truth for collection names (data model v1.1). Never spell a path elsewhere.
export const C = {
  users: 'users',
  terms: 'terms',
  offerings: 'offerings',
  enrollments: 'enrollments',
  sessions: 'sessions',
  attendanceRecords: 'attendanceRecords',
  assessments: 'assessments',
  assessmentRecords: 'assessmentRecords',
  audit: 'audit',
  joinCodes: 'joinCodes',
  checkins: 'checkins',
  checkinTokens: 'checkinTokens',
  planState: 'planState',
  adminLog: 'adminLog',
  stats: 'stats',
  courseCatalog: 'courseCatalog',
} as const;

export const refs = (db: Firestore) => ({
  user: (uid: string) => doc(db, C.users, uid),
  offerings: () => collection(db, C.offerings),
  offering: (o: string) => doc(db, C.offerings, o),
  enrollments: (o: string) => collection(db, C.offerings, o, C.enrollments),
  sessions: (o: string): CollectionReference => collection(db, C.offerings, o, C.sessions),
  session: (o: string, s: string): DocumentReference => doc(db, C.offerings, o, C.sessions, s),
  attendanceRecords: (o: string) => collection(db, C.offerings, o, C.attendanceRecords),
  attendanceRecord: (o: string, s: string, studentUid: string) =>
    doc(db, C.offerings, o, C.attendanceRecords, attendanceRecordId(s, studentUid)),
  assessments: (o: string) => collection(db, C.offerings, o, C.assessments),
  assessment: (o: string, a: string) => doc(db, C.offerings, o, C.assessments, a),
  assessmentRecords: (o: string) => collection(db, C.offerings, o, C.assessmentRecords),
  assessmentRecord: (o: string, a: string, studentUid: string) =>
    doc(db, C.offerings, o, C.assessmentRecords, assessmentRecordId(a, studentUid)),
  audit: (o: string) => collection(db, C.offerings, o, C.audit),
  users: () => collection(db, C.users),
  terms: () => collection(db, C.terms),
  courseCatalogEntry: (code: string) => doc(db, C.courseCatalog, code),
  joinCode: (code: string) => doc(db, C.joinCodes, code),
  joinCodes: () => collection(db, C.joinCodes),
  enrollment: (o: string, studentUid: string) => doc(db, C.offerings, o, C.enrollments, studentUid),
  checkins: (o: string) => collection(db, C.offerings, o, C.checkins),
  checkin: (o: string, sessionId: string, studentUid: string) => doc(db, C.offerings, o, C.checkins, checkinRecordId(sessionId, studentUid)),
  checkinToken: (o: string, sessionId: string) => doc(db, C.offerings, o, C.checkinTokens, sessionId),
  planState: (uid: string) => doc(db, C.users, uid, C.planState, 'current'),
  adminLog: () => collection(db, C.adminLog),
  stats: () => doc(db, C.stats, 'latest'),
});
