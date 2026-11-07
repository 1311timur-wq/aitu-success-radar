import type { Millis } from './types.ts';

/** Display/time-entry zone. Kazakhstan uses a single UTC+5 zone since 2024; storage is always UTC. */
export const ACADEMIC_TIME_ZONE = 'Asia/Almaty';

const partsFormatter = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatter.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    partsFormatter.set(timeZone, f);
  }
  return f;
}

function wallClock(instant: Millis, timeZone: string) {
  const p = Object.fromEntries(formatterFor(timeZone).formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  return { y: +p.year!, m: +p.month!, d: +p.day!, h: +p.hour!, min: +p.minute!, s: +p.second! };
}

/** Offset (ms) of `timeZone` from UTC at `instant`. */
export function zoneOffsetMs(instant: Millis, timeZone: string): number {
  const w = wallClock(instant, timeZone);
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** "2026-10-26" + "10:00" wall time in `timeZone` -> UTC epoch ms. */
export function zonedWallTimeToUtc(date: string, time: string, timeZone: string = ACADEMIC_TIME_ZONE): Millis {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) throw new RangeError('Expected date YYYY-MM-DD and time HH:mm');
  const guess = Date.UTC(+dm[1]!, +dm[2]! - 1, +dm[3]!, +tm[1]!, +tm[2]!);
  const first = guess - zoneOffsetMs(guess, timeZone);
  const second = guess - zoneOffsetMs(first, timeZone);
  return second;
}

/** UTC epoch ms -> { date: "YYYY-MM-DD", time: "HH:mm" } wall time in `timeZone` (for edit forms). */
export function utcToZonedWallTime(instant: Millis, timeZone: string = ACADEMIC_TIME_ZONE): { date: string; time: string } {
  const w = wallClock(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${w.y}-${pad(w.m)}-${pad(w.d)}`, time: `${pad(w.h)}:${pad(w.min)}` };
}

/** Same calendar day in `timeZone`? */
export function isSameZonedDay(a: Millis, b: Millis, timeZone: string = ACADEMIC_TIME_ZONE): boolean {
  return utcToZonedWallTime(a, timeZone).date === utcToZonedWallTime(b, timeZone).date;
}
