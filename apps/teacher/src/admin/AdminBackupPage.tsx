// Backup & export. Writing a backup back is deliberately NOT possible from the browser:
// a restore can overwrite everything, so it runs only from the admin's computer (`npm run restore`, Admin SDK, dry run first).
import { useState, type ChangeEvent } from 'react';
import { BACKUP_FORMAT, exportBackup, exportCsv, toDataError } from '@aitu/data';
import { useTeacher } from '../auth/AuthProvider.tsx';
import { useI18n } from '../i18n/index.tsx';
import { useToast } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { errorKey } from '../errors.ts';
import { downloadText } from './AdminLayout.tsx';

type Progress = [number, number] | null;
interface Checked { ok: boolean; message: string; exportedAt?: string; total?: number; byCollection?: [string, number][] }

export function AdminBackupPage() {
  const { t } = useI18n();
  const { uid } = useTeacher();
  const toast = useToast();
  const [jsonProgress, setJsonProgress] = useState<Progress>(null);
  const [csvProgress, setCsvProgress] = useState<Progress>(null);
  const [lastJson, setLastJson] = useState<{ fileName: string; documents: number } | null>(null);
  const [csvFiles, setCsvFiles] = useState<{ name: string; content: string; rows: number }[] | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);

  const backup = async () => {
    setJsonProgress([0, 1]);
    try {
      const res = await exportBackup(uid, (d, n) => setJsonProgress([d, n]));
      downloadText(res.fileName, res.json, 'application/json');
      setLastJson({ fileName: res.fileName, documents: res.documents });
      toast(t('backupDone', { n: res.documents }));
    } catch (e) { toast(t(errorKey(toDataError(e))), 'error'); }
    finally { setJsonProgress(null); }
  };
  const csv = async () => {
    setCsvProgress([0, 1]);
    try { setCsvFiles(await exportCsv(uid, (d, n) => setCsvProgress([d, n]))); toast(t('csvReady')); }
    catch (e) { toast(t(errorKey(toDataError(e))), 'error'); }
    finally { setCsvProgress(null); }
  };

  /** Reads a backup file locally (nothing is uploaded) and checks that it is a complete, valid backup. */
  const check = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024) { setChecked({ ok: false, message: t('backupCheckTooBig') }); return; }
      const data = JSON.parse(await file.text()) as { format?: string; version?: number; exportedAt?: string; count?: number; documents?: Record<string, unknown> };
      if (data.format !== BACKUP_FORMAT || typeof data.documents !== 'object' || !data.documents) { setChecked({ ok: false, message: t('backupCheckWrong') }); return; }
      const paths = Object.keys(data.documents);
      const counts = new Map<string, number>();
      for (const p of paths) {
        const parts = p.split('/');
        const col = parts.length > 2 ? `${parts[0]}/…/${parts[parts.length - 2]}` : parts[0]!;
        counts.set(col, (counts.get(col) ?? 0) + 1);
      }
      const complete = data.count == null || data.count === paths.length;
      setChecked({
        ok: complete && paths.length > 0,
        message: complete ? t('backupCheckOk', { version: data.version ?? '?' }) : t('backupCheckCount', { want: data.count ?? 0, got: paths.length }),
        exportedAt: data.exportedAt, total: paths.length, byCollection: [...counts.entries()].sort((a, b) => b[1] - a[1]),
      });
    } catch {
      setChecked({ ok: false, message: t('backupCheckBroken') });
    }
  };

  const pct = (p: Progress) => (p && p[1] ? Math.round((p[0] / p[1]) * 100) : 0);

  return (
    <div className="stack">
      <div className="split split-even">
        <section className="panel">
          <h2><Icon name="database" size={18} /> {t('backupJsonTitle')}</h2>
          <p className="small">{t('backupJsonText')}</p>
          <ul className="ticks small">
            <li>{t('backupJsonInc')}</li>
            <li>{t('backupJsonExc')}</li>
          </ul>
          <button className="btn btn-primary" onClick={() => void backup()} disabled={!!jsonProgress}>
            <Icon name="download" size={16} />{jsonProgress ? t('adminStatsProgress', { done: jsonProgress[0], total: jsonProgress[1] }) : t('backupJsonButton')}
          </button>
          {jsonProgress && <div className="progress" role="progressbar" aria-valuenow={pct(jsonProgress)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct(jsonProgress)}%` }} /></div>}
          {lastJson && <p className="muted small"><Icon name="check" size={14} /> {t('backupLast', { file: lastJson.fileName, n: lastJson.documents })}</p>}
        </section>

        <section className="panel">
          <h2><Icon name="list" size={18} /> {t('csvTitle')}</h2>
          <p className="small">{t('csvText')}</p>
          <button className="btn" onClick={() => void csv()} disabled={!!csvProgress}>
            <Icon name="refresh" size={16} />{csvProgress ? t('adminStatsProgress', { done: csvProgress[0], total: csvProgress[1] }) : t('csvButton')}
          </button>
          {csvProgress && <div className="progress"><i style={{ width: `${pct(csvProgress)}%` }} /></div>}
          {csvFiles && (
            <ul className="file-list">
              {csvFiles.map((f) => (
                <li key={f.name}>
                  <span><b>{f.name}</b><small className="muted"> · {t('csvRows', { n: f.rows })}</small></span>
                  <button className="btn btn-sm" onClick={() => downloadText(f.name, f.content, 'text/csv;charset=utf-8')}><Icon name="download" size={14} />{t('download')}</button>
                </li>
              ))}
            </ul>
          )}
          <p className="dialog-note"><Icon name="shield" size={15} />{t('csvPrivacy')}</p>
        </section>
      </div>

      <section className="panel">
        <h2><Icon name="shield" size={18} /> {t('backupCheckTitle')}</h2>
        <p className="small">{t('backupCheckText')}</p>
        <label className="btn file-btn"><Icon name="eye" size={16} />{t('backupCheckButton')}<input type="file" accept="application/json,.json" onChange={(e) => void check(e)} /></label>
        {checked && (
          <div className={'check-result ' + (checked.ok ? 'ok' : 'bad')} role="status">
            <p><Icon name={checked.ok ? 'check' : 'alert'} size={16} /> {checked.message}</p>
            {checked.total != null && <p className="small muted">{t('backupCheckMeta', { n: checked.total, when: checked.exportedAt ? new Date(checked.exportedAt).toLocaleString() : '—' })}</p>}
            {checked.byCollection && (
              <table className="table table-compact"><tbody>
                {checked.byCollection.slice(0, 14).map(([c, n]) => <tr key={c}><td><code>{c}</code></td><td className="num">{n}</td></tr>)}
              </tbody></table>
            )}
          </div>
        )}
      </section>

      <section className="panel">
        <h2><Icon name="archive" size={18} /> {t('restoreTitle')}</h2>
        <p className="small">{t('restoreText')}</p>
        <ol className="steps">
          <li>{t('restoreStep1')}<pre><code>npm run backup</code></pre></li>
          <li>{t('restoreStep2')}<pre><code>npm run restore -- backups/aitu-radar-2026-11-01.json</code></pre></li>
          <li>{t('restoreStep3')}<pre><code>npm run restore -- backups/aitu-radar-2026-11-01.json --yes</code></pre></li>
        </ol>
        <p className="dialog-note"><Icon name="alert" size={15} />{t('restoreWipe')}</p>
        <h3>{t('nightlyTitle')}</h3>
        <p className="small">{t('nightlyText')}</p>
        <pre><code>.github/workflows/backup.yml   # 21:00 UTC = 02:00 Астана, хранится 30 дней</code></pre>
      </section>
    </div>
  );
}
