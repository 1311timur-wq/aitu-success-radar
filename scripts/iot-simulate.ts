/**
 * IoT simulation (Endterm Part D3): a classroom door with a QR display + students scanning it.
 * Writes generated readings into the real database every few seconds; the Teacher Portal (door display,
 * attendance sheet) and My DU react live.
 *
 *   npm run iot:simulate -- --offering demo-fall26-math101-se2419 --session today
 *   options: --students 18 (how many arrive)   --minutes 2 (how long the arrival wave lasts)
 *
 * "Device" behaviour: if a real door display is open (token rotated < 25 s ago) the simulator uses ITS code;
 * otherwise the simulator itself rotates a fresh 6-digit code every 20 s, like the display would.
 * Scans are written with method "simulated" so they are never confused with real ones.
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { CHECKIN_ROTATE_SECONDS, generateCheckinCode } from '../packages/domain/src/index.ts';
import { adminApp, option, run } from './admin-app.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

run(async () => {
  const offeringId = option('offering') ?? 'demo-fall26-math101-se2419';
  const sessionId = option('session') ?? 'today';
  const wanted = Number(option('students') ?? 18);
  const minutes = Number(option('minutes') ?? 2);
  const { db, label } = adminApp();

  const off = await db.doc(`offerings/${offeringId}`).get();
  if (!off.exists) throw new Error(`No course ${offeringId}`);
  const ses = await db.doc(`offerings/${offeringId}/sessions/${sessionId}`).get();
  if (!ses.exists) throw new Error(`No session ${sessionId} in ${offeringId}`);
  const students = [...(off.get('studentUids') as string[])].sort(() => Math.random() - 0.5).slice(0, wanted);
  const tokenRef = db.doc(`offerings/${offeringId}/checkinTokens/${sessionId}`);
  console.log(`IoT door simulator → ${label}\n  course ${off.get('courseCode')} ${off.get('groupLabel')}, session ${sessionId}, ${students.length} arrivals over ${minutes} min`);

  let ownCode: string | null = null;
  let ownRotatedAt = 0;
  const currentCode = async (): Promise<string> => {
    const t = await tokenRef.get();
    const rotatedAt = t.exists ? (t.get('rotatedAt') as Timestamp).toMillis() : 0;
    const byDisplay = t.exists && t.get('open') === true && t.get('updatedBy') !== 'iot-simulator' && Date.now() - rotatedAt < 25_000;
    if (byDisplay) return t.get('code') as string;
    if (!ownCode || Date.now() - ownRotatedAt > CHECKIN_ROTATE_SECONDS * 1000) {
      const prev = ownCode;
      ownCode = generateCheckinCode();
      ownRotatedAt = Date.now();
      await tokenRef.set({ sessionId, open: true, code: ownCode, prevCode: prev, rotatedAt: FieldValue.serverTimestamp(), updatedBy: 'iot-simulator' });
      console.log(`  [door] new code ${ownCode}`);
    }
    return ownCode;
  };

  // Most students arrive in the first half of the wave, a few stragglers at the end (→ "late" suggestions).
  const span = minutes * 60_000;
  const arrivals = students.map((uid, i) => ({ uid, at: i < students.length * 0.8 ? Math.random() * span * 0.5 : span * (0.6 + Math.random() * 0.4) }))
    .sort((a, b) => a.at - b.at);
  const t0 = Date.now();
  for (const a of arrivals) {
    while (Date.now() - t0 < a.at) { await currentCode(); await sleep(Math.min(2000, a.at - (Date.now() - t0))); }
    const code = await currentCode();
    const ref = db.doc(`offerings/${offeringId}/checkins/${sessionId}_${a.uid}`);
    if ((await ref.get()).exists) continue;
    await ref.set({ offeringId, sessionId, studentUid: a.uid, code, at: FieldValue.serverTimestamp(), method: 'simulated' });
    console.log(`  [scan] ${new Date().toLocaleTimeString('ru-RU')}  ${a.uid}  code ${code}`);
  }
  if (ownCode) await tokenRef.set({ sessionId, open: false, code: ownCode, prevCode: null, rotatedAt: FieldValue.serverTimestamp(), updatedBy: 'iot-simulator' });
  console.log(`Done: ${arrivals.length} simulated scans. Open the attendance sheet → "Применить QR-отметки".`);
});
