// "Door display": a tablet or laptop at the classroom entrance (the IoT device of Endterm Part D).
// Shows a QR code that changes every 20 s. Students scan it with the phone camera → My DU checks them in.
// Privacy: the screen faces the corridor, so it shows only a COUNT, never names.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { CHECKIN_ROTATE_SECONDS, encodeCheckinPayload } from '@aitu/domain';
import {
  closeCheckin, rotateCheckinCode, submitCheckin, watchCheckins, watchEnrollments, watchOffering, watchSessions,
} from '@aitu/data';
import { useTeacher } from '../auth/AuthProvider.tsx';
import { useI18n } from '../i18n/index.tsx';
import { useLive } from '../hooks/useLive.ts';
import { Icon } from '../components/Icon.tsx';
import { QrCode } from '../components/QrCode.tsx';
import { LoadingBlock } from '../components/ui.tsx';
import { formatDateLong, formatTimeRange } from '../format.ts';

const OFFLINE_DEMO = import.meta.env.MODE === 'offline';

/** Where My DU lives: same site under /my-du/ (Firebase Hosting); in local dev the student app runs on :5173. */
export function studentAppUrl(): string {
  const configured = import.meta.env.FIREBASE_MYDU_URL as string | undefined;
  if (configured) return configured.endsWith('/') ? configured : `${configured}/`;
  if (location.port === '5174') return `${location.protocol}//${location.hostname}:5173/`;
  return `${location.origin}/my-du/`;
}

export function DoorDisplayPage() {
  const { offeringId = '', sessionId = '' } = useParams();
  const { uid } = useTeacher();
  const { t, locale } = useI18n();
  const offering = useLive(watchOffering, offeringId);
  const sessions = useLive(watchSessions, offeringId);
  const roster = useLive(watchEnrollments, offeringId);
  const checkins = useLive(watchCheckins, offeringId, sessionId);
  const [code, setCode] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<string | null>(null);
  const rotatedAt = useRef(0);

  const session = sessions.status === 'ready' ? sessions.data.find((s) => s.id === sessionId) ?? null : null;
  const enrolled = roster.status === 'ready' ? roster.data.filter((r) => r.status === 'active').length : 0;
  const count = checkins.status === 'ready' ? checkins.data.length : 0;

  const rotate = useCallback(async (first: boolean) => {
    try {
      const next = await rotateCheckinCode(offeringId, sessionId, codeRef.current, uid, { firstOpen: first });
      codeRef.current = next; setCode(next); rotatedAt.current = Date.now(); setError(null);
    } catch {
      setError(t('doorError'));
    }
  }, [offeringId, sessionId, uid, t]);

  // Rotation loop + 1 s ticker for the countdown ring.
  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      setTick((x) => x + 1);
      if (Date.now() - rotatedAt.current >= CHECKIN_ROTATE_SECONDS * 1000) void rotate(false);
    }, 1000);
    return () => clearInterval(iv);
  }, [running, rotate]);

  // Leaving the page closes the check-in (and the codes would expire within 45 s anyway).
  useEffect(() => () => { if (codeRef.current) void closeCheckin(offeringId, sessionId, codeRef.current, uid).catch(() => {}); }, [offeringId, sessionId, uid]);

  const start = async () => {
    setRunning(true);
    await rotate(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const stop = async () => {
    setRunning(false);
    if (codeRef.current) await closeCheckin(offeringId, sessionId, codeRef.current, uid).catch(() => setError(t('doorError')));
    codeRef.current = null; setCode(null);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  };

  // Offline demo only (no Security Rules there): simulate students scanning, to rehearse without phones.
  const simulate = async () => {
    if (!code || roster.status !== 'ready') return;
    const done = new Set(checkins.status === 'ready' ? checkins.data.map((c) => c.studentUid) : []);
    const todo = roster.data.filter((r) => r.status === 'active' && !done.has(r.studentUid)).slice(0, 6);
    for (const r of todo) { await submitCheckin(offeringId, sessionId, r.studentUid, codeRef.current ?? code, 'qr'); await new Promise((res) => setTimeout(res, 350)); }
  };

  const url = useMemo(() => (code ? `${studentAppUrl()}?checkin=${encodeURIComponent(encodeCheckinPayload(offeringId, sessionId, code))}` : ''), [code, offeringId, sessionId]);
  const left = running && code ? Math.max(0, CHECKIN_ROTATE_SECONDS - Math.floor((Date.now() - rotatedAt.current) / 1000)) : CHECKIN_ROTATE_SECONDS;
  void tick;

  if (offering.status === 'loading' || sessions.status === 'loading') return <main className="door"><LoadingBlock /></main>;
  if (offering.status === 'error' || !offering.data || !session) {
    return <main className="door door-center"><p>{t('doorNoSession')}</p><Link className="btn" to={`/courses/${offeringId}/attendance`}>{t('back')}</Link></main>;
  }
  const pct = enrolled ? Math.round((count / enrolled) * 100) : 0;

  return (
    <main className={'door' + (running ? ' is-running' : '')} aria-live="polite">
      <header className="door-head">
        <Link to={`/courses/${offeringId}/attendance/${sessionId}`} className="door-back" onClick={() => void stop()}><Icon name="chevronLeft" size={18} />{t('doorBackToSheet')}</Link>
        <span className="door-brand"><img src="/aitu-mark.svg" width="28" height="28" alt="" />Student Success Radar</span>
        <button className="door-icon-btn" onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen?.())} aria-label={t('doorFullscreen')}><Icon name="maximize" size={20} /></button>
      </header>

      <section className="door-main">
        <div className="door-qr-box">
          {running && code ? (
            <>
              <QrCode value={url} size={420} label={t('doorQrLabel')} />
              <div className="door-timer" style={{ ['--p' as string]: `${(left / CHECKIN_ROTATE_SECONDS) * 100}%` }}><span>{left}</span></div>
            </>
          ) : (
            <div className="door-idle">
              <Icon name="qr" size={72} />
              <p>{t('doorIdle')}</p>
              <button className="btn btn-primary btn-lg" onClick={() => void start()}><Icon name="play" size={18} />{t('doorStart')}</button>
            </div>
          )}
        </div>

        <div className="door-info">
          <p className="door-kicker">{offering.data.courseCode} · {offering.data.groupLabel}</p>
          <h1>{offering.data.title}</h1>
          <p className="door-when">{formatDateLong(session.startsAt, locale)}, {formatTimeRange(session.startsAt, session.durationMinutes, locale)}{session.room ? ` · ${session.room}` : ''}</p>
          <ol className="door-steps">
            <li>{t('doorStep1')}</li>
            <li>{t('doorStep2')}</li>
          </ol>
          <div className="door-code" aria-label={t('doorCodeLabel')}>
            <span>{t('doorCodeLabel')}</span>
            <b>{running && code ? `${code.slice(0, 3)} ${code.slice(3)}` : '— — —'}</b>
          </div>
          <div className="door-count">
            <div className="door-count-n"><b>{count}</b><span>/ {enrolled}</span></div>
            <span>{t('doorCheckedIn')}</span>
            <div className="door-bar"><i style={{ width: `${pct}%` }} /></div>
          </div>
          {error && <p className="door-error" role="alert"><Icon name="alert" size={16} />{error}</p>}
          {running && (
            <div className="door-actions">
              <button className="btn" onClick={() => void stop()}><Icon name="stop" size={16} />{t('doorStop')}</button>
              {OFFLINE_DEMO && <button className="btn" onClick={() => void simulate()}><Icon name="users" size={16} />{t('doorSimulate')}</button>}
            </div>
          )}
          <p className="door-privacy"><Icon name="shield" size={14} />{t('doorPrivacy')}</p>
        </div>
      </section>
    </main>
  );
}

