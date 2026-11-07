// One course, admin view: teachers, join code, roster (add / remove students), archive.
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { EnrollmentDTO } from '@aitu/domain';
import {
  adminEnrollStudent, toDataError, updateOffering, watchAllUsers, watchCourseEnrollments, watchOffering, withdrawStudent, type UserProfile,
} from '@aitu/data';
import { useTeacher } from '../auth/AuthProvider.tsx';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { useLive } from '../hooks/useLive.ts';
import { ConfirmDialog, Dialog, EmptyState, LoadingBlock, useToast } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { JoinCodeCard } from '../components/JoinCodeCard.tsx';
import { errorKey } from '../errors.ts';
import { formatDate } from '../format.ts';

export function AdminCoursePage() {
  const { offeringId = '' } = useParams();
  const { t, locale } = useI18n();
  const { uid } = useTeacher();
  const toast = useToast();
  const offering = useLive(watchOffering, offeringId);
  const roster = useLive(watchCourseEnrollments, offeringId);
  const users = useLive(watchAllUsers);
  const [busy, setBusy] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [removing, setRemoving] = useState<EnrollmentDTO | null>(null);
  const [adding, setAdding] = useState(false);
  const [showWithdrawn, setShowWithdrawn] = useState(false);

  const all = users.status === 'ready' ? users.data : [];
  const byId = useMemo(() => new Map(all.map((u) => [u.uid, u])), [all]);

  if (offering.status === 'loading') return <LoadingBlock />;
  if (offering.status === 'error' || !offering.data) {
    return <EmptyState icon="alert" title={t('adminCourseMissing')} action={<Link className="btn" to="/admin/courses">{t('back')}</Link>} />;
  }
  const o = offering.data;
  const teachers = all.filter((u) => u.role === 'teacher');
  const staff = o.staffUids.map((s) => byId.get(s) ?? ({ uid: s, displayName: s, email: '' } as UserProfile));
  const freeTeachers = teachers.filter((u) => !o.staffUids.includes(u.uid));
  const list = roster.status === 'ready' ? roster.data.filter((e) => showWithdrawn || e.status === 'active') : [];
  const withdrawnCount = roster.status === 'ready' ? roster.data.filter((e) => e.status === 'withdrawn').length : 0;

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast(ok); return true; } catch (e) { toast(t(errorKey(toDataError(e))), 'error'); return false; } finally { setBusy(false); }
  };
  const setStaff = (next: string[]) => void run(() => updateOffering(o.id, { staffUids: next }, uid), t('savedShort'));

  return (
    <div className="stack">
      <Link to="/admin/courses" className="back-link"><Icon name="chevronLeft" size={16} />{t('adminTabCourses')}</Link>
      <section className="panel">
        <div className="section-head">
          <div>
            <p className="kicker">{o.courseCode} · {o.groupLabel} · {o.termLabel}</p>
            <h2 className="h-lg">{o.title}</h2>
          </div>
          <div className="row-actions">
            <span className={`chip ${o.status === 'active' ? 'chip-published' : 'chip-muted'}`}>{t(`adminStatus_${o.status}` as MessageKey)}</span>
            <button className={o.status === 'active' ? 'btn btn-sm' : 'btn btn-sm btn-primary'} onClick={() => setArchiving(true)} disabled={busy}>
              <Icon name="archive" size={14} />{o.status === 'active' ? t('adminArchive') : t('adminActivate')}
            </button>
          </div>
        </div>
        <dl className="stats stats-4">
          <div><dt>{t('overviewStudents')}</dt><dd>{o.studentUids.length}</dd></div>
          <div><dt>{t('adminViaCode')}</dt><dd>{roster.status === 'ready' ? roster.data.filter((e) => e.status === 'active' && e.via === 'code').length : '—'}</dd></div>
          <div><dt>{t('adminViaAdmin')}</dt><dd>{roster.status === 'ready' ? roster.data.filter((e) => e.status === 'active' && e.via === 'admin').length : '—'}</dd></div>
          <div><dt>{t('adminWithdrawn')}</dt><dd>{withdrawnCount}</dd></div>
        </dl>
      </section>

      <div className="split split-even">
        <section className="panel">
          <h2>{t('adminTeachers')}</h2>
          {staff.length === 0 && <p className="banner banner-warn"><Icon name="alert" size={16} />{t('adminNoTeacher')}</p>}
          <ul className="staff-list">
            {staff.map((s) => (
              <li key={s.uid}>
                <span className="person"><b>{s.displayName}</b><small>{s.email}</small></span>
                <button className="btn btn-ghost btn-sm" disabled={busy || staff.length <= 1} title={staff.length <= 1 ? t('adminLastTeacher') : undefined}
                  onClick={() => setStaff(o.staffUids.filter((x) => x !== s.uid))}><Icon name="userMinus" size={14} />{t('adminRemove')}</button>
              </li>
            ))}
          </ul>
          {freeTeachers.length > 0 && (
            <label className="field field-inline">
              <span className="field-label">{t('adminAddTeacherToCourse')}</span>
              <select value="" disabled={busy} onChange={(e) => e.target.value && setStaff([...o.staffUids, e.target.value])}>
                <option value="">{t('adminChoose')}</option>
                {freeTeachers.map((u) => <option key={u.uid} value={u.uid}>{u.displayName}</option>)}
              </select>
            </label>
          )}
        </section>
        <JoinCodeCard offering={o} asAdmin />
      </div>

      <section className="panel">
        <div className="section-head">
          <h2>{t('adminRoster')}</h2>
          <div className="row-actions">
            {withdrawnCount > 0 && (
              <label className="check"><input type="checkbox" checked={showWithdrawn} onChange={(e) => setShowWithdrawn(e.target.checked)} />{t('adminShowWithdrawn', { n: withdrawnCount })}</label>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)} disabled={o.status !== 'active'}><Icon name="userPlus" size={14} />{t('adminAddStudent')}</button>
          </div>
        </div>
        {roster.status === 'loading' ? <LoadingBlock /> : list.length === 0 ? <EmptyState icon="users" title={t('noParticipantsJoin')} /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('adminName')}</th><th>{t('group')}</th><th>{t('adminSource')}</th><th>{t('adminEnrolledAt')}</th><th><span className="sr-only">{t('actions')}</span></th></tr></thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.studentUid} className={e.status === 'withdrawn' ? 'row-muted' : ''}>
                    <td><span className="person"><b>{e.displayName}</b><small>{e.studentNumber || byId.get(e.studentUid)?.email}</small></span></td>
                    <td>{e.groupLabel || '—'}</td>
                    <td className="small">{e.status === 'withdrawn' ? <span className="chip chip-muted">{t('adminWithdrawnOne')}</span> : t(e.via === 'code' ? 'viaCode' : e.via === 'admin' ? 'viaAdmin' : 'adminViaSeed')}</td>
                    <td className="small">{e.enrolledAt ? formatDate(e.enrolledAt, locale) : '—'}</td>
                    <td className="actions">
                      {e.status === 'active'
                        ? <button className="btn btn-ghost btn-sm" onClick={() => setRemoving(e)}><Icon name="userMinus" size={14} />{t('withdraw')}</button>
                        : byId.get(e.studentUid) && o.status === 'active' && (
                          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void run(() => adminEnrollStudent(o.id, byId.get(e.studentUid)!, uid), t('adminEnrolled', { name: e.displayName }))}>
                            <Icon name="userPlus" size={14} />{t('adminReenroll')}</button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {archiving && (
        <ConfirmDialog busy={busy} title={o.status === 'active' ? t('adminArchiveQ') : t('adminActivateQ')}
          text={o.status === 'active' ? t('adminArchiveText') : t('adminActivateText')}
          confirm={o.status === 'active' ? t('adminArchive') : t('adminActivate')} danger={o.status === 'active'}
          onClose={() => setArchiving(false)}
          onConfirm={() => void run(() => updateOffering(o.id, { status: o.status === 'active' ? 'archived' : 'active' }, uid), t('savedShort')).then(() => setArchiving(false))} />
      )}
      {removing && (
        <ConfirmDialog busy={busy} danger title={t('withdrawQ', { name: removing.displayName })} text={t('withdrawText')} confirm={t('withdraw')}
          onClose={() => setRemoving(null)}
          onConfirm={() => void run(() => withdrawStudent(o.id, removing.studentUid, uid, { asAdmin: true }), t('withdrawnToast', { name: removing.displayName })).then((ok) => ok && setRemoving(null))} />
      )}
      {adding && (
        <AddStudentDialog students={all.filter((u) => u.role === 'student' && !o.studentUids.includes(u.uid))} group={o.groupLabel}
          onClose={() => setAdding(false)}
          onPick={(s) => void run(() => adminEnrollStudent(o.id, s, uid), t('adminEnrolled', { name: s.displayName }))} busy={busy} />
      )}
    </div>
  );
}

function AddStudentDialog({ students, group, busy, onPick, onClose }: { students: UserProfile[]; group: string; busy: boolean; onPick: (s: UserProfile) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [onlyGroup, setOnlyGroup] = useState(true);
  const needle = q.trim().toLowerCase();
  const list = students
    .filter((s) => (!onlyGroup || s.groupLabel === group) && (!needle || `${s.displayName} ${s.email} ${s.studentNumber} ${s.groupLabel}`.toLowerCase().includes(needle)))
    .slice(0, 50);
  return (
    <Dialog title={t('adminAddStudent')} onClose={onClose} footer={<button className="btn" onClick={onClose}>{t('close')}</button>}>
      <p className="small">{t('adminAddStudentText')}</p>
      <label className="search search-block"><Icon name="search" size={16} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('adminSearchUsers')} aria-label={t('adminSearchUsers')} autoFocus /></label>
      <label className="check"><input type="checkbox" checked={onlyGroup} onChange={(e) => setOnlyGroup(e.target.checked)} />{t('adminOnlyGroup', { group })}</label>
      {list.length === 0 ? <p className="muted small">{t('adminNoUsers')}</p> : (
        <ul className="pick-list">
          {list.map((s) => (
            <li key={s.uid}>
              <span className="person"><b>{s.displayName}</b><small>{s.groupLabel || '—'} · {s.email}</small></span>
              <button className="btn btn-sm" disabled={busy} onClick={() => onPick(s)}><Icon name="plus" size={14} />{t('adminEnroll')}</button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
