// "Мой план на неделю": turns the Radar (risk reasons, AITU standing, deadlines, schedule) into a short,
// ordered checklist for the next 7 days. Pure function: same input → same plan (tested).
import type { CourseHealth } from './courseHealth.ts';
import type { Millis } from './types.ts';
import { ACADEMIC_TIME_ZONE, utcToZonedWallTime, zonedWallTimeToUtc } from './time.ts';

const DAY = 86_400_000;
export const PLAN_HORIZON_DAYS = 7;

export type PlanKind = 'overdue' | 'register' | 'deadline' | 'attend' | 'scholarship' | 'contact' | 'review';

export interface PlanItem {
  /** Stable id: a tick survives reloads and devices (stored in users/{uid}/planState). */
  id: string;
  kind: PlanKind;
  /** 1 = do first, 2 = this week, 3 = when you can. */
  priority: 1 | 2 | 3;
  offeringId: string;
  courseTitle: string;
  courseCode: string;
  /** Work title / session topic, if any. */
  subject: string | null;
  /** Deadline or session start (null for weekly goals). */
  at: Millis | null;
  /** Numbers for the text: needed score, percent, room... */
  data: Record<string, number | string | null>;
}

export interface WeeklyPlan {
  weekId: string;            // ISO week in Almaty time, e.g. 2026-W44
  from: Millis;              // now
  to: Millis;                // now + 7 days
  items: PlanItem[];
  focusCourses: number;      // courses with High or Medium risk
}

/** ISO-8601 week id of an instant, in the academic time zone. */
export function isoWeekId(instant: Millis, timeZone: string = ACADEMIC_TIME_ZONE): string {
  const { date } = utcToZonedWallTime(instant, timeZone);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = (t.getUTCDay() + 6) % 7;            // Monday = 0
  t.setUTCDate(t.getUTCDate() - dow + 3);          // Thursday of this week decides the year
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t.getTime() - firstThursday.getTime()) / DAY - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Monday 00:00 of the week containing `instant` (academic time zone), as UTC ms. */
export function startOfWeek(instant: Millis, timeZone: string = ACADEMIC_TIME_ZONE): Millis {
  const { date } = utcToZonedWallTime(instant, timeZone);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(y, m - 1, d - dow));
  return zonedWallTimeToUtc(monday.toISOString().slice(0, 10), '00:00', timeZone);
}

const PRIORITY_KIND_ORDER: PlanKind[] = ['overdue', 'register', 'deadline', 'attend', 'scholarship', 'contact', 'review'];

export function buildWeeklyPlan(courses: readonly CourseHealth[], now: Millis): WeeklyPlan {
  const to = now + PLAN_HORIZON_DAYS * DAY;
  const weekId = isoWeekId(now);
  const items: PlanItem[] = [];
  const base = (c: CourseHealth) => ({ offeringId: c.offeringId, courseTitle: c.title, courseCode: c.courseCode });

  for (const c of courses) {
    const level = c.risk.level;
    const reasons = new Set(c.risk.reasons.map((r) => r.code));
    const st = c.risk.standing;

    // 1. Debts first: missing work after the deadline.
    for (const t of c.tasks.overdue) {
      items.push({ ...base(c), id: `overdue:${c.offeringId}:${t.assessmentId}`, kind: 'overdue', priority: 1, subject: t.title, at: t.dueAt, data: {} });
    }

    // 2. Admission to the final: how much the open register still needs.
    if (reasons.has('ADMISSION_RISK') && st) {
      const midOpen = !st.regMid.complete;
      const avg = st.needs.remainingForAdmission;
      items.push({
        ...base(c), id: `register:${c.offeringId}:${weekId}`, kind: 'register', priority: 1, subject: null, at: null,
        data: {
          register: midOpen ? 'midterm' : 'endterm',
          need: midOpen ? st.scheme.admissionRegisterMin : st.needs.regEndForAdmission,
          avg: avg == null ? null : Math.ceil(avg),
        },
      });
    }

    // 3. Deadlines inside the horizon.
    for (const t of c.tasks.upcoming) {
      if (t.dueAt < now || t.dueAt > to) continue;
      items.push({
        ...base(c), id: `deadline:${c.offeringId}:${t.assessmentId}`, kind: 'deadline',
        priority: level === 'high' || level === 'medium' ? 1 : 2, subject: t.title, at: t.dueAt, data: {},
      });
    }

    // 4. Low attendance → every class of this course in the horizon is a task.
    if (reasons.has('ATTENDANCE_LOW')) {
      const pct = c.risk.metrics.attendancePercent;
      for (const s of c.schedule) {
        if (s.startsAt < now - 30 * 60_000 || s.startsAt > to) continue;
        items.push({
          ...base(c), id: `attend:${c.offeringId}:${s.sessionId}`, kind: 'attend', priority: 2, subject: s.topic, at: s.startsAt,
          data: { type: s.type, room: s.room, percent: pct == null ? null : Math.round(pct), goal: c.policy.attendanceLowBelowPercent },
        });
      }
    }

    // 5. Scholarship: the course is below 70 %.
    if (reasons.has('SCHOLARSHIP_RISK') && st) {
      const avg = st.needs.remainingForScholarship;
      items.push({
        ...base(c), id: `scholarship:${c.offeringId}:${weekId}`, kind: 'scholarship', priority: 2, subject: null, at: null,
        data: { avg: avg == null ? null : Math.ceil(avg), target: st.scheme.scholarshipPercent },
      });
    }

    // 6. High risk → talk to the teacher this week.
    if (level === 'high') {
      items.push({ ...base(c), id: `contact:${c.offeringId}:${weekId}`, kind: 'contact', priority: 2, subject: null, at: null, data: {} });
    }

    // 7. The weakest recent result (< 60 %) → read the feedback and fix the topic.
    const weak = c.grades
      .filter((g) => g.percent != null && g.percent < 60)
      .sort((a, b) => (b.dueAt ?? 0) - (a.dueAt ?? 0))[0];
    if (weak && (level !== 'low' || reasons.size > 0)) {
      items.push({
        ...base(c), id: `review:${c.offeringId}:${weak.assessmentId}`, kind: 'review', priority: 3, subject: weak.title, at: weak.dueAt,
        data: { percent: Math.round(weak.percent!), feedback: weak.feedback || null },
      });
    }
  }

  items.sort((a, b) =>
    a.priority - b.priority
    || PRIORITY_KIND_ORDER.indexOf(a.kind) - PRIORITY_KIND_ORDER.indexOf(b.kind)
    || (a.at ?? Number.MAX_SAFE_INTEGER) - (b.at ?? Number.MAX_SAFE_INTEGER)
    || a.courseTitle.localeCompare(b.courseTitle)
    || a.id.localeCompare(b.id));

  return {
    weekId, from: now, to, items,
    focusCourses: courses.filter((c) => c.risk.level === 'high' || c.risk.level === 'medium').length,
  };
}

/** Ticks older than this are dropped when the plan state is saved (keeps the document small). */
export const PLAN_TICK_TTL_DAYS = 21;

export function prunePlanTicks(done: Record<string, Millis>, now: Millis): Record<string, Millis> {
  const out: Record<string, Millis> = {};
  for (const [k, v] of Object.entries(done)) if (now - v <= PLAN_TICK_TTL_DAYS * DAY) out[k] = v;
  return out;
}
