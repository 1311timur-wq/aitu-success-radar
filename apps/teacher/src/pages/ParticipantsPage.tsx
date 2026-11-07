import { useState } from 'react';
import { formatJoinCode, type EnrollmentDTO } from '@aitu/domain';
import { toDataError, withdrawStudent } from '@aitu/data';
import { useCourse } from '../course/CourseContext.tsx';
import { useTeacher } from '../auth/AuthProvider.tsx';
import { useI18n } from '../i18n/index.tsx';
import { ConfirmDialog, EmptyState, useToast } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { errorKey } from '../errors.ts';
import { formatDate } from '../format.ts';

export function ParticipantsPage() {
  const c = useCourse();
  const { t, locale } = useI18n();
  const { uid } = useTeacher();
  const toast = useToast();
  const [removing, setRemoving] = useState<EnrollmentDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const withdraw = async () => {
    if (!removing) return;
    setBusy(true);
    try { await withdrawStudent(c.offering.id, removing.studentUid, uid); toast(t('withdrawnToast', { name: removing.displayName })); setRemoving(null); }
    catch (e) { toast(t(errorKey(toDataError(e))), 'error'); }
    finally { setBusy(false); }
  };

  const viaCode = c.roster.filter((s) => s.via === 'code' && s.status === 'active').length;
  return (
    <div className="stack">
      <div className="section-head">
        <h2>{t('participantsTitle')}</h2>
        {c.offering.joinCode && <span className="muted small">{t('participantsJoinHint', { code: formatJoinCode(c.offering.joinCode) })}</span>}
      </div>
      {viaCode > 0 && <p className="banner banner-info"><Icon name="userPlus" size={16} />{t('participantsViaCode', { n: viaCode })}</p>}
      {c.roster.length === 0 ? <EmptyState icon="users" title={t('noParticipants')} text={t('noParticipantsJoin')} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th className="col-n">№</th><th>{t('student')}</th><th>{t('studentNumber')}</th><th>{t('group')}</th><th>{t('enrollment')}</th><th><span className="sr-only">{t('actions')}</span></th></tr></thead>
            <tbody>
              {c.roster.map((s, i) => (
                <tr key={s.studentUid} className={s.status === 'withdrawn' ? 'row-muted' : ''}>
                  <td className="col-n num">{i + 1}</td>
                  <td>{s.displayName}</td>
                  <td className="num">{s.studentNumber}</td>
                  <td>{s.groupLabel}</td>
                  <td>
                    <span className="cell-stack">
                      <span>{t(s.status)}</span>
                      {s.via === 'code' && <small className="muted">{t('viaCode')}{s.enrolledAt ? ` · ${formatDate(s.enrolledAt, locale)}` : ''}</small>}
                      {s.via === 'admin' && <small className="muted">{t('viaAdmin')}</small>}
                    </span>
                  </td>
                  <td className="actions">
                    {s.status === 'active' && <button className="btn btn-ghost btn-sm" onClick={() => setRemoving(s)}><Icon name="userMinus" size={14} />{t('withdraw')}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {removing && (
        <ConfirmDialog title={t('withdrawQ', { name: removing.displayName })} text={t('withdrawText')} confirm={t('withdraw')} danger busy={busy}
          onConfirm={() => void withdraw()} onClose={() => setRemoving(null)} />
      )}
    </div>
  );
}
