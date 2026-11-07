// QR check-in at the classroom door (IoT extension, Endterm Part D).
// The door display (a tablet/laptop at the entrance) shows a QR code that changes every ROTATE seconds.
// A scan is accepted only while the code is fresh (VALID seconds, checked by Security Rules against
// server time) — a photo sent to a friend at home stops working within a minute.
import type { Millis, SessionType } from './types.ts';
import { secureRandom } from './random.ts';

export const CHECKIN_ROTATE_SECONDS = 20;
/** Current and previous code are accepted for this long after a rotation (covers slow phones). */
export const CHECKIN_VALID_SECONDS = 45;
/** Arriving later than this after the start → suggested status "late". */
export const CHECKIN_LATE_AFTER_MINUTES = 10;
/** Check-in window: from 15 min before the start until 15 min after the end. */
export const CHECKIN_EARLY_MINUTES = 15;
export const CHECKIN_GRACE_AFTER_END_MINUTES = 15;

export const CHECKIN_CODE_RE = /^[0-9]{6}$/;

export function generateCheckinCode(rand: () => number = secureRandom): string {
  return String(Math.floor(rand() * 1_000_000)).padStart(6, '0');
}

export function normalizeCheckinCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, 6);
}

/** Payload encoded in the QR: "offeringId~sessionId~code" (URL-safe, no personal data). */
export function encodeCheckinPayload(offeringId: string, sessionId: string, code: string): string {
  return `${offeringId}~${sessionId}~${code}`;
}

export function decodeCheckinPayload(raw: string | null | undefined): { offeringId: string; sessionId: string; code: string } | null {
  if (!raw) return null;
  const parts = decodeURIComponent(raw).split('~');
  if (parts.length !== 3) return null;
  const [offeringId, sessionId, code] = parts as [string, string, string];
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(offeringId) || !/^[A-Za-z0-9_-]{1,120}$/.test(sessionId) || !CHECKIN_CODE_RE.test(code)) return null;
  return { offeringId, sessionId, code };
}

export function checkinRecordId(sessionId: string, studentUid: string): string {
  return `${sessionId}_${studentUid}`;
}

export interface CheckinWindowSession { startsAt: Millis; durationMinutes: number; status: string }

/** Is `now` inside the window in which a student may check in for this session? */
export function isCheckinWindow(s: CheckinWindowSession, now: Millis): boolean {
  if (s.status === 'cancelled') return false;
  const from = s.startsAt - CHECKIN_EARLY_MINUTES * 60_000;
  const to = s.startsAt + (s.durationMinutes + CHECKIN_GRACE_AFTER_END_MINUTES) * 60_000;
  return now >= from && now <= to;
}

/** Attendance status the teacher is offered for a check-in (the teacher still confirms). */
export function suggestedStatusForCheckin(checkedInAt: Millis, startsAt: Millis): 'present' | 'late' {
  return checkedInAt > startsAt + CHECKIN_LATE_AFTER_MINUTES * 60_000 ? 'late' : 'present';
}

export interface CheckinDTO {
  id: string;
  offeringId: string;
  sessionId: string;
  studentUid: string;
  at: Millis;
  method: 'qr' | 'code' | 'simulated';
}

export interface ScheduledSession {
  sessionId: string;
  startsAt: Millis;
  durationMinutes: number;
  type: SessionType;
  topic: string | null;
  room: string | null;
  status: 'scheduled' | 'held' | 'cancelled';
}
