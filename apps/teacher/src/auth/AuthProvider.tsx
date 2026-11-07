import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut, type User } from 'firebase/auth';
import { watchUserProfile, type UserProfile } from '@aitu/data';
import { fb } from '../firebase.ts';

type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: User; profile: UserProfile | null; isAdmin: boolean };

interface AuthValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Shared lab / lecture-hall computers: sign out after 30 minutes without any input. */
export const IDLE_SIGN_OUT_MINUTES = 30;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState<boolean | undefined>(undefined);

  useEffect(() => onAuthStateChanged(fb.auth, (u) => { setUser(u); if (!u) { setProfile(undefined); setIsAdmin(undefined); } }), []);

  // `role` in the profile drives the UI; real authority: offering.staffUids and the `admin` token claim (Security Rules).
  useEffect(() => {
    if (!user) return;
    setProfile(undefined);
    setIsAdmin(undefined);
    user.getIdTokenResult().then((r) => setIsAdmin(r.claims.admin === true)).catch(() => setIsAdmin(false));
    return watchUserProfile(user.uid, (v) => setProfile(v.data), () => setProfile(null));
  }, [user]);

  // Idle sign-out (shared devices).
  useEffect(() => {
    if (!user) return;
    let timer = setTimeout(() => void fbSignOut(fb.auth), IDLE_SIGN_OUT_MINUTES * 60_000);
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => void fbSignOut(fb.auth), IDLE_SIGN_OUT_MINUTES * 60_000); };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => { clearTimeout(timer); events.forEach((e) => window.removeEventListener(e, reset)); };
  }, [user]);

  const state = useMemo<AuthState>(() => {
    if (user === undefined) return { status: 'loading' };
    if (!user) return { status: 'signed-out' };
    if (profile === undefined || isAdmin === undefined) return { status: 'loading' };
    return { status: 'signed-in', user, profile, isAdmin };
  }, [user, profile, isAdmin]);

  const value = useMemo<AuthValue>(() => ({
    state,
    signIn: async (email, password) => { await signInWithEmailAndPassword(fb.auth, email.trim().toLowerCase(), password); },
    // Listeners are owned by mounted screens; unmounting on sign-out detaches all of them.
    signOut: () => fbSignOut(fb.auth),
  }), [state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/** For screens rendered behind <RequireRole>: the signed-in teacher or admin. */
export function useTeacher(): { uid: string; profile: UserProfile; isAdmin: boolean } {
  const { state } = useAuth();
  if (state.status !== 'signed-in' || !state.profile) throw new Error('useTeacher outside RequireRole');
  return { uid: state.user.uid, profile: state.profile, isAdmin: state.isAdmin };
}
