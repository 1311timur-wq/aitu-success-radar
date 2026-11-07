import { useMemo } from 'react';
import { buildRosterRisk, compareByAttention, type EnrollmentDTO, type StudentRisk } from '@aitu/domain';
import { useCourse } from './CourseContext.tsx';

export interface RosterRiskRow extends StudentRisk { student: EnrollmentDTO }

/** Same engine, same published-only inputs as the student's My DU: the teacher sees what the student sees. */
export function useRosterRisk(): RosterRiskRow[] {
  const c = useCourse();
  return useMemo(() => {
    const byUid = new Map(c.activeRoster.map((s) => [s.studentUid, s]));
    return buildRosterRisk({
      offering: c.offering, sessions: c.sessions, assessments: c.assessments, now: Date.now(),
      studentUids: c.activeRoster.map((s) => s.studentUid), attendanceRecords: c.attendance, assessmentRecords: c.grades,
    })
      .map((r) => ({ ...r, student: byUid.get(r.studentUid)! }))
      .sort((a, b) => compareByAttention({ risk: a.health.risk, title: a.student.displayName }, { risk: b.health.risk, title: b.student.displayName }));
  }, [c]);
}
