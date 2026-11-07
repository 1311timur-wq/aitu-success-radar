// QR check-in (IoT extension). The door display rotates a 6-digit code every 20 s; a student's phone
// sends the scanned code; Security Rules accept it only while it is fresh (server time) and only once.
import { doc, getDoc, query, serverTimestamp, setDoc, where, writeBatch, type Unsubscribe } from 'firebase/firestore';
import { generateCheckinCode, type CheckinDTO } from '@aitu/domain';
import { firebase } from './firebase.ts';
import { refs } from './paths.ts';
import { toCheckin, toCheckinToken, type CheckinTokenDTO } from './converters.ts';
import { toDataError } from './errors.ts';
import { watchDoc, watchQuery, type Live, type OnError } from './live.ts';

const r = () => refs(firebase().db);

// ---------------------------------------------------------------- teacher / door display
export const watchCheckins = (o: string, sessionId: string, next: (v: Live<CheckinDTO[]>) => void, onError: OnError): Unsubscribe =>
  watchQuery(query(r().checkins(o), where('sessionId', '==', sessionId)), toCheckin,
    (v) => next({ ...v, data: [...v.data].sort((a, b) => a.at - b.at) }), onError);

export const watchCheckinToken = (o: string, sessionId: string, next: (v: Live<CheckinTokenDTO | null>) => void, onError: OnError): Unsubscribe =>
  watchDoc(r().checkinToken(o, sessionId), toCheckinToken, next, onError);

/** Opens (or keeps open) the check-in with a NEW code; the previous code stays valid ~45 s. Returns the new code. */
export async function rotateCheckinCode(o: string, sessionId: string, prevCode: string | null, actorUid: string, opts: { firstOpen?: boolean } = {}): Promise<string> {
  const code = generateCheckinCode();
  try {
    if (opts.firstOpen) {
      const b = writeBatch(firebase().db);
      b.set(r().checkinToken(o, sessionId), { sessionId, open: true, code, prevCode, rotatedAt: serverTimestamp(), updatedBy: actorUid });
      b.set(doc(r().audit(o)), { type: 'checkin.opened', actorUid, at: serverTimestamp(), targetPath: `offerings/${o}/sessions/${sessionId}`, reason: null, details: {} });
      await b.commit();
    } else {
      await setDoc(r().checkinToken(o, sessionId), { sessionId, open: true, code, prevCode, rotatedAt: serverTimestamp(), updatedBy: actorUid });
    }
  } catch (e) {
    throw toDataError(e);
  }
  return code;
}

/** Closes the check-in: no code is accepted any more (even a fresh photo of the QR). */
export async function closeCheckin(o: string, sessionId: string, lastCode: string, actorUid: string): Promise<void> {
  const b = writeBatch(firebase().db);
  b.set(r().checkinToken(o, sessionId), { sessionId, open: false, code: lastCode, prevCode: null, rotatedAt: serverTimestamp(), updatedBy: actorUid });
  b.set(doc(r().audit(o)), { type: 'checkin.closed', actorUid, at: serverTimestamp(), targetPath: `offerings/${o}/sessions/${sessionId}`, reason: null, details: {} });
  try { await b.commit(); } catch (e) { throw toDataError(e); }
}

// ---------------------------------------------------------------- student
export type CheckinResult = 'ok' | 'already' | 'rejected' | 'offline';

/**
 * 'rejected' = wrong or expired code, check-in closed, or the student is not in this course
 * (Security Rules do not say which — and the UI must not guess either).
 */
export async function submitCheckin(o: string, sessionId: string, studentUid: string, code: string, method: 'qr' | 'code'): Promise<CheckinResult> {
  const ref = r().checkin(o, sessionId, studentUid);
  try {
    const existing = await getDoc(ref).catch(() => null);
    if (existing?.exists()) return 'already';
    await setDoc(ref, { offeringId: o, sessionId, studentUid, code, at: serverTimestamp(), method });
    return 'ok';
  } catch (e) {
    const err = toDataError(e);
    return err.kind === 'unavailable' ? 'offline' : 'rejected';
  }
}

export const watchMyCheckins = (o: string, studentUid: string, next: (v: Live<CheckinDTO[]>) => void, onError: OnError): Unsubscribe =>
  watchQuery(query(r().checkins(o), where('studentUid', '==', studentUid)), toCheckin, next, onError);
