// Users: students (self-registered or demo), teachers (created HERE by the admin), administrators.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { programLabel, validateEmail, validateFullName } from '@aitu/domain';
import {
  authErrorKind, createTeacherAccount, sendPasswordResetFor, toDataError, updateTeacher, watchAllOfferings, watchAllUsers, type UserProfile,
} from '@aitu/data';
import { useTeacher } from '../auth/AuthProvider.tsx';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { useLive } from '../hooks/useLive.ts';
import { Dialog, EmptyState, LoadingBlock, useToast } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { errorKey } from '../errors.ts';
import { formatDate } from '../format.ts';

type Role = 'student' | 'teacher' | 'admin';

export function AdminUsersPage() {
  const { t, locale } = useI18n();
  const { uid } = useTeacher();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const role = (['student', 'teacher', 'admin'].includes(params.get('role') ?? '') ? params.get('role') : 'teacher') as Role;
  const [q, setQ] = useState('');
  const users = useLive(watchAllUsers);
  const offerings = useLive(watchAllOfferings);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);
  const [editing, setEditing] = useState<UserProfile | null>(null);

  const all = users.status === 'ready' ? users.data : [];
  const coursesOf = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const o of offerings.status === 'ready' ? offerings.data : []) {
      for (const s of o.staffUids) m.set(s, [...(m.get(s) ?? []), `${o.courseCode} ${o.groupLabel}`]);
      for (const s of o.studentUids) m.set(s, [...(m.get(s) ?? []), o.courseCode]);
    }
    return m;
  }, [offerings]);
  const needle = q.trim().toLowerCase();
  const list = all.filter((u) => u.role === role && (!needle || `${u.displayName} ${u.email} ${u.groupLabel} ${u.studentNumber}`.toLowerCase().includes(needle)));
  const count = (r: Role) => all.filter((u) => u.role === r).length;

  const reset = async (u: UserProfile) => {
    try { await sendPasswordResetFor(u, uid); toast(t('adminResetSent', { email: u.email })); }
    catch (e) { toast(t(errorKey(toDataError(e))), 'error'); }
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="segmented" role="tablist">
          {(['teacher', 'student', 'admin'] as const).map((r) => (
            <button key={r} role="tab" aria-selected={role === r} className={role === r ? 'on' : ''} onClick={() => setParams({ role: r })}>
              {t(`adminRole_${r}` as MessageKey)} <span className="count">{count(r)}</span>
            </button>
          ))}
        </div>
        <label className="search"><Icon name="search" size={16} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('adminSearchUsers')} aria-label={t('adminSearchUsers')} /></label>
        {role === 'teacher' && <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="userPlus" size={16} />{t('adminAddTeacher')}</button>}
      </div>
      {role === 'student' && <p className="banner banner-info"><Icon name="info" size={16} />{t('adminStudentsNote')}</p>}
      {role === 'admin' && <p className="banner banner-info"><Icon name="shield" size={16} />{t('adminAdminsNote')}</p>}

      {users.status === 'loading' ? <LoadingBlock /> : list.length === 0 ? <EmptyState icon="users" title={t('adminNoUsers')} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr>
              <th>{t('adminName')}</th><th>{t('email')}</th>
              {role === 'student' ? <><th>{t('group')}</th><th>{t('adminProgram')}</th></> : <th>{t('adminDepartment')}</th>}
              <th>{t('adminCourses')}</th><th>{t('adminSource')}</th><th><span className="sr-only">{t('actions')}</span></th>
            </tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.uid}>
                  <td><span className="person"><b>{u.displayName}</b>{u.studentNumber && <small>{u.studentNumber}</small>}</span></td>
                  <td className="small">{u.email}</td>
                  {role === 'student' ? <><td>{u.groupLabel || '—'}</td><td className="small">{u.program ? programLabel(u.program) : '—'}</td></> : <td className="small">{u.department || '—'}</td>}
                  <td className="small">{(coursesOf.get(u.uid) ?? []).join(', ') || <span className="muted">—</span>}</td>
                  <td className="small">
                    <span className="cell-stack">
                      <span>{t(`adminSource_${u.source}` as MessageKey)}</span>
                      {u.createdAt && <small className="muted">{formatDate(u.createdAt, locale)}</small>}
                      {u.mustChangePassword && <small className="chip chip-draft">{t('adminTempPassword')}</small>}
                    </span>
                  </td>
                  <td className="actions">
                    {u.role === 'teacher' && <button className="btn btn-ghost btn-sm" onClick={() => setEditing(u)}><Icon name="pencil" size={14} />{t('edit')}</button>}
                    {u.uid !== uid && <button className="btn btn-ghost btn-sm" onClick={() => void reset(u)} title={t('adminResetTitle')}><Icon name="key" size={14} />{t('adminReset')}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && <CreateTeacherDialog onClose={() => setCreating(false)} onCreated={(x) => { setCreating(false); setCreated(x); }} />}
      {created && <CredentialsDialog {...created} onClose={() => setCreated(null)} />}
      {editing && <EditTeacherDialog user={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CreateTeacherDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (x: { name: string; email: string; password: string }) => void }) {
  const { t } = useI18n();
  const { uid } = useTeacher();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [dept, setDept] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eName = validateFullName(name);
  const eEmail = validateEmail(email, null);
  const submit = async () => {
    setSubmitted(true);
    if (eName || eEmail) return;
    setBusy(true); setError(null);
    try {
      const res = await createTeacherAccount({ displayName: name, email, department: dept }, uid);
      onCreated({ name, email: email.trim().toLowerCase(), password: res.tempPassword });
    } catch (e) {
      const k = authErrorKind(e);
      setError(t(k === 'unknown' ? errorKey(toDataError(e)) : (`authErr_${k}` as MessageKey)));
    } finally { setBusy(false); }
  };
  return (
    <Dialog title={t('adminAddTeacher')} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>{t('cancel')}</button>
      <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>{busy ? t('saving') : t('adminCreate')}</button>
    </>}>
      <p className="small">{t('adminAddTeacherText')}</p>
      <label className="field"><span className="field-label">{t('adminName')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-invalid={submitted && !!eName} placeholder="Нурлан Ахметов" />
        {submitted && eName && <span className="field-error">{t(`v_${eName}` as MessageKey)}</span>}</label>
      <label className="field"><span className="field-label">{t('email')}</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={submitted && !!eEmail} placeholder="n.akhmetov@astanait.edu.kz" />
        {submitted && eEmail && <span className="field-error">{t(`v_${eEmail}` as MessageKey)}</span>}</label>
      <label className="field"><span className="field-label">{t('adminDepartment')}</span>
        <input value={dept} onChange={(e) => setDept(e.target.value)} placeholder={t('adminDepartmentPh')} maxLength={120} /></label>
      {error && <p className="form-error" role="alert"><Icon name="alert" size={16} />{error}</p>}
    </Dialog>
  );
}

/** The temporary password is shown ONCE (it is not stored anywhere). */
function CredentialsDialog({ name, email, password, onClose }: { name: string; email: string; password: string; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const text = `${t('appName')}: ${location.origin}\n${t('email')}: ${email}\n${t('adminTempPassword')}: ${password}`;
  return (
    <Dialog title={t('adminCreatedTitle', { name })} onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>{t('adminCreatedDone')}</button>}>
      <p>{t('adminCreatedText')}</p>
      <dl className="creds">
        <dt>{t('email')}</dt><dd>{email}</dd>
        <dt>{t('adminTempPassword')}</dt><dd><code>{password}</code></dd>
      </dl>
      <button className="btn btn-sm" onClick={() => void navigator.clipboard.writeText(text).then(() => toast(t('copied')), () => toast(text))}><Icon name="copy" size={14} />{t('copy')}</button>
      <p className="dialog-note"><Icon name="shield" size={15} />{t('adminCreatedNote')}</p>
    </Dialog>
  );
}

function EditTeacherDialog({ user, onClose }: { user: UserProfile; onClose: () => void }) {
  const { t } = useI18n();
  const { uid } = useTeacher();
  const toast = useToast();
  const [name, setName] = useState(user.displayName);
  const [dept, setDept] = useState(user.department);
  const [busy, setBusy] = useState(false);
  const eName = validateFullName(name);
  const save = async () => {
    if (eName) return;
    setBusy(true);
    try { await updateTeacher(user.uid, { displayName: name, department: dept }, uid); toast(t('savedShort')); onClose(); }
    catch (e) { toast(t(errorKey(toDataError(e))), 'error'); }
    finally { setBusy(false); }
  };
  return (
    <Dialog title={t('edit')} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>{t('cancel')}</button>
      <button className="btn btn-primary" onClick={() => void save()} disabled={busy || !!eName}>{t('save')}</button>
    </>}>
      <label className="field"><span className="field-label">{t('adminName')}</span><input value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!eName} />
        {eName && <span className="field-error">{t(`v_${eName}` as MessageKey)}</span>}</label>
      <label className="field"><span className="field-label">{t('adminDepartment')}</span><input value={dept} onChange={(e) => setDept(e.target.value)} maxLength={120} /></label>
      <p className="muted small">{user.email}</p>
    </Dialog>
  );
}
