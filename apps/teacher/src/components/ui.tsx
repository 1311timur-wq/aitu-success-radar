import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AttendanceStatus, Publication, RiskLevel } from '@aitu/domain';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { Icon, type IconName } from './Icon.tsx';

// ---------- status chips: colour is never the only signal (text + shape always present) ----------
export function PublicationChip({ value, dirty }: { value: Publication | 'none'; dirty?: boolean }) {
  const { t } = useI18n();
  if (dirty) return <span className="chip chip-unsaved"><span className="chip-dot" />{t('unsaved')}</span>;
  if (value === 'none') return <span className="chip chip-muted">{t('notMarked')}</span>;
  return value === 'published'
    ? <span className="chip chip-published"><Icon name="check" size={13} />{t('published')}</span>
    : <span className="chip chip-draft"><Icon name="pencil" size={13} />{t('draft')}</span>;
}

const RISK_ICON: Record<RiskLevel, IconName> = { high: 'alert', medium: 'info', low: 'check', unknown: 'clock' };
export function RiskBadge({ level }: { level: RiskLevel }) {
  const { t } = useI18n();
  return <span className={`risk risk-${level}`}><Icon name={RISK_ICON[level]} size={14} />{t(`level_${level}` as MessageKey)}</span>;
}

export const ATTENDANCE_KEYS: { status: Exclude<AttendanceStatus, 'unmarked'>; key: MessageKey; label: MessageKey }[] = [
  { status: 'present', key: 'keyPresent', label: 'present' },
  { status: 'late', key: 'keyLate', label: 'late' },
  { status: 'excused', key: 'keyExcused', label: 'excused' },
  { status: 'absent', key: 'keyAbsent', label: 'absent' },
];

export function AttendanceMark({ status }: { status: AttendanceStatus }) {
  const { t } = useI18n();
  const k = ATTENDANCE_KEYS.find((x) => x.status === status);
  return k
    ? <span className={`mark mark-${status}`} title={t(k.label)}><b>{t(k.key)}</b><span className="sr-only">{t(k.label)}</span></span>
    : <span className="mark mark-unmarked" title={t('unmarked')}>·<span className="sr-only">{t('unmarked')}</span></span>;
}

// ---------- page states ----------
export function EmptyState({ icon = 'info', title, text, action }: { icon?: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} size={22} /></span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function LoadingBlock({ rows = 5 }: { rows?: number }) {
  const { t } = useI18n();
  return (
    <div className="skeleton-block" role="status" aria-live="polite">
      <span className="sr-only">{t('loading')}</span>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ width: `${92 - (i % 3) * 14}%` }} />)}
    </div>
  );
}

export function StaleBanner() {
  const { t } = useI18n();
  return <div className="banner banner-warn" role="status"><Icon name="cloudOff" size={16} />{t('staleData')}</div>;
}

// ---------- dialogs ----------
export function Dialog({ title, children, onClose, footer, labelledBy = 'dialog-title' }: {
  title: string; children: ReactNode; onClose: () => void; footer: ReactNode; labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby={labelledBy} onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <h2 id={labelledBy}>{title}</h2>
      <div className="dialog-body">{children}</div>
      <div className="dialog-footer">{footer}</div>
    </dialog>
  );
}

export function ConfirmDialog({ title, text, notes = [], confirm, danger, busy, onConfirm, onClose }: {
  title: string; text: string; notes?: string[]; confirm: string; danger?: boolean; busy?: boolean;
  onConfirm: () => void; onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog title={title} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>{t('cancel')}</button>
      <button className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm} disabled={busy} autoFocus>{confirm}</button>
    </>}>
      <p>{text}</p>
      {notes.map((n) => <p key={n} className="dialog-note"><Icon name="info" size={15} />{n}</p>)}
    </Dialog>
  );
}

export function ReasonDialog({ count, busy, onSubmit, onClose }: { count: number; busy?: boolean; onSubmit: (reason: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const tooShort = reason.trim().length < 3;
  return (
    <Dialog title={t('correctionTitle')} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>{t('cancel')}</button>
      <button className="btn btn-primary" disabled={busy} onClick={() => { setTouched(true); if (!tooShort) onSubmit(reason.trim()); }}>{t('saveCorrections')}</button>
    </>}>
      <p>{t('correctionText', { n: count })}</p>
      <label className="field">
        <span className="field-label">{t('correctionTitle')}</span>
        <textarea rows={3} maxLength={500} value={reason} autoFocus placeholder={t('correctionPlaceholder')}
          aria-invalid={touched && tooShort} onChange={(e) => setReason(e.target.value)} />
        {touched && tooShort && <span className="field-error">{t('correctionTooShort')}</span>}
      </label>
    </Dialog>
  );
}

// ---------- toasts ----------
type Toast = { id: number; text: string; tone: 'ok' | 'warn' | 'error' };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === 'ok' ? 3500 : 7000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite" role="status">
        {items.map((x) => (
          <div key={x.id} className={`toast toast-${x.tone}`}>
            <Icon name={x.tone === 'ok' ? 'check' : 'alert'} size={16} />{x.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
