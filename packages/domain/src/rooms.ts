// AITU campus rooms (C1 building, three blocks joined by staircases).
//   C1.1 — library side · C1.2 — central, main entrance · C1.3 — canteen side
//   C1.3.240 → block 3, floor 2 (first digit of the number = floor), room 240.
//   Suffix letter: L — lecture hall, P — practice room, K — computer lab.
// Demo subset: floors 2–3, rooms x20–x40.
import type { SessionType } from './types.ts';

export type RoomKind = 'L' | 'P' | 'K';
export interface Room {
  code: string;      // "C1.3.240K"
  block: 1 | 2 | 3;
  floor: number;
  number: number;
  kind: RoomKind;
}

export const CAMPUS_BLOCKS = [
  { block: 1, prefix: 'C1.1', ru: 'у библиотеки', en: 'library side' },
  { block: 2, prefix: 'C1.2', ru: 'центральный вход', en: 'main entrance' },
  { block: 3, prefix: 'C1.3', ru: 'у столовой', en: 'canteen side' },
] as const;

function kindFor(block: number, n: number): RoomKind {
  const r = n % 100;
  if (r <= 22 || r === 30) return 'L';            // large halls at the ends of the corridor + one in the middle
  if ((r + block) % 3 === 0 || r >= 37) return 'K';
  return 'P';
}

export const ROOMS: readonly Room[] = Object.freeze(
  ([1, 2, 3] as const).flatMap((block) => [2, 3].flatMap((floor) =>
    Array.from({ length: 21 }, (_, i) => {
      const number = floor * 100 + 20 + i;
      const kind = kindFor(block, number);
      return { code: `C1.${block}.${number}${kind}`, block, floor, number, kind } satisfies Room;
    }))),
);

/** Which room kind suits a session type. */
export const preferredRoomKind = (t: SessionType): RoomKind => (t === 'lecture' ? 'L' : t === 'lab' ? 'K' : 'P');

/** Normalise user input: Cyrillic С/с → C, drop spaces, upper-case ("с1.3 2" → "C1.32" is avoided by keeping dots). */
export function normaliseRoomQuery(q: string): string {
  return q.trim().replace(/[Сс]/g, 'C').replace(/\s+/g, '').toUpperCase();
}

/**
 * Prefix search first ("C1.3.2" → block 3, floor 2), then substring ("237" → C1.1.237P, C1.2.237K, …).
 * Rooms of the preferred kind come first inside each block.
 */
export function searchRooms(query: string, prefer?: RoomKind): Room[] {
  const q = normaliseRoomQuery(query);
  const matches = q === ''
    ? [...ROOMS]
    : ROOMS.filter((r) => r.code.includes(q));
  const rank = (r: Room) => (q && r.code.startsWith(q) ? 0 : 1);
  return matches.sort((a, b) => rank(a) - rank(b) || a.block - b.block || Number(b.kind === prefer) - Number(a.kind === prefer) || a.number - b.number);
}

export function findRoom(code: string | null | undefined): Room | null {
  if (!code) return null;
  const q = normaliseRoomQuery(code);
  return ROOMS.find((r) => r.code === q) ?? ROOMS.find((r) => r.code.replace(/[LPK]$/, '') === q.replace(/[LPK]$/, '')) ?? null;
}
