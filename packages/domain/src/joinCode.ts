// Course join codes: what a teacher writes on the board, what a student types in My DU.
// 6 characters from an alphabet without look-alikes (no 0/O, 1/I/L), shown as "K7Q-4MX".
// 31⁶ ≈ 887 million combinations; a code only works for the course it was issued for and can be revoked.
import { secureRandom } from './random.ts';

export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

/** Accepts "k7q-4mx", "K7Q 4MX", Cyrillic look-alikes ("К7Q-4МХ") → "K7Q4MX". */
export function normalizeJoinCode(input: string): string {
  return input.toUpperCase()
    .replace(/[КМНРОСТХВЕА]/g, (ch) => 'KMHPOCTXBEA'['КМНРОСТХВЕА'.indexOf(ch)]!)
    .replace(/[^A-Z0-9]/g, '');
}

export function isJoinCode(input: string): boolean {
  return JOIN_CODE_RE.test(normalizeJoinCode(input));
}

export function formatJoinCode(code: string): string {
  const c = normalizeJoinCode(code);
  return c.length > 3 ? `${c.slice(0, 3)}-${c.slice(3, 6)}` : c;
}

export function generateJoinCode(rand: () => number = secureRandom): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += JOIN_CODE_ALPHABET[Math.floor(rand() * JOIN_CODE_ALPHABET.length)]!;
  return s;
}
