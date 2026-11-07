import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthProvider.tsx';
import { useI18n } from '../i18n/index.tsx';
import { authErrorKey } from '../errors.ts';
import { showDemoAccounts } from '../firebase.ts';
import { Icon } from '../components/Icon.tsx';
import { Dialog } from '../components/ui.tsx';
import { requestPasswordReset } from '@aitu/data';
import { validateEmail } from '@aitu/domain';

// Must match scripts/seed-data.ts (synthetic accounts).
const DEMO_PASSWORD = 'demo-pass-2026';
const DEMO_TEACHERS = [
  { email: 'admin@demo.aitu.kz', name: 'Администратор Radar', courses: 'Админ-панель: преподаватели, курсы, статистика, резервные копии' },
  { email: 'teacher.math@demo.aitu.kz', name: 'Айгерим Садыкова', courses: 'Calculus 1 · SE-2419, SE-2420' },
  { email: 'teacher.la@demo.aitu.kz', name: 'Ержан Тулегенов', courses: 'Linear Algebra, Discrete Mathematics' },
  { email: 'teacher.se@demo.aitu.kz', name: 'Асхат Нуртаев', courses: 'Programming' },
  { email: 'teacher.eng@demo.aitu.kz', name: 'Лаура Смагулова', courses: 'English' },
];

export function LoginPage() {
  const { state, signIn } = useAuth();
  const { t, lang, setLang } = useI18n();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  if (state.status === 'signed-in') {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await signIn(email, password); } catch (err) { setError(t(authErrorKey(err))); } finally { setBusy(false); }
  };

  return (
    <div className="login">
      <section className="login-panel">
        <div className="login-brand">
          <img className="brand-mark" src="/aitu-mark.svg" width="34" height="34" alt="" />
          <span className="brand-text"><b>{t('appName')}</b><small>{t('appRole')}</small></span>
          <button className="btn btn-ghost btn-sm login-lang" onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}>
            <Icon name="globe" size={16} />{t('langSwitch')}
          </button>
        </div>
        <h1>{t('loginTitle')}</h1>
        <p className="lead">{t('loginLead')}</p>
        <form onSubmit={submit} noValidate>
          <label className="field">
            <span className="field-label">{t('email')}</span>
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">{t('password')}</span>
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="form-error" role="alert"><Icon name="alert" size={16} />{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy || !email || !password}>{busy ? t('signingIn') : t('signIn')}</button>
          <button type="button" className="btn btn-ghost btn-sm login-forgot" onClick={() => setForgot(true)}>{t('forgotPassword')}</button>
        </form>
        <p className="muted small login-note"><Icon name="info" size={14} />{t('loginTeachersNote')}</p>
        {showDemoAccounts && (
          <div className="demo-accounts">
            <h2>{t('demoAccounts')}</h2>
            <p>{t('demoAccountsHint', { p: DEMO_PASSWORD })}</p>
            <ul>
              {DEMO_TEACHERS.map((a) => (
                <li key={a.email}>
                  <button type="button" className="demo-account" onClick={() => { setEmail(a.email); setPassword(DEMO_PASSWORD); }}>
                    <b>{a.name}</b><span>{a.email}</span><small>{a.courses}</small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      {forgot && <ForgotDialog initial={email} onClose={() => setForgot(false)} />}
      <aside className="login-aside" aria-hidden="true">
        <LoginIllustration />
        <p className="demo-note">{t('demoBanner')}</p>
      </aside>
    </div>
  );
}

/** An attendance sheet in miniature: the one thing this portal is about. */
function LoginIllustration() {
  const rows = ['present', 'present', 'late', 'present', 'absent', 'present', 'excused', 'present'];
  const letters: Record<string, string> = { present: 'П', late: 'О', excused: 'У', absent: 'Н' };
  return (
    <div className="login-sheet">
      {rows.map((s, i) => (
        <div key={i} className="login-sheet-row" style={{ animationDelay: `${i * 70}ms` }}>
          <span className="login-sheet-name" style={{ width: `${48 + ((i * 37) % 30)}%` }} />
          <span className={`mark mark-${s}`}><b>{letters[s]}</b></span>
        </div>
      ))}
    </div>
  );
}

/** Same neutral answer for existing and unknown addresses (no account enumeration). */
function ForgotDialog({ initial, onClose }: { initial: string; onClose: () => void }) {
  const { t } = useI18n();
  const [email, setEmail] = useState(initial);
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    if (validateEmail(email, null)) { setError(t('v_emailFormat')); return; }
    setState('busy'); setError(null);
    try { await requestPasswordReset(email); setState('sent'); } catch { setState('idle'); setError(t('errGeneric')); }
  };
  return (
    <Dialog title={t('fpTitle')} onClose={onClose} footer={state === 'sent'
      ? <button className="btn btn-primary" onClick={onClose}>{t('close')}</button>
      : <><button className="btn" onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" disabled={state === 'busy'} onClick={() => void send()}>{t('fpSend')}</button></>}>
      {state === 'sent' ? <p>{t('fpSent', { email: email.trim() })}</p> : (
        <>
          <p>{t('fpText')}</p>
          <label className="field">
            <span className="field-label">{t('email')}</span>
            <input type="email" autoComplete="username" value={email} autoFocus onChange={(e) => { setEmail(e.target.value); setError(null); }} aria-invalid={!!error} />
            {error && <span className="field-error">{error}</span>}
          </label>
        </>
      )}
    </Dialog>
  );
}
