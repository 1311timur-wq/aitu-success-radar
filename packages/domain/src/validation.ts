// Input validation shared by the forms (instant feedback) and mirrored by Security Rules (the real gate).
// Every function returns an error CODE (translated by the UI) or null when the value is valid.
import { secureRandom } from './random.ts';

/** Corporate domains allowed for self-registration. `demo.aitu.kz` exists only for synthetic test accounts. */
export const ALLOWED_EMAIL_DOMAINS = ['astanait.edu.kz', 'demo.aitu.kz'] as const;

/** AITU bachelor directions shown at registration (labels only; no official programme codes are claimed). */
export const PROGRAMS = [
  { id: 'se', label: 'Software Engineering', prefix: 'SE' },
  { id: 'cs', label: 'Computer Science', prefix: 'CS' },
  { id: 'bda', label: 'Big Data Analysis', prefix: 'BDA' },
  { id: 'cyber', label: 'Cybersecurity', prefix: 'CS' },
  { id: 'mt', label: 'Media Technologies', prefix: 'MT' },
  { id: 'itm', label: 'IT Management', prefix: 'ITM' },
  { id: 'st', label: 'Smart Technologies', prefix: 'ST' },
  { id: 'ee', label: 'Electronic Engineering', prefix: 'EE' },
  { id: 'ts', label: 'Telecommunication Systems', prefix: 'TS' },
  { id: 'dj', label: 'Digital Journalism', prefix: 'DJ' },
  { id: 'other', label: 'Other', prefix: '' },
] as const;
export type ProgramId = (typeof PROGRAMS)[number]['id'];
export const PROGRAM_IDS = PROGRAMS.map((p) => p.id) as ProgramId[];
export const programLabel = (id: string): string => PROGRAMS.find((p) => p.id === id)?.label ?? id;

export type ValidationCode =
  | 'required' | 'nameShort' | 'nameLong' | 'nameChars' | 'nameTwoWords'
  | 'emailFormat' | 'emailDomain'
  | 'passwordShort' | 'passwordLong' | 'passwordLetters' | 'passwordDigits' | 'passwordEmail' | 'passwordMismatch'
  | 'groupFormat' | 'studentNumberFormat' | 'programUnknown' | 'consentRequired'
  | 'joinCodeFormat' | 'checkinCodeFormat' | 'courseCodeFormat' | 'titleShort';

const NAME_RE = /^[\p{L}][\p{L}' .-]*[\p{L}.]$/u;

export function normalizeName(v: string): string {
  return v.trim().replace(/\s+/g, ' ');
}

/** Full name: letters (any alphabet), spaces, hyphen, apostrophe; at least first + last name. */
export function validateFullName(v: string): ValidationCode | null {
  const s = normalizeName(v);
  if (!s) return 'required';
  if (s.length < 3) return 'nameShort';
  if (s.length > 80) return 'nameLong';
  if (!NAME_RE.test(s)) return 'nameChars';
  if (s.split(' ').length < 2) return 'nameTwoWords';
  return null;
}

export function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
export function emailDomain(v: string): string {
  return normalizeEmail(v).split('@')[1] ?? '';
}

/** `domains = null` accepts any domain (teacher accounts created by an administrator). */
export function validateEmail(v: string, domains: readonly string[] | null = ALLOWED_EMAIL_DOMAINS): ValidationCode | null {
  const s = normalizeEmail(v);
  if (!s) return 'required';
  if (s.length > 120 || !EMAIL_RE.test(s)) return 'emailFormat';
  if (domains && !domains.includes(emailDomain(s))) return 'emailDomain';
  return null;
}

export interface PasswordCheck { code: ValidationCode | null; score: 0 | 1 | 2 | 3 | 4 }

/** ≥ 8 characters, letters AND digits, must not contain the e-mail name. Score drives the strength meter. */
export function checkPassword(pw: string, email = ''): PasswordCheck {
  const local = normalizeEmail(email).split('@')[0] ?? '';
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-zа-яё]/.test(pw) && /[A-ZА-ЯЁ]/.test(pw)) score++;
  if (/[^\p{L}\p{N}]/u.test(pw)) score++;
  const s = Math.min(4, score) as PasswordCheck['score'];
  if (!pw) return { code: 'required', score: 0 };
  if (pw.length < 8) return { code: 'passwordShort', score: s };
  if (pw.length > 128) return { code: 'passwordLong', score: s };
  if (!/\p{L}/u.test(pw)) return { code: 'passwordLetters', score: s };
  if (!/\p{N}/u.test(pw)) return { code: 'passwordDigits', score: s };
  if (local.length >= 4 && pw.toLowerCase().includes(local)) return { code: 'passwordEmail', score: s };
  return { code: null, score: s };
}

/** AITU group label: letters, dash, 4 digits — e.g. SE-2419, BDA-2502. */
export const GROUP_RE = /^[A-Z]{2,4}-[0-9]{4}$/;
export function normalizeGroup(v: string): string {
  return v.trim().toUpperCase().replace(/[‐-―–]/g, '-').replace(/\s+/g, '')
    // Cyrillic look-alikes typed on a Russian layout
    .replace(/[САЕМТВНКРОХ]/g, (ch) => 'CAEMTBHKPOX'['САЕМТВНКРОХ'.indexOf(ch)]!);
}
export function validateGroup(v: string): ValidationCode | null {
  const s = normalizeGroup(v);
  if (!s) return 'required';
  return GROUP_RE.test(s) ? null : 'groupFormat';
}

/** Student ID (barcode): 5–10 digits. */
export const STUDENT_NUMBER_RE = /^[0-9]{5,10}$/;
export function validateStudentNumber(v: string): ValidationCode | null {
  const s = v.trim();
  if (!s) return 'required';
  return STUDENT_NUMBER_RE.test(s) ? null : 'studentNumberFormat';
}

export function validateProgram(v: string): ValidationCode | null {
  if (!v) return 'required';
  return (PROGRAM_IDS as string[]).includes(v) ? null : 'programUnknown';
}

/** Course code in the catalogue: 2–5 letters + 3 digits, e.g. MATH101, SE101. */
export const COURSE_CODE_RE = /^[A-Z]{2,5}[0-9]{3}$/;
export function validateCourseCode(v: string): ValidationCode | null {
  const s = v.trim().toUpperCase();
  if (!s) return 'required';
  return COURSE_CODE_RE.test(s) ? null : 'courseCodeFormat';
}
export function validateTitle(v: string, min = 3): ValidationCode | null {
  const s = v.trim();
  if (!s) return 'required';
  return s.length < min ? 'titleShort' : s.length > 120 ? 'nameLong' : null;
}

export interface StudentRegistration {
  fullName: string; email: string; password: string; passwordRepeat: string;
  program: string; groupLabel: string; studentNumber: string; consent: boolean;
}
export type RegistrationErrors = Partial<Record<keyof StudentRegistration, ValidationCode>>;

/** Whole-form validation for student self-registration. Empty object = valid. */
export function validateRegistration(f: StudentRegistration): RegistrationErrors {
  const e: RegistrationErrors = {};
  const set = (k: keyof StudentRegistration, c: ValidationCode | null) => { if (c) e[k] = c; };
  set('fullName', validateFullName(f.fullName));
  set('email', validateEmail(f.email));
  set('password', checkPassword(f.password, f.email).code);
  if (!e.password && f.password !== f.passwordRepeat) e.passwordRepeat = 'passwordMismatch';
  set('program', validateProgram(f.program));
  set('groupLabel', validateGroup(f.groupLabel));
  set('studentNumber', validateStudentNumber(f.studentNumber));
  if (!f.consent) e.consent = 'consentRequired';
  return e;
}

/** Guess the direction from a group label: "SE-2419" → Software Engineering. */
export function programFromGroup(groupLabel: string): ProgramId | null {
  const prefix = normalizeGroup(groupLabel).split('-')[0] ?? '';
  const hit = PROGRAMS.find((p) => p.prefix && p.prefix === prefix);
  return hit ? hit.id : null;
}

/** Strong random temporary password for accounts created by an administrator. */
export function generateTempPassword(rand: () => number = secureRandom): string {
  const lower = 'abcdefghijkmnpqrstuvwxyz', upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ', digits = '23456789';
  const pick = (s: string) => s[Math.floor(rand() * s.length)]!;
  const chars = [pick(upper), pick(upper), pick(digits), pick(digits), pick(digits)];
  for (let i = 0; i < 7; i++) chars.push(pick(lower));
  for (let i = chars.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [chars[i], chars[j]] = [chars[j]!, chars[i]!]; }
  return chars.join('');
}
