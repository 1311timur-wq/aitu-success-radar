import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  watchAssessmentRecords, watchAssessments, watchAttendanceRecords, watchEnrollments, watchOffering, watchSessions,
} from '@aitu/data';
import type { AssessmentDTO, AssessmentRecordDTO, AttendanceRecordDTO, EnrollmentDTO, OfferingDTO, SessionDTO } from '@aitu/domain';
import { useLive, type LiveState } from '../hooks/useLive.ts';

export interface CourseData {
  offering: OfferingDTO;
  roster: EnrollmentDTO[];
  activeRoster: EnrollmentDTO[];
  sessions: SessionDTO[];
  assessments: AssessmentDTO[];
  attendance: AttendanceRecordDTO[];
  grades: AssessmentRecordDTO[];
  stale: boolean;
}

export type CourseState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; error: NonNullable<LiveState<unknown>['error']> }
  | { status: 'ready'; data: CourseData };

const Ctx = createContext<CourseData | null>(null);

/** All canonical data of one offering, live. Teacher-scale (one group): a few hundred docs at most. */
export function useCourseSubscription(offeringId: string): CourseState {
  const offering = useLive(watchOffering, offeringId);
  const roster = useLive(watchEnrollments, offeringId);
  const sessions = useLive(watchSessions, offeringId);
  const assessments = useLive(watchAssessments, offeringId);
  const attendance = useLive(watchAttendanceRecords, offeringId, null);
  const grades = useLive(watchAssessmentRecords, offeringId, null);

  return useMemo<CourseState>(() => {
    const all = [offering, roster, sessions, assessments, attendance, grades];
    const failed = all.find((s) => s.status === 'error');
    if (failed?.status === 'error') return { status: 'error', error: failed.error };
    if (offering.status === 'ready' && offering.data === null) return { status: 'missing' };
    if (offering.status !== 'ready' || roster.status !== 'ready' || sessions.status !== 'ready'
      || assessments.status !== 'ready' || attendance.status !== 'ready' || grades.status !== 'ready' || !offering.data) {
      return { status: 'loading' };
    }
    return {
      status: 'ready',
      data: {
        offering: offering.data,
        roster: roster.data,
        activeRoster: roster.data.filter((r) => r.status === 'active' && offering.data!.studentUids.includes(r.studentUid)),
        sessions: sessions.data,
        assessments: assessments.data,
        attendance: attendance.data,
        grades: grades.data,
        stale: all.some((s) => s.status === 'ready' && s.stale),
      },
    };
  }, [offering, roster, sessions, assessments, attendance, grades]);
}

export function CourseProvider({ value, children }: { value: CourseData; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCourse(): CourseData {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCourse outside CourseProvider');
  return v;
}
