// Student side (My DU Radar). Reads ONLY: own offerings, their schedule/assessment definitions,
// and the student's OWN published records. Risk is computed locally with the shared domain module.
import { query, serverTimestamp, setDoc, where, type Unsubscribe } from 'firebase/firestore';
import {
  buildCourseHealth, prunePlanTicks, summarizeRadar,
  type AssessmentDTO, type AssessmentRecordDTO, type AttendanceRecordDTO, type CourseHealth, type OfferingDTO, type RadarSummary, type SessionDTO,
} from '@aitu/domain';
import { firebase } from './firebase.ts';
import { refs } from './paths.ts';
import { toAssessment, toAssessmentRecord, toAttendanceRecord, toOffering, toPlanState, toSession, type PlanStateDTO } from './converters.ts';
import { toDataError, type DataError } from './errors.ts';
import { watchDoc, watchQuery, type Live, type OnError } from './live.ts';

export interface RadarState {
  status: 'loading' | 'ready' | 'error';
  courses: CourseHealth[];
  summary: RadarSummary;
  /** Some data is served from the offline cache: show "may be outdated" + last update time. */
  stale: boolean;
  error: DataError | null;
}

interface CourseSlot {
  offering: OfferingDTO;
  sessions?: SessionDTO[];
  assessments?: AssessmentDTO[];
  attendance?: AttendanceRecordDTO[];
  grades?: AssessmentRecordDTO[];
  stale: Record<string, boolean>;
  unsubs: Unsubscribe[];
}

const EMPTY_SUMMARY: RadarSummary = { counts: { high: 0, medium: 0, low: 0, unknown: 0 }, ordered: [], focus: null };

/**
 * Live radar for the signed-in student. Call the returned function on sign-out / unmount:
 * it detaches every listener so no data of the previous user survives on a shared device.
 */
export function watchStudentRadar(uid: string, onState: (s: RadarState) => void, clock: () => number = Date.now): Unsubscribe {
  const r = refs(firebase().db);
  const slots = new Map<string, CourseSlot>();
  let offeringsLoaded = false;
  let offeringsStale = false;
  let error: DataError | null = null;
  let closed = false;

  const emit = () => {
    if (closed) return;
    if (error) { onState({ status: 'error', courses: [], summary: EMPTY_SUMMARY, stale: false, error }); return; }
    const all = [...slots.values()];
    const ready = offeringsLoaded && all.every((s) => s.sessions && s.assessments && s.attendance && s.grades);
    if (!ready) { onState({ status: 'loading', courses: [], summary: EMPTY_SUMMARY, stale: false, error: null }); return; }
    const now = clock();
    const courses = all.map((s) => buildCourseHealth({
      offering: s.offering, sessions: s.sessions!, assessments: s.assessments!,
      attendanceRecords: s.attendance!, assessmentRecords: s.grades!, now,
    }));
    const stale = offeringsStale || all.some((s) => Object.values(s.stale).some(Boolean));
    onState({ status: 'ready', courses, summary: summarizeRadar(courses), stale, error: null });
  };
  const fail = (e: DataError) => { error = e; emit(); };

  const open = (offering: OfferingDTO): CourseSlot => {
    const o = offering.id;
    const slot: CourseSlot = { offering, stale: {}, unsubs: [] };
    const own = (c: ReturnType<typeof r.attendanceRecords>) =>
      query(c, where('studentUid', '==', uid), where('publication', '==', 'published'));
    slot.unsubs.push(
      watchQuery(r.sessions(o), toSession, (v) => { slot.sessions = v.data; slot.stale.s = v.fromCache; emit(); }, fail),
      watchQuery(r.assessments(o), toAssessment, (v) => { slot.assessments = v.data; slot.stale.a = v.fromCache; emit(); }, fail),
      watchQuery(own(r.attendanceRecords(o)), toAttendanceRecord, (v) => { slot.attendance = v.data; slot.stale.ar = v.fromCache; emit(); }, fail),
      watchQuery(own(r.assessmentRecords(o)), toAssessmentRecord, (v) => { slot.grades = v.data; slot.stale.gr = v.fromCache; emit(); }, fail),
    );
    return slot;
  };

  const offUnsub = watchQuery(
    query(r.offerings(), where('studentUids', 'array-contains', uid)),
    toOffering,
    (v) => {
      offeringsLoaded = true;
      offeringsStale = v.fromCache;
      const active = v.data.filter((o) => o.status === 'active');
      const ids = new Set(active.map((o) => o.id));
      for (const [id, slot] of slots) if (!ids.has(id)) { slot.unsubs.forEach((u) => u()); slots.delete(id); }
      for (const o of active) {
        const existing = slots.get(o.id);
        if (existing) existing.offering = o; else slots.set(o.id, open(o));
      }
      emit();
    },
    fail,
  );

  emit();
  return () => {
    closed = true;
    offUnsub();
    for (const slot of slots.values()) slot.unsubs.forEach((u) => u());
    slots.clear();
  };
}

// ---------------------------------------------------------------- weekly plan ticks
export const watchPlanState = (uid: string, next: (v: Live<PlanStateDTO | null>) => void, onError: OnError): Unsubscribe =>
  watchDoc(refs(firebase().db).planState(uid), toPlanState, next, onError);

/** Saves the whole (pruned) tick map; the document stays small (≤ 300 keys, enforced by rules). */
export async function savePlanTicks(uid: string, done: Record<string, number>): Promise<void> {
  const pruned = prunePlanTicks(done, Date.now());
  try {
    await setDoc(refs(firebase().db).planState(uid), { done: pruned, updatedAt: serverTimestamp() });
  } catch (e) {
    throw toDataError(e);
  }
}
