/**
 * End-to-end check from the STUDENT side, through the real client SDK, rules and data layer:
 * signs in as a demo student, prints their live Radar, and proves the isolation rules hold.
 *   npm run check:student                       (default: student01)
 *   npm run check:student -- student05@demo.aitu.kz
 * Leave it running and publish attendance in the Teacher Portal: the Radar reprints live.
 */
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { initFirebase, watchStudentRadar, type RadarState } from '../packages/data/src/index.ts';
import { firebaseTarget, projectId } from './env.ts';
import { SEED_PASSWORD, STUDENTS } from './seed-data.ts';

const email = process.argv[2] ?? STUDENTS[0]!.email;
const { auth, db } = initFirebase(firebaseTarget);
console.log(`Target: ${firebaseTarget.useEmulators ? 'local emulator' : `cloud project ${projectId}`}`);

const LABEL = { high: 'HIGH   ', medium: 'MEDIUM ', low: 'LOW    ', unknown: 'UNKNOWN' } as const;
const pct = (v: number | null) => (v == null ? '  —' : `${Math.round(v)}%`.padStart(4));

function print(state: RadarState) {
  if (state.status !== 'ready') { console.log(state.status === 'error' ? `error: ${state.error?.kind}` : 'loading…'); return; }
  const { counts, ordered, focus } = state.summary;
  console.log(`\n[${new Date().toLocaleTimeString('ru-RU')}] ${email}${state.stale ? ' (offline cache)' : ''}`);
  console.log(`  high ${counts.high} · medium ${counts.medium} · low ${counts.low} · unknown ${counts.unknown}${focus ? `   focus: ${focus.title}` : ''}`);
  for (const c of ordered) {
    const m = c.risk.metrics;
    console.log(`  ${LABEL[c.risk.level]} ${c.title.padEnd(16)} attendance ${pct(m.attendancePercent)}  recent ${pct(m.recentGradePercent)}  overdue ${m.overdueCount}  ${c.risk.reasons.map((r) => r.code).join(', ')}`);
    if (c.risk.actions.length) console.log(`          actions: ${c.risk.actions.join(', ')}`);
  }
}

async function expectDenied(label: string, op: () => Promise<unknown>) {
  try { await op(); console.error(`  FAIL  ${label}: was allowed`); process.exitCode = 1; }
  catch (e) { const code = (e as { code?: string }).code ?? ''; console.log(`  ok    ${label} -> ${code || 'denied'}`); }
}

async function main() {
  const cred = await signInWithEmailAndPassword(auth, email, SEED_PASSWORD);
  const uid = cred.user.uid;
  const other = STUDENTS.find((s) => s.uid !== uid)!;

  console.log('Isolation checks:');
  await expectDenied("read another student's attendance", () => getDoc(doc(db, 'offerings', 'demo-fall26-math101-se2419', 'attendanceRecords', `w1-1_${other.uid}`)));
  await expectDenied('read own DRAFT grade (Quiz 2)', () => getDoc(doc(db, 'offerings', 'demo-fall26-math101-se2419', 'assessmentRecords', `quiz2_${uid}`)));
  await expectDenied('write own grade', () => setDoc(doc(db, 'offerings', 'demo-fall26-math101-se2419', 'assessmentRecords', `quiz1_${uid}`), {
    offeringId: 'demo-fall26-math101-se2419', assessmentId: 'quiz1', studentUid: uid, submission: 'submitted', gradeState: 'graded', points: 100, maxPoints: 100,
    feedback: '', publication: 'published', revision: 3, updatedBy: uid, updatedAt: serverTimestamp(), correction: null,
  }));
  await expectDenied('read audit trail', () => getDoc(doc(db, 'offerings', 'demo-fall26-math101-se2419', 'audit', 'x')));

  const started = Date.now();
  let firstReady = true;
  watchStudentRadar(uid, (s) => {
    if (s.status === 'ready' && firstReady) { firstReady = false; console.log(`\nRadar ready in ${Date.now() - started} ms (SC3 target <= 5000 ms)`); }
    print(s);
  });
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
