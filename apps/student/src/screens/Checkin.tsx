// QR check-in at the classroom door. Two ways in:
//  1) the phone camera scans the door QR → My DU opens with ?checkin=… → sent automatically;
//  2) manual: pick the current class and type the 6-digit code shown under the QR.
// The server decides (Security Rules): fresh code + enrolled student + one check-in per class.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ACADEMIC_TIME_ZONE, isCheckinWindow, isSameZonedDay, normalizeCheckinCode, type CourseHealth } from '@aitu/domain';
import { submitCheckin, type CheckinResult } from '@aitu/data';
import Icon from '../components/Icon.jsx';
import { useAppCtx } from '../appContext.ts';
import { useSignedInStudent } from '../session.tsx';
import { courseLook } from './Radar.tsx';

type Nav = { pop: () => void };
interface Target { offeringId: string; sessionId: string }

function useTimeFmt(lang: string) {
  return useMemo(() => new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ru-RU', { timeZone: ACADEMIC_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), [lang]);
}

function sessionOf(courses: readonly CourseHealth[], t: Target) {
  const c = courses.find((x) => x.offeringId === t.offeringId);
  return { course: c ?? null, session: c?.schedule.find((s) => s.sessionId === t.sessionId) ?? null };
}

export default function Checkin({ nav, scanned }: { nav: Nav; scanned?: { offeringId: string; sessionId: string; code: string } }) {
  const { t, lang } = useAppCtx();
  const { profile, radar } = useSignedInStudent();
  const fmt = useTimeFmt(lang);
  const [target, setTarget] = useState<Target | null>(scanned ? { offeringId: scanned.offeringId, sessionId: scanned.sessionId } : null);
  const [code, setCode] = useState(scanned?.code ?? '');
  const [state, setState] = useState<'idle' | 'sending' | CheckinResult>('idle');
  const [at, setAt] = useState<number | null>(null);
  const sentOnce = useRef(false);

  const now = Date.now();
  // Classes open for check-in right now (15 min before … 15 min after); otherwise today's classes.
  const choices = useMemo(() => {
    const all = radar.courses.flatMap((c) => c.schedule.map((s) => ({ c, s })));
    const open = all.filter(({ s }) => isCheckinWindow(s, now));
    return (open.length ? open : all.filter(({ s }) => isSameZonedDay(s.startsAt, now))).sort((a, b) => a.s.startsAt - b.s.startsAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radar.courses]);

  const send = async (tg: Target, c: string, method: 'qr' | 'code') => {
    setState('sending');
    const res = await submitCheckin(tg.offeringId, tg.sessionId, profile.uid, c, method);
    if (res === 'ok') setAt(Date.now());
    setState(res);
  };

  // Scanned QR: send at once (codes live ~45 s), as soon as the Radar knows the student's courses.
  useEffect(() => {
    if (!scanned || sentOnce.current || radar.status !== 'ready') return;
    sentOnce.current = true;
    void send({ offeringId: scanned.offeringId, sessionId: scanned.sessionId }, scanned.code, 'qr');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanned, radar.status]);

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    if (target && code.length === 6) void send(target, code, 'code');
  };

  const info = target ? sessionOf(radar.courses, target) : null;
  const look = info?.course ? courseLook(info.course.courseCode) : null;
  const done = state === 'ok' || state === 'already';

  return (
    <div className="modal rdr" role="dialog" aria-label={t('ciTitle')} style={{ animation: 'slide 0.25s ease' }}>
      <div className="rhdr">
        <button className="back" onClick={nav.pop} aria-label={t('back')}><Icon name="chevL" size={24} sw={2} /></button>
        <h1>{t('ciTitle')}</h1>
      </div>
      <div className="rbody">
        {info?.course && look && (
          <div className="rcard ci-course">
            <span className="cicon" style={{ background: look.tint }}><Icon name={look.icon} size={22} sw={1.8} /></span>
            <span className="nm"><b>{info.course.title}</b>
              <small>{info.session ? `${fmt.format(info.session.startsAt)}${info.session.room ? ` · ${info.session.room}` : ''}` : info.course.courseCode}</small></span>
          </div>
        )}

        {state === 'sending' && <div className="ci-state"><span className="ci-spin" aria-hidden="true" /><p>{t('ciSending')}</p></div>}

        {done && (
          <div className="ci-state ok" role="status">
            <span className="ci-big ok"><Icon name="check" size={40} sw={2.6} /></span>
            <h2>{state === 'already' ? t('ciAlready') : t('ciOk')}</h2>
            <p>{state === 'ok' && at ? t('ciOkText', { time: new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ru-RU', { timeZone: ACADEMIC_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at) }) : t('ciAlreadyText')}</p>
            <button className="cta-btn" onClick={nav.pop}>{t('close')}</button>
          </div>
        )}

        {(state === 'rejected' || state === 'offline') && (
          <div className="alert bad" role="alert">
            <span className="ai"><Icon name="alert" size={20} sw={2} /></span>
            <span><b className="bad-t">{state === 'offline' ? t('ciOffline') : t('ciRejected')}</b><small>{state === 'offline' ? t('ciOfflineText') : t('ciRejectedText')}</small></span>
          </div>
        )}

        {!done && state !== 'sending' && (
          <form className="ci-manual" onSubmit={submitManual}>
            <div className="rsec"><h2>{scanned ? t('ciRetry') : t('ciManual')}</h2></div>
            {choices.length === 0 ? (
              <div className="note" style={{ textAlign: 'left' }}>{radar.courses.length ? t('ciNoClasses') : t('ciNoCourses')}</div>
            ) : (
              <div className="group">
                {choices.map(({ c, s }) => {
                  const sel = target?.offeringId === c.offeringId && target.sessionId === s.sessionId;
                  return (
                    <button type="button" key={`${c.offeringId}/${s.sessionId}`} className={'lrow ci-choice' + (sel ? ' sel' : '')} aria-pressed={sel}
                      onClick={() => { setTarget({ offeringId: c.offeringId, sessionId: s.sessionId }); setState('idle'); }}>
                      <span className="ci-radio" aria-hidden="true">{sel && <i />}</span>
                      <span className="lt"><b>{c.title}</b><small>{fmt.format(s.startsAt)}{s.room ? ` · ${s.room}` : ''}</small></span>
                      {isCheckinWindow(s, now) && <span className="ci-now">{t('ciNow')}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            <label htmlFor="ci-code" className="ci-label">{t('ciCodeLabel')}</label>
            <input id="ci-code" className="join-input ci-code" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6}
              value={code} onChange={(e) => { setCode(normalizeCheckinCode(e.target.value)); if (state !== 'idle') setState('idle'); }} />
            <button type="submit" className="cta-btn" disabled={!target || code.length !== 6}>{t('ciSend')}</button>
            <div className="join-help"><Icon name="qr" size={16} sw={2} /><span>{t('ciHelp')}</span></div>
          </form>
        )}
      </div>
    </div>
  );
}
