// Courses (offerings): list, create (with teacher + first join code), open a course to manage it.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatJoinCode, normalizeGroup, validateCourseCode, validateGroup, validateTitle } from '@aitu/domain';
import { createOffering, toDataError, watchAllOfferings, watchAllUsers, watchTerms } from '@aitu/data';
import { useTeacher } from '../auth/AuthProvider.tsx';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { useLive } from '../hooks/useLive.ts';
import { Dialog, EmptyState, LoadingBlock, useToast } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { errorKey } from '../errors.ts';

export function AdminCoursesPage() {
  const { t } = useI18n();
  const offerings = useLive(watchAllOfferings);
  const users = useLive(watchAllUsers);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const names = new Map((users.status === 'ready' ? users.data : []).map((u) => [u.uid, u.displayName]));
  const needle = q.trim().toLowerCase();
  const list = (offerings.status === 'ready' ? offerings.data : []).filter((o) => !needle || `${o.courseCode} ${o.title} ${o.groupLabel}`.toLowerCase().includes(needle));

  return (
    <div className="stack">
      <div className="toolbar">
        <label className="search"><Icon name="search" size={16} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('adminSearchCourses')} aria-label={t('adminSearchCourses')} /></label>
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} />{t('adminAddCourse')}</button>
      </div>
      {offerings.status === 'loading' ? <LoadingBlock /> : list.length === 0 ? <EmptyState icon="book" title={t('adminNoCourses')} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('adminCourse')}</th><th>{t('group')}</th><th>{t('adminTeachers')}</th><th className="num">{t('overviewStudents')}</th><th>{t('joinCodeTitle')}</th><th>{t('status')}</th><th><span className="sr-only">{t('actions')}</span></th></tr></thead>
            <tbody>
              {list.map((o) => (
                <tr key={o.id} className={o.status === 'archived' ? 'row-muted' : ''}>
                  <td><span className="person"><b>{o.title}</b><small>{o.courseCode} · {o.termLabel}</small></span></td>
                  <td>{o.groupLabel}</td>
                  <td className="small">{o.staffUids.map((s) => names.get(s) ?? s).join(', ') || <span className="chip chip-draft">{t('adminNoTeacher')}</span>}</td>
                  <td className="num">{o.studentUids.length}</td>
                  <td>{o.joinCode ? <code className="code-chip">{formatJoinCode(o.joinCode)}</code> : '—'}</td>
                  <td><span className={`chip ${o.status === 'active' ? 'chip-published' : 'chip-muted'}`}>{t(`adminStatus_${o.status}` as MessageKey)}</span></td>
                  <td className="actions"><Link className="btn btn-sm" to={`/admin/courses/${o.id}`}>{t('adminManage')}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <CreateCourseDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateCourseDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { uid } = useTeacher();
  const toast = useToast();
  const navigate = useNavigate();
  const terms = useLive(watchTerms);
  const users = useLive(watchAllUsers);
  const teachers = (users.status === 'ready' ? users.data : []).filter((u) => u.role === 'teacher');
  const termList = terms.status === 'ready' ? terms.data.filter((x) => x.status === 'active') : [];
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [group, setGroup] = useState('');
  const [termId, setTermId] = useState('');
  const [staff, setStaff] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const term = termList.find((x) => x.id === termId) ?? termList[0];
  const errs = { code: validateCourseCode(code), title: validateTitle(title), group: validateGroup(group), staff: staff.length === 0 ? 'required' : null };
  const submit = async () => {
    setSubmitted(true);
    if (Object.values(errs).some(Boolean) || !term) return;
    setBusy(true);
    try {
      const res = await createOffering({ courseCode: code, title, groupLabel: normalizeGroup(group), termId: term.id, termLabel: term.label, staffUids: staff }, uid);
      toast(t('adminCourseCreated', { code: formatJoinCode(res.joinCode) }));
      navigate(`/admin/courses/${res.id}`);
    } catch (e) {
      const err = toDataError(e);
      toast(err.kind === 'conflict' ? t('adminCourseExists') : t(errorKey(err)), 'error');
    } finally { setBusy(false); }
  };
  const fe = (k: keyof typeof errs) => (submitted && errs[k] ? <span className="field-error">{t(`v_${errs[k]}` as MessageKey)}</span> : null);
  return (
    <Dialog title={t('adminAddCourse')} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>{t('cancel')}</button>
      <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>{busy ? t('saving') : t('adminCreate')}</button>
    </>}>
      <div className="form-grid form-grid-2">
        <label className="field"><span className="field-label">{t('adminCourseCode')}</span>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="PHYS101" aria-invalid={submitted && !!errs.code} autoFocus />{fe('code')}</label>
        <label className="field"><span className="field-label">{t('group')}</span>
          <input value={group} onChange={(e) => setGroup(e.target.value)} onBlur={() => setGroup(normalizeGroup(group))} placeholder="SE-2419" aria-invalid={submitted && !!errs.group} />{fe('group')}</label>
        <label className="field span-all"><span className="field-label">{t('adminCourseTitle')}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Physics 1" aria-invalid={submitted && !!errs.title} />{fe('title')}</label>
        <label className="field span-all"><span className="field-label">{t('adminTerm')}</span>
          <select value={term?.id ?? ''} onChange={(e) => setTermId(e.target.value)}>{termList.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
        <fieldset className="field span-all">
          <legend className="field-label">{t('adminTeachers')}</legend>
          <div className="check-list">
            {teachers.map((u) => (
              <label key={u.uid} className="check"><input type="checkbox" checked={staff.includes(u.uid)} onChange={(e) => setStaff(e.target.checked ? [...staff, u.uid] : staff.filter((x) => x !== u.uid))} />{u.displayName}<span className="muted small">{u.email}</span></label>
            ))}
          </div>
          {fe('staff')}
        </fieldset>
      </div>
      <p className="dialog-note"><Icon name="info" size={15} />{t('adminCourseNote')}</p>
    </Dialog>
  );
}
