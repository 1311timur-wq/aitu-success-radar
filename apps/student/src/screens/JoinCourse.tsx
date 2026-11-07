// "Вступить в курс": the student types the 6-character code from the teacher (or opens a ?join= link / QR).
// Step 1 looks the code up and shows WHICH course it opens; step 2 joins (one atomic batch, checked by rules).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatJoinCode, normalizeJoinCode } from '@aitu/domain';
import { authErrorKind, emailTrustedFor, joinCourse, lookupJoinCode, refreshEmailVerified, resendVerification, type JoinCodeDTO } from '@aitu/data';
import Icon from '../components/Icon.jsx';
import { useAppCtx } from '../appContext.ts';
import { useSignedInStudent } from '../session.tsx';
import { courseLook } from './Radar.tsx';

type Nav = { pop: () => void; push: (o: Record<string, unknown>) => void; swap?: (o: Record<string, unknown>) => void };

export default function JoinCourse({ nav, initialCode }: { nav: Nav; initialCode?: string }) {
  const { t } = useAppCtx();
  const { profile, radar } = useSignedInStudent();
  const [code, setCode] = useState(initialCode ? formatJoinCode(initialCode) : '');
  const [found, setFound] = useState<JoinCodeDTO | null>(null);
  const [state, setState] = useState<'idle' | 'looking' | 'joining' | 'joined' | 'verify'>('idle');
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const alreadyIn = (offeringId: string) => radar.courses.some((c) => c.offeringId === offeringId);

  const lookup = async (raw: string) => {
    setError(null); setFound(null); setState('looking');
    try {
      const res = await lookupJoinCode(raw);
      if (res.status !== 'ok') { setError(t(`join_${res.status}`)); setState('idle'); return; }
      if (alreadyIn(res.code.offeringId)) { setError(t('join_already', { title: res.code.title })); setState('idle'); return; }
      setFound(res.code); setState('idle');
    } catch {
      setError(t('join_network')); setState('idle');
    }
  };

  useEffect(() => { if (initialCode) void lookup(initialCode); else inputRef.current?.focus(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onType = (v: string) => {
    const c = normalizeJoinCode(v).slice(0, 6);
    setCode(c.length > 3 ? `${c.slice(0, 3)}-${c.slice(3)}` : c);
    setFound(null); setError(null);
  };
  const submitLookup = (e: FormEvent) => { e.preventDefault(); void lookup(code); };
  const join = async () => {
    if (!found) return;
    // Same condition as the Security Rules: an unconfirmed e-mail cannot join (except demo accounts → demo courses).
    if (!emailTrustedFor(found.offeringId)) { setState('verify'); setVerifyMsg(null); return; }
    setState('joining'); setError(null);
    try { await joinCourse(profile, found); setState('joined'); }
    catch { setError(t('join_failed')); setState('idle'); }
  };

  const confirmVerified = async () => {
    setVerifyBusy(true); setVerifyMsg(null);
    try {
      if (await refreshEmailVerified()) { setVerifyBusy(false); await join(); return; }
      setVerifyMsg({ ok: false, text: t('verifyStill') });
    } catch (e) { setVerifyMsg({ ok: false, text: t(`authErr_${authErrorKind(e)}`) }); }
    setVerifyBusy(false);
  };
  const resend = async () => {
    setVerifyBusy(true); setVerifyMsg(null);
    try { await resendVerification(); setVerifyMsg({ ok: true, text: t('verifyResent') }); }
    catch (e) { setVerifyMsg({ ok: false, text: t(`authErr_${(e as { kind?: string }).kind ?? 'unknown'}`) }); }
    setVerifyBusy(false);
  };

  const look = found ? courseLook(found.courseCode) : null;
  return (
    <div className="modal rdr" role="dialog" aria-label={t('joinTitle')} style={{ animation: 'slide 0.25s ease' }}>
      <div className="rhdr">
        <button className="back" onClick={nav.pop} aria-label={t('back')}><Icon name="chevL" size={24} sw={2} /></button>
        <h1>{t('joinTitle')}</h1>
      </div>
      <div className="rbody">
        {state === 'joined' && found ? (
          <div className="join-done">
            <span className="join-done-ic"><Icon name="check" size={34} sw={2.4} /></span>
            <h2>{t('joinDoneTitle')}</h2>
            <p>{t('joinDoneText', { title: found.title, group: found.groupLabel })}</p>
            <button className="cta-btn" onClick={() => (nav.swap ?? nav.push)({ type: 'radar', course: found.offeringId })}>{t('joinOpenRadar')}</button>
            <button className="cta-ghost" onClick={nav.pop}>{t('close')}</button>
          </div>
        ) : (
          <>
            <p className="join-lead">{t('joinLead')}</p>
            <form className="join-form" onSubmit={submitLookup}>
              <label htmlFor="join-code" className="sr-only">{t('joinCodeLabel')}</label>
              <input id="join-code" ref={inputRef} className="join-input" value={code} placeholder="ABC-123" autoComplete="off" autoCapitalize="characters"
                spellCheck={false} inputMode="text" maxLength={7} aria-invalid={!!error || undefined} onChange={(e) => onType(e.target.value)} />
              <button type="submit" className="cta-btn" disabled={normalizeJoinCode(code).length !== 6 || state === 'looking'}>
                {state === 'looking' ? t('joinLooking') : t('joinFind')}
              </button>
            </form>
            {error && <div className="alert bad" role="alert"><span className="ai"><Icon name="alert" size={20} sw={2} /></span><span><b className="bad-t">{error}</b><small>{t('joinErrorHint')}</small></span></div>}
            {found && look && (
              <div className="rcard join-preview">
                <div className="top">
                  <span className="cicon" style={{ background: look.tint }}><Icon name={look.icon} size={22} sw={1.8} /></span>
                  <span className="nm"><b>{found.title}</b><small>{found.courseCode} · {found.groupLabel} · {found.termLabel}</small></span>
                </div>
                {state === 'verify' ? (
                  <div className="verify-box" role="status">
                    <span className="verify-ic"><Icon name="mail" size={24} sw={2} /></span>
                    <b>{t('verifyTitle')}</b>
                    <p className="muted-p">{t('verifyText', { email: profile.email })}</p>
                    {verifyMsg && <p className={verifyMsg.ok ? 'verify-msg ok' : 'verify-msg bad'}>{verifyMsg.text}</p>}
                    <button className="cta-btn" onClick={() => void confirmVerified()} disabled={verifyBusy}>{verifyBusy ? t('verifyChecking') : t('verifyDone')}</button>
                    <button className="cta-ghost" onClick={() => void resend()} disabled={verifyBusy}>{t('verifyResend')}</button>
                  </div>
                ) : (
                  <>
                    <p className="muted-p">{t('joinPreviewText')}</p>
                    <button className="cta-btn" onClick={() => void join()} disabled={state === 'joining'}>{state === 'joining' ? t('joinJoining') : t('joinConfirm')}</button>
                  </>
                )}
              </div>
            )}
            <div className="join-help">
              <Icon name="info" size={16} sw={2} />
              <span>{t('joinHelp')}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
