// Administrator journal: who did what (append-only — Security Rules forbid update and delete).
import { useMemo, useState } from 'react';
import { watchAdminLog, watchAllUsers } from '@aitu/data';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { useLive } from '../hooks/useLive.ts';
import { EmptyState, LoadingBlock } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { formatDateTime } from '../format.ts';

const TYPES = ['user.teacher.created', 'user.updated', 'user.password-reset', 'offering.created', 'offering.updated', 'offering.staff.changed',
  'enrollment.added', 'enrollment.removed', 'joincode.created', 'joincode.revoked', 'backup.exported', 'csv.exported', 'stats.refreshed'] as const;
const typeKey = (type: string) => `log_${type.replace(/[.-]/g, '_')}` as MessageKey;

function details(d: Record<string, unknown>): string {
  return Object.entries(d)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}

export function AdminLogPage() {
  const { t, locale } = useI18n();
  const [n, setN] = useState(100);
  const [type, setType] = useState('');
  const log = useLive(watchAdminLog, n);
  const users = useLive(watchAllUsers);
  const names = useMemo(() => new Map((users.status === 'ready' ? users.data : []).map((u) => [u.uid, u.displayName])), [users]);
  const all = log.status === 'ready' ? log.data : [];
  const list = type ? all.filter((e) => e.type === type) : all;

  return (
    <div className="stack">
      <div className="toolbar">
        <label className="field field-inline"><span className="field-label">{t('logType')}</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{t('logAll')}</option>
            {TYPES.map((x) => <option key={x} value={x}>{t(typeKey(x))}</option>)}
          </select>
        </label>
        <p className="muted small"><Icon name="lock" size={14} /> {t('logAppendOnly')}</p>
      </div>
      {log.status === 'loading' ? <LoadingBlock /> : list.length === 0 ? <EmptyState icon="list" title={t('logEmpty')} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('logWhen')}</th><th>{t('logWhat')}</th><th>{t('logWho')}</th><th>{t('logTarget')}</th></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td className="small nowrap">{e.at ? formatDateTime(e.at, locale) : '—'}</td>
                  <td><span className="cell-stack"><b>{TYPES.includes(e.type as typeof TYPES[number]) ? t(typeKey(e.type)) : e.type}</b>{Object.keys(e.details).length > 0 && <small className="muted">{details(e.details)}</small>}</span></td>
                  <td className="small">{names.get(e.actorUid) ?? e.actorUid}</td>
                  <td className="small"><code className="path">{e.target}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {log.status === 'ready' && all.length >= n && <button className="btn" onClick={() => setN(n + 100)}>{t('logMore')}</button>}
    </div>
  );
}
