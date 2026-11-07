// Accounts: student self-registration, password reset / change, live profile.
// Security Rules re-check every field (role is forced to 'student', e-mail must be the signed-in one).
import {
  createUserWithEmailAndPassword, EmailAuthProvider, reauthenticateWithCredential, reload, sendEmailVerification,
  sendPasswordResetEmail, updatePassword, updateProfile, type User,
} from 'firebase/auth';
import { serverTimestamp, setDoc, updateDoc, type Unsubscribe } from 'firebase/firestore';
import {
  normalizeEmail, normalizeGroup, normalizeName, validateRegistration,
  type RegistrationErrors, type StudentRegistration,
} from '@aitu/domain';
import { firebase } from './firebase.ts';
import { refs } from './paths.ts';
import { toUser, type UserProfile } from './converters.ts';
import { DataError, toDataError } from './errors.ts';
import { watchDoc, type Live, type OnError } from './live.ts';

const r = () => refs(firebase().db);

export const watchUserProfile = (uid: string, next: (v: Live<UserProfile | null>) => void, onError: OnError): Unsubscribe =>
  watchDoc(r().user(uid), toUser, next, onError);

/** Auth error codes the forms translate (everything else → generic). */
export type AuthErrorKind =
  | 'email-in-use' | 'weak-password' | 'invalid-email' | 'wrong-credentials' | 'too-many-requests'
  | 'network' | 'requires-recent-login' | 'profile-write' | 'invalid-form' | 'unknown';

export class AuthFlowError extends Error {
  readonly kind: AuthErrorKind;
  readonly fields: RegistrationErrors;
  constructor(kind: AuthErrorKind, fields: RegistrationErrors = {}, cause?: unknown) {
    super(kind, { cause });
    this.name = 'AuthFlowError';
    this.kind = kind;
    this.fields = fields;
  }
}

export function authErrorKind(e: unknown): AuthErrorKind {
  if (e instanceof AuthFlowError) return e.kind;
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
  if (code.includes('email-already-in-use')) return 'email-in-use';
  if (code.includes('weak-password') || code.includes('password-does-not-meet-requirements')) return 'weak-password';
  if (code.includes('invalid-email')) return 'invalid-email';
  if (/invalid-credential|wrong-password|user-not-found|invalid-login-credentials/.test(code)) return 'wrong-credentials';
  if (code.includes('too-many-requests')) return 'too-many-requests';
  if (code.includes('network-request-failed') || code.endsWith('unavailable')) return 'network';
  if (code.includes('requires-recent-login')) return 'requires-recent-login';
  return 'unknown';
}

type ProfileFields = Pick<StudentRegistration, 'fullName' | 'program' | 'groupLabel' | 'studentNumber'>;

function studentProfileDoc(email: string, f: ProfileFields) {
  return {
    displayName: normalizeName(f.fullName), email: normalizeEmail(email), role: 'student', program: f.program,
    groupLabel: normalizeGroup(f.groupLabel), studentNumber: f.studentNumber.trim(), source: 'self',
    createdAt: serverTimestamp(), consentAt: serverTimestamp(),
  };
}

/**
 * Student self-registration: Auth account → profile document → verification e-mail (best effort).
 * If the profile write fails the account stays signed in and `completeStudentProfile` can finish the job.
 */
export async function registerStudent(form: StudentRegistration): Promise<{ uid: string }> {
  const fields = validateRegistration(form);
  if (Object.keys(fields).length) throw new AuthFlowError('invalid-form', fields);
  const email = normalizeEmail(form.email);
  let user: User;
  try {
    user = (await createUserWithEmailAndPassword(firebase().auth, email, form.password)).user;
  } catch (e) {
    throw new AuthFlowError(authErrorKind(e), {}, e);
  }
  try {
    await setDoc(r().user(user.uid), studentProfileDoc(email, form));
  } catch (e) {
    throw new AuthFlowError('profile-write', {}, e);
  }
  await updateProfile(user, { displayName: normalizeName(form.fullName) }).catch(() => {});
  await sendEmailVerification(user).catch(() => {});
  return { uid: user.uid };
}

/** Finishes a registration whose profile write failed (signed in, but no users/{uid} yet). */
export async function completeStudentProfile(user: User, f: ProfileFields): Promise<void> {
  try {
    await setDoc(r().user(user.uid), studentProfileDoc(user.email ?? '', f));
  } catch (e) {
    throw toDataError(e);
  }
}

export async function updateStudentProfile(uid: string, f: ProfileFields): Promise<void> {
  try {
    await updateDoc(r().user(uid), {
      displayName: normalizeName(f.fullName), program: f.program, groupLabel: normalizeGroup(f.groupLabel), studentNumber: f.studentNumber.trim(),
    });
  } catch (e) {
    throw toDataError(e);
  }
}

/**
 * Always "succeeds" for unknown addresses: the UI shows the same neutral message either way,
 * so the form cannot be used to find out who has an account (e-mail enumeration).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(firebase().auth, normalizeEmail(email));
  } catch (e) {
    const kind = authErrorKind(e);
    if (kind === 'wrong-credentials' || kind === 'invalid-email') return;
    throw new AuthFlowError(kind, {}, e);
  }
}

/** Re-authenticates with the current password, sets the new one; clears the teacher's "must change" flag. */
export async function changeOwnPassword(current: string, next: string, opts: { clearMustChange?: boolean } = {}): Promise<void> {
  const user = firebase().auth.currentUser;
  if (!user || !user.email) throw new DataError('unauthenticated');
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
    await updatePassword(user, next);
  } catch (e) {
    throw new AuthFlowError(authErrorKind(e), {}, e);
  }
  if (opts.clearMustChange) {
    await updateDoc(r().user(user.uid), { mustChangePassword: false, passwordChangedAt: serverTimestamp() }).catch((e) => { throw toDataError(e); });
  }
}

// ---------------------------------------------------------------- e-mail verification
/** Mirrors `trustedEmailFor` in the Security Rules: may the signed-in student join this course right now? */
export function emailTrustedFor(offeringId: string): boolean {
  const u = firebase().auth.currentUser;
  if (!u) return false;
  return u.emailVerified || (/@demo\.aitu\.kz$/.test(u.email ?? '') && offeringId.startsWith('demo-'));
}

/** Sends the verification letter again (Firebase limits how often; the error becomes 'too-many-requests'). */
export async function resendVerification(): Promise<void> {
  const u = firebase().auth.currentUser;
  if (!u) throw new AuthFlowError('unknown');
  try { await sendEmailVerification(u); } catch (e) { throw new AuthFlowError(authErrorKind(e), {}, e); }
}

/** After the student opened the link: reload the account and refresh the ID token so the Rules see email_verified. */
export async function refreshEmailVerified(): Promise<boolean> {
  const u = firebase().auth.currentUser;
  if (!u) return false;
  try { await reload(u); if (u.emailVerified) await u.getIdToken(true); } catch (e) { throw new AuthFlowError(authErrorKind(e), {}, e); }
  return u.emailVerified;
}
