// Password change. `forced`: first sign-in of a teacher created by an administrator (temporary password).
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { checkPassword } from '@aitu/domain';
import { authErrorKind, changeOwnPassword } from '@aitu/data';
import { useAuth, useTeacher } from '../auth/AuthProvider.tsx';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { Icon } from '../components/Icon.tsx';
import { useToast } from '../components/ui.tsx';

export function ChangePasswordPage({ forced = false }: { forced?: boolean }) {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const { profile } = useTeacher();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const pw = checkPassword(next, profile.email);
  const sameAsOld = next.length > 0 && next === current;
  const errNext = pw.code ? t(`v_${pw.code}` as MessageKey) : sameAsOld ? t('pwSameAsOld') : null;
  const errRepeat = !errNext && next !== repeat ? t('v_passwordMismatch') : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!current || errNext || errRepeat) return;
    setBusy(true); setError(null);
    try {
      await changeOwnPassword(current, next, { clearMustChange: profile.mustChangePassword });
      setDone(true);
      toast(t('pwChanged'));
    } catch (err) {
      setError(t(`authErr_${authErrorKind(err)}` as MessageKey));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main" className="page page-narrow">
      <header className="page-header">
        {forced && <p className="banner banner-info"><Icon name="key" size={16} />{t('pwForcedBanner')}</p>}
        <h1>{t('changePasswordTitle')}</h1>
        <p className="lead">{forced ? t('pwForcedLead', { name: profile.displayName }) : t('pwLead')}</p>
      </header>
      {done && !forced ? (
        <div className="panel"><p><Icon name="check" size={16} /> {t('pwChanged')}</p><Link className="btn" to="/">{t('toCourses')}</Link></div>
      ) : (
        <form className="panel" onSubmit={submit} noValidate>
          <label className="field">
            <span className="field-label">{t('pwCurrent')}</span>
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)}
              aria-invalid={submitted && !current} autoFocus />
            {submitted && !current && <span className="field-error">{t('v_required')}</span>}
          </label>
          <label className="field">
            <span className="field-label">{t('pwNew')}</span>
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-invalid={submitted && !!errNext} />
            <span className={'pw-meter-t s' + (!next ? 0 : pw.code ? 1 : Math.max(2, pw.score))} aria-hidden="true"><i /><i /><i /><i /></span>
            {submitted && errNext ? <span className="field-error">{errNext}</span> : <span className="muted small">{t('pwRules')}</span>}
          </label>
          <label className="field">
            <span className="field-label">{t('pwRepeat')}</span>
            <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-invalid={submitted && !!errRepeat} />
            {submitted && errRepeat && <span className="field-error">{errRepeat}</span>}
          </label>
          {error && <p className="form-error" role="alert"><Icon name="alert" size={16} />{error}</p>}
          <div className="form-actions">
            {forced ? <button type="button" className="btn" onClick={() => void signOut()}>{t('signOut')}</button> : <Link className="btn" to="/">{t('cancel')}</Link>}
            <button className="btn btn-primary" disabled={busy}>{busy ? t('saving') : t('pwSave')}</button>
          </div>
        </form>
      )}
    </main>
  );
}
