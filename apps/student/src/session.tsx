// One source of truth for the signed-in student: Firebase Auth user, live profile, the live Radar,
// weekly-plan ticks and a pending QR check-in / join link. Sign-out detaches every Firestore listener and
// drops all user data from memory (shared-device safety).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut, type User } from 'firebase/auth';
import {
  completeStudentProfile, emptyProfile, getUserProfile, registerStudent, watchPlanState, watchStudentRadar, watchUserProfile,
  type RadarState, type UserProfile,
} from '@aitu/data';
import { decodeCheckinPayload, isJoinCode, normalizeJoinCode, type StudentRegistration } from '@aitu/domain';
import { fb } from './firebase.ts';

export type StudentSession =
  | { status: 'loading' }
  | { status: 'signed-out' }
  /** Signed in, but the profile document is missing (registration interrupted) → finish registration. */
  | { status: 'needs-profile'; user: User }
  | { status: 'signed-in'; user: User; profile: UserProfile; radar: RadarState };

export type PendingLink =
  | { kind: 'checkin'; offeringId: string; sessionId: string; code: string }
  | { kind: 'join'; code: string };

interface SessionValue {
  session: StudentSession;
  signIn: (email: string, password: string) => Promise<void>;
  register: (form: StudentRegistration) => Promise<void>;
  completeProfile: (f: Pick<StudentRegistration, 'fullName' | 'program' | 'groupLabel' | 'studentNumber'>) => Promise<void>;
  signOut: () => Promise<void>;
  planDone: Record<string, number>;
  pending: PendingLink | null;
  clearPending: () => void;
}

/** Thrown by signIn for a valid account that is not a student (e.g. a teacher). */
export class NotAStudentError extends Error {
  constructor() { super('not-a-student'); this.name = 'NotAStudentError'; }
}

const INITIAL_RADAR: RadarState = {
  status: 'loading', courses: [], stale: false, error: null,
  summary: { counts: { high: 0, medium: 0, low: 0, unknown: 0 }, ordered: [], focus: null },
};

/** QR / link parameters: ?checkin=offering~session~code or ?join=K7Q4MX (removed from the address bar at once). */
function readPendingFromUrl(): PendingLink | null {
  try {
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search || url.hash.replace(/^#\/?/, ''));
    const c = decodeCheckinPayload(params.get('checkin'));
    const j = params.get('join');
    if (!c && !j) return null;
    url.searchParams.delete('checkin'); url.searchParams.delete('join');
    window.history.replaceState(null, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : ''));
    if (c) return { kind: 'checkin', ...c };
    if (j && isJoinCode(j)) return { kind: 'join', code: normalizeJoinCode(j) };
  } catch { /* ignore malformed links */ }
  return null;
}

const Ctx = createContext<SessionValue | null>(null);

export function StudentSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  /** undefined = loading, null = no profile document */
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  const [radar, setRadar] = useState<RadarState>(INITIAL_RADAR);
  const [planDone, setPlanDone] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<PendingLink | null>(() => readPendingFromUrl());

  useEffect(() => onAuthStateChanged(fb.auth, (u) => {
    setUser(u);
    if (!u) { setProfile(undefined); setRadar(INITIAL_RADAR); setPlanDone({}); }
  }), []);

  // Live profile: a registration that just wrote the document flips needs-profile → signed-in by itself.
  useEffect(() => {
    if (!user) return;
    setProfile(undefined);
    return watchUserProfile(user.uid, (v) => setProfile(v.data), () => setProfile(emptyProfile(user.uid, user.email ?? '')));
  }, [user]);

  // Live Radar + plan ticks for the current uid only (only once the profile says "student").
  const isStudent = profile?.role === 'student';
  useEffect(() => {
    if (!user || !isStudent) return;
    let alive = true;
    const unRadar = watchStudentRadar(user.uid, (s) => { if (alive) setRadar(s); });
    const unPlan = watchPlanState(user.uid, (v) => { if (alive) setPlanDone(v.data?.done ?? {}); }, () => {});
    return () => { alive = false; unRadar(); unPlan(); setRadar(INITIAL_RADAR); setPlanDone({}); };
  }, [user, isStudent]);

  const signIn = useCallback(async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(fb.auth, email.trim(), password);
    const p = await getUserProfile(cred.user.uid).catch(() => null);
    if (p && p.role !== 'student') { await fbSignOut(fb.auth); throw new NotAStudentError(); }
  }, []);

  const register = useCallback(async (form: StudentRegistration) => { await registerStudent(form); }, []);

  const completeProfile = useCallback(async (f: Pick<StudentRegistration, 'fullName' | 'program' | 'groupLabel' | 'studentNumber'>) => {
    const u = fb.auth.currentUser;
    if (!u) throw new Error('not signed in');
    await completeStudentProfile(u, f);
  }, []);

  const signOut = useCallback(() => fbSignOut(fb.auth), []);
  const clearPending = useCallback(() => setPending(null), []);

  const session = useMemo<StudentSession>(() => {
    if (user === undefined) return { status: 'loading' };
    if (!user) return { status: 'signed-out' };
    if (profile === undefined) return { status: 'loading' };
    if (profile === null) return { status: 'needs-profile', user };
    return { status: 'signed-in', user, profile, radar };
  }, [user, profile, radar]);

  const value = useMemo(() => ({ session, signIn, register, completeProfile, signOut, planDone, pending, clearPending }),
    [session, signIn, register, completeProfile, signOut, planDone, pending, clearPending]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStudentSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStudentSession outside StudentSessionProvider');
  return v;
}

/** For screens shown only after sign-in. */
export function useSignedInStudent(): { profile: UserProfile; radar: RadarState; user: User | null } {
  const { session } = useStudentSession();
  if (session.status !== 'signed-in') return { profile: emptyProfile('', ''), radar: INITIAL_RADAR, user: null };
  return { profile: session.profile, radar: session.radar, user: session.user };
}

/** "SE-2419" → year of study in the current academic year (intake 2024, Fall 2026 → 3). */
export function yearOfStudy(groupLabel: string, now = new Date()): number | null {
  const m = /-(\d{2})\d{2}$/.exec(groupLabel);
  if (!m) return null;
  const intake = 2000 + Number(m[1]);
  const academicYearStart = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const year = academicYearStart - intake + 1;
  return year >= 1 && year <= 6 ? year : null;
}

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}
