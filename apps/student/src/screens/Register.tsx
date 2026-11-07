// Student self-registration (corporate e-mail), "forgot password", and finishing an interrupted registration.
// Validation runs on every field as the student types (same rules as Firestore Security Rules).
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  checkPassword, normalizeGroup, PROGRAMS, programFromGroup, validateEmail, validateFullName, validateGroup, validateProgram,
  validateRegistration, validateStudentNumber, ALLOWED_EMAIL_DOMAINS, type StudentRegistration, type ValidationCode,
} from '@aitu/domain';
import { authErrorKind, requestPasswordReset } from '@aitu/data';
import Icon from '../components/Icon.jsx';
import { useAppCtx } from '../appContext.ts';
import { useStudentSession } from '../session.tsx';

const A = './assets/';
type T = ReturnType<typeof useAppCtx>['t'];

const errText = (t: T, code: ValidationCode | undefined | null) => (code ? t(`v_${code}`, { domain: ALLOWED_EMAIL_DOMAINS[0] }) : '');

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className={'reg-field' + (error ? ' has-error' : '')}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <span className="reg-err" id={`${id}-err`} role="alert">{error}</span> : hint ? <span className="reg-hint" id={`${id}-hint`}>{hint}</span> : null}
    </div>
  );
}

function PasswordInput({ id, value, onChange, onBlur, invalid, autoComplete, placeholder }: {
  id: string; value: string; onChange: (v: string) => void; onBlur?: () => void; invalid?: boolean; autoComplete: string; placeholder?: string;
}) {
  const { t } = useAppCtx();
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input id={id} type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value} placeholder={placeholder}
        aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
      <button type="button" className="pw-eye" onClick={() => setShow(!show)} aria-label={show ? t('hidePassword') : t('showPassword')}>
        <Icon name={show ? 'eyeOff' : 'eye'} size={20} sw={1.7} />
      </button>
    </div>
  );
}

function StrengthMeter({ score }: { score: number }) {
  const { t } = useAppCtx();
  const label = [t('pwWeak'), t('pwWeak'), t('pwFair'), t('pwGood'), t('pwStrong')][score];
  return (
    <div className="pw-meter" aria-label={`${t('pwStrength')}: ${label}`}>
      {[1, 2, 3, 4].map((i) => <i key={i} className={i <= score ? `on s${score}` : ''} />)}
      <span>{label}</span>
    </div>
  );
}

const EMPTY: StudentRegistration = { fullName: '', email: '', password: '', passwordRepeat: '', program: '', groupLabel: '', studentNumber: '', consent: false };

export function Register({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { t } = useAppCtx();
  const { register } = useStudentSession();
  const [f, setF] = useState<StudentRegistration>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof StudentRegistration, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = useMemo(() => validateRegistration(f), [f]);
  const show = (k: keyof StudentRegistration) => (submitted || touched[k] ? errText(t, errors[k]) : '');
  const set = <K extends keyof StudentRegistration>(k: K, v: StudentRegistration[K]) => {
    setF((x) => {
      const next = { ...x, [k]: v };
      // "SE-2419" → Software Engineering is suggested until the student picks a direction himself.
      if (k === 'groupLabel' && !x.program) { const p = programFromGroup(String(v)); if (p) next.program = p; }
      return next;
    });
    setError(null);
  };
  const blur = (k: keyof StudentRegistration) => () => setTouched((x) => ({ ...x, [k]: true }));
  const pw = checkPassword(f.password, f.email);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) {
      document.querySelector<HTMLElement>('.reg-field.has-error input, .reg-field.has-error select')?.focus();
      return;
    }
    setBusy(true); setError(null);
    try {
      await register({ ...f, groupLabel: normalizeGroup(f.groupLabel) });
      onDone();
    } catch (err) {
      const kind = authErrorKind(err);
      setError(t(`authErr_${kind}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen login login-real register">
      <button className="reg-back" onClick={onBack} type="button"><Icon name="arrowL" size={22} sw={2} />{t('back')}</button>
      <img className="logo" src={A + 'logo-white.webp'} width="304" height="160" alt="Astana IT University" />
      <h1>{t('regTitle')}</h1>
      <div className="sub">{t('regSub')}</div>
      <form className="auth auth-form reg-form" onSubmit={submit} noValidate>
        <Field id="r-name" label={t('regName')} error={show('fullName')}>
          <input id="r-name" autoComplete="name" value={f.fullName} placeholder={t('regNamePh')} aria-invalid={!!show('fullName') || undefined}
            onChange={(e) => set('fullName', e.target.value)} onBlur={blur('fullName')} />
        </Field>
        <Field id="r-email" label={t('regEmail')} error={show('email')} hint={t('regEmailHint')}>
          <input id="r-email" type="email" inputMode="email" autoComplete="email" value={f.email} placeholder="241913@astanait.edu.kz"
            aria-invalid={!!show('email') || undefined} onChange={(e) => set('email', e.target.value)} onBlur={blur('email')} />
        </Field>
        <div className="reg-row">
          <Field id="r-group" label={t('regGroup')} error={show('groupLabel')}>
            <input id="r-group" autoComplete="off" autoCapitalize="characters" value={f.groupLabel} placeholder="SE-2419"
              aria-invalid={!!show('groupLabel') || undefined} onChange={(e) => set('groupLabel', e.target.value)}
              onBlur={() => { blur('groupLabel')(); if (!validateGroup(f.groupLabel)) set('groupLabel', normalizeGroup(f.groupLabel)); }} />
          </Field>
          <Field id="r-num" label={t('regNumber')} error={show('studentNumber')}>
            <input id="r-num" inputMode="numeric" autoComplete="off" value={f.studentNumber} placeholder="241913" maxLength={10}
              aria-invalid={!!show('studentNumber') || undefined} onChange={(e) => set('studentNumber', e.target.value.replace(/\D/g, ''))} onBlur={blur('studentNumber')} />
          </Field>
        </div>
        <Field id="r-prog" label={t('regProgram')} error={show('program')}>
          <select id="r-prog" value={f.program} aria-invalid={!!show('program') || undefined} onChange={(e) => set('program', e.target.value)} onBlur={blur('program')}>
            <option value="" disabled>{t('regProgramPh')}</option>
            {PROGRAMS.map((p) => <option key={p.id} value={p.id}>{p.id === 'other' ? t('regProgramOther') : p.label}</option>)}
          </select>
        </Field>
        <Field id="r-pw" label={t('regPassword')} error={show('password')} hint={f.password ? undefined : t('regPasswordHint')}>
          <PasswordInput id="r-pw" autoComplete="new-password" value={f.password} invalid={!!show('password')} onChange={(v) => set('password', v)} onBlur={blur('password')} />
          {f.password && <StrengthMeter score={pw.code ? Math.min(pw.score, 1) : Math.max(pw.score, 2)} />}
        </Field>
        <Field id="r-pw2" label={t('regPassword2')} error={show('passwordRepeat')}>
          <PasswordInput id="r-pw2" autoComplete="new-password" value={f.passwordRepeat} invalid={!!show('passwordRepeat')}
            onChange={(v) => set('passwordRepeat', v)} onBlur={blur('passwordRepeat')} />
        </Field>
        <label className={'check-row' + (show('consent') ? ' has-error' : '')}>
          <input type="checkbox" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} />
          <span>{t('regConsent')}</span>
        </label>
        {show('consent') && <span className="reg-err" role="alert">{show('consent')}</span>}
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button type="submit" className="auth-primary" disabled={busy}>{busy ? t('regBusy') : t('regSubmit')}</button>
      </form>
      <div className="legal">{t('regLegal')}</div>
    </div>
  );
}

/** "Забыли пароль?" — neutral answer whether or not the address exists (no account enumeration). */
export function ForgotPassword({ initialEmail, onClose }: { initialEmail: string; onClose: () => void }) {
  const { t } = useAppCtx();
  const [email, setEmail] = useState(initialEmail);
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const invalid = validateEmail(email, null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (invalid) { setError(errText(t, invalid)); return; }
    setState('busy'); setError(null);
    try { await requestPasswordReset(email); setState('sent'); }
    catch (err) { setState('idle'); setError(t(`authErr_${authErrorKind(err)}`)); }
  };
  return (
    <div className="scrim" onClick={onClose}>
      <form className="sheet-card" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate role="dialog" aria-labelledby="fp-title">
        <h3 id="fp-title">{t('fpTitle')}</h3>
        {state === 'sent' ? (
          <>
            <p className="sheet-p"><Icon name="mail" size={18} /> {t('fpSent', { email: email.trim() })}</p>
            <button type="button" className="sheet-primary" onClick={onClose}>{t('close')}</button>
          </>
        ) : (
          <>
            <p className="sheet-p">{t('fpText')}</p>
            <input className="sheet-input" type="email" inputMode="email" autoComplete="email" value={email} autoFocus
              aria-label={t('emailPh')} placeholder={t('emailPh')} onChange={(e) => { setEmail(e.target.value); setError(null); }} />
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button type="submit" className="sheet-primary" disabled={state === 'busy'}>{state === 'busy' ? t('regBusy') : t('fpSend')}</button>
            <button type="button" className="sheet-secondary" onClick={onClose}>{t('cancel')}</button>
          </>
        )}
      </form>
    </div>
  );
}

/** Signed in, but the profile document is missing (registration was interrupted): ask only for the profile part. */
export function CompleteProfile() {
  const { t } = useAppCtx();
  const { completeProfile, signOut, session } = useStudentSession();
  const [f, setF] = useState({ fullName: '', program: '', groupLabel: '', studentNumber: '' });
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errs = {
    fullName: validateFullName(f.fullName), program: validateProgram(f.program),
    groupLabel: validateGroup(f.groupLabel), studentNumber: validateStudentNumber(f.studentNumber),
  };
  const show = (k: keyof typeof errs) => (submitted ? errText(t, errs[k]) : '');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true); setError(null);
    try { await completeProfile({ ...f, groupLabel: normalizeGroup(f.groupLabel) }); }
    catch { setError(t('authErr_profile-write')); }
    finally { setBusy(false); }
  };
  const email = session.status === 'needs-profile' ? session.user.email : '';
  return (
    <div className="screen login login-real register">
      <img className="logo" src={A + 'logo-white.webp'} width="304" height="160" alt="Astana IT University" />
      <h1>{t('cpTitle')}</h1>
      <div className="sub">{t('cpSub', { email: email ?? '' })}</div>
      <form className="auth auth-form reg-form" onSubmit={submit} noValidate>
        <Field id="c-name" label={t('regName')} error={show('fullName')}>
          <input id="c-name" value={f.fullName} placeholder={t('regNamePh')} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
        </Field>
        <div className="reg-row">
          <Field id="c-group" label={t('regGroup')} error={show('groupLabel')}>
            <input id="c-group" value={f.groupLabel} placeholder="SE-2419" onChange={(e) => setF({ ...f, groupLabel: e.target.value, program: f.program || programFromGroup(e.target.value) || '' })} />
          </Field>
          <Field id="c-num" label={t('regNumber')} error={show('studentNumber')}>
            <input id="c-num" inputMode="numeric" value={f.studentNumber} placeholder="241913" onChange={(e) => setF({ ...f, studentNumber: e.target.value.replace(/\D/g, '') })} />
          </Field>
        </div>
        <Field id="c-prog" label={t('regProgram')} error={show('program')}>
          <select id="c-prog" value={f.program} onChange={(e) => setF({ ...f, program: e.target.value })}>
            <option value="" disabled>{t('regProgramPh')}</option>
            {PROGRAMS.map((p) => <option key={p.id} value={p.id}>{p.id === 'other' ? t('regProgramOther') : p.label}</option>)}
          </select>
        </Field>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button type="submit" className="auth-primary" disabled={busy}>{busy ? t('regBusy') : t('cpSubmit')}</button>
        <button type="button" onClick={() => void signOut()}>{t('logout')}</button>
      </form>
    </div>
  );
}
