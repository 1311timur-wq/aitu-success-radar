// Offline demo adapter for the subset of `firebase/auth` used by both apps (see firestore.ts).
// Accounts = the demo seed + accounts registered in this browser (localStorage). NOT a security boundary:
// passwords of offline-registered accounts are kept in plain text in localStorage of this demo browser.
import { ADMINS, SEED_PASSWORD, STUDENTS, TEACHERS } from '../../scripts/seed-data.ts';
import type { FirebaseApp } from './app.ts';

export interface User {
  uid: string; email: string | null; displayName: string | null; emailVerified: boolean;
  getIdToken(force?: boolean): Promise<string>;
  getIdTokenResult(force?: boolean): Promise<{ claims: Record<string, unknown>; token: string }>;
}
export interface Auth { currentUser: User | null; readonly appName: string }
export interface AuthCredential { providerId: string; email: string; password: string }

interface Account { uid: string; email: string; password: string; displayName: string; admin?: boolean; verified?: boolean }
const ACC_KEY = 'aitu-offline-accounts-v1';
const seedAccounts = (): Account[] => [...ADMINS, ...TEACHERS, ...STUDENTS].map((a) => ({ ...a, password: SEED_PASSWORD }));
function extraAccounts(): Account[] { try { return JSON.parse(localStorage.getItem(ACC_KEY) ?? '[]'); } catch { return []; } }
function saveExtra(list: Account[]) { try { localStorage.setItem(ACC_KEY, JSON.stringify(list)); } catch { /* ignore */ } }
const allAccounts = () => [...extraAccounts(), ...seedAccounts()]; // offline changes (new password) win
const findByEmail = (email: string) => allAccounts().find((a) => a.email.toLowerCase() === email.trim().toLowerCase());

const fail = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toUser(a: Account): User {
  return {
    uid: a.uid, email: a.email, displayName: a.displayName, emailVerified: a.verified === true || a.email.endsWith('@demo.aitu.kz'),
    getIdToken: async () => `offline-token-${a.uid}`,
    getIdTokenResult: async () => ({ token: `offline-token-${a.uid}`, claims: { admin: a.admin === true, email: a.email } }),
  };
}

// One Auth per app (the admin panel creates teachers from a second app instance, like with real Firebase).
// The default app persists its session per site part (portal "/" vs My DU "/my-du/") so both can be open side by side.
const auths = new Map<string, Auth>();
const subs = new Map<string, Set<(u: User | null) => void>>();
const sessionKey = (name: string) => `aitu-offline-auth:${name}:${typeof location !== 'undefined' && location.pathname.startsWith('/my-du') ? 'student' : 'teacher'}`;

function load(name: string): User | null {
  if (name !== '[DEFAULT]') return null;
  try { const uid = localStorage.getItem(sessionKey(name)); const a = allAccounts().find((x) => x.uid === uid); return a ? toUser(a) : null; } catch { return null; }
}

export function getAuth(app?: FirebaseApp): Auth {
  const name = app?.name ?? '[DEFAULT]';
  let a = auths.get(name);
  if (!a) { a = { currentUser: load(name), appName: name }; auths.set(name, a); subs.set(name, new Set()); }
  return a;
}
export const connectAuthEmulator = (..._a: unknown[]) => {};

function setUser(auth: Auth, u: User | null) {
  auth.currentUser = u;
  if (auth.appName === '[DEFAULT]') {
    try { if (u) localStorage.setItem(sessionKey(auth.appName), u.uid); else localStorage.removeItem(sessionKey(auth.appName)); } catch { /* ignore */ }
  }
  for (const s of subs.get(auth.appName) ?? []) s(u);
}

export function onAuthStateChanged(auth: Auth, cb: (u: User | null) => void) {
  const set = subs.get(auth.appName)!;
  set.add(cb);
  const t = setTimeout(() => cb(auth.currentUser), 40);
  return () => { clearTimeout(t); set.delete(cb); };
}

export async function signInWithEmailAndPassword(auth: Auth, email: string, password: string) {
  await delay(300);
  const a = findByEmail(email);
  if (!a || a.password !== password) throw fail('auth/invalid-credential');
  const u = toUser(a);
  setUser(auth, u);
  return { user: u };
}

export async function createUserWithEmailAndPassword(auth: Auth, email: string, password: string) {
  await delay(400);
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw fail('auth/invalid-email');
  if (password.length < 6) throw fail('auth/weak-password');
  if (findByEmail(e)) throw fail('auth/email-already-in-use');
  const acc: Account = { uid: `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, email: e, password, displayName: '' };
  saveExtra([...extraAccounts(), acc]);
  const u = toUser(acc);
  setUser(auth, u);
  return { user: u };
}

export async function signOut(auth: Auth) { setUser(auth, null); }
export async function sendPasswordResetEmail(_auth: Auth, email: string) { await delay(300); if (!findByEmail(email)) throw fail('auth/user-not-found'); }
// Offline there is no mailbox: sending the letter marks the account verified, as if the link were opened at once.
// The signed-in user object still says `emailVerified: false` until `reload()` — exactly like real Firebase.
export async function sendEmailVerification(user: User) {
  await delay(100);
  const extra = extraAccounts();
  const i = extra.findIndex((x) => x.uid === user.uid);
  if (i >= 0) { extra[i] = { ...extra[i]!, verified: true }; saveExtra(extra); }
}
export async function reload(user: User) {
  await delay(150);
  const a = allAccounts().find((x) => x.uid === user.uid);
  if (a) (user as { emailVerified: boolean }).emailVerified = a.verified === true || a.email.endsWith('@demo.aitu.kz');
}

export const EmailAuthProvider = {
  credential: (email: string, password: string): AuthCredential => ({ providerId: 'password', email, password }),
};

export async function reauthenticateWithCredential(user: User, cred: AuthCredential) {
  await delay(200);
  const a = allAccounts().find((x) => x.uid === user.uid);
  if (!a || a.password !== cred.password) throw fail('auth/invalid-credential');
  return { user };
}

export async function updatePassword(user: User, newPassword: string) {
  await delay(200);
  if (newPassword.length < 6) throw fail('auth/weak-password');
  const extra = extraAccounts();
  const i = extra.findIndex((x) => x.uid === user.uid);
  if (i >= 0) { extra[i] = { ...extra[i]!, password: newPassword }; saveExtra(extra); }
  else {
    const seed = seedAccounts().find((x) => x.uid === user.uid);
    if (seed) saveExtra([...extra.filter((x) => x.email !== seed.email), { ...seed, password: newPassword }]);
  }
}

export async function updateProfile(user: User, profile: { displayName?: string | null }) {
  const extra = extraAccounts();
  const i = extra.findIndex((x) => x.uid === user.uid);
  if (i >= 0 && profile.displayName) { extra[i] = { ...extra[i]!, displayName: profile.displayName }; saveExtra(extra); }
}
