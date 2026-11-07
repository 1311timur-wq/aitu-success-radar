import { useEffect, useMemo, useState } from 'react';
import { Link, useBlocker, useParams } from 'react-router';
import { GRADE_STATES, SUBMISSION_STATES, type AssessmentRecordDTO, type GradeState, type SubmissionState } from '@aitu/domain';
import { publishGrades, saveGrades, toDataError, validateGradeRow, type RowsResult } from '@aitu/data';
import { useCourse } from '../course/CourseContext.tsx';
import { useTeacher } from '../auth/AuthProvider.tsx';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { useRowEdits } from '../hooks/useRowEdits.ts';
import { ConfirmDialog, EmptyState, PublicationChip, ReasonDialog, useToast } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { errorKey } from '../errors.ts';
import { formatDateTime, formatPoints } from '../format.ts';

type RowView = { submission: SubmissionState; gradeState: GradeState; points: number | null; feedback: string };
const fromRecord = (r: AssessmentRecordDTO | undefined): RowView =>
  r ? { submission: r.submission, gradeState: r.gradeState, points: r.points, feedback: r.feedback }
    : { submission: 'pending', gradeState: 'pending', points: null, feedback: '' };
const sameValue = (a: RowView, b: RowView) =>
  a.submission === b.submission && a.gradeState === b.gradeState && a.points === b.points && a.feedback.trim() === b.feedback.trim();

export function GradeSheetPage() {
  const { assessmentId = '' } = useParams();
  const c = useCourse();
  const { t, locale } = useI18n();
  const { uid } = useTeacher();
  const toast = useToast();
  const assessment = c.assessments.find((a) => a.id === assessmentId);
  const records = useMemo(() => new Map(c.grades.filter((g) => g.assessmentId === assessmentId).map((g) => [g.studentUid, g])), [c.grades, assessmentId]);
  const rows = useRowEdits(records, fromRecord, sameValue);
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const [askReason, setAskReason] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const uids = c.activeRoster.map((s) => s.studentUid);
  const dirty = uids.filter(rows.isDirty);
  const max = assessment?.maxPoints ?? 0;
  const problems = new Map(dirty.map((u) => [u, validateGradeRow(rows.view(u), max)] as const).filter(([, p]) => p));

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty.length > 0 && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty.length) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty.length]);

  if (!assessment) return <EmptyState icon="book" title={t('assessmentNotFound')} action={<Link className="btn" to="../grades">{t('back')}</Link>} />;
  const published = assessment.gradesPublication === 'published';

  const corrections = dirty.filter((u) => {
    const r = records.get(u);
    const v = rows.view(u);
    return r?.publication === 'published' && r.gradeState === 'graded' && (r.gradeState !== v.gradeState || r.points !== v.points);
  });

  const setPoints = (u: string, raw: string) => {
    if (raw === '') { rows.edit(u, { points: null }); return; }
    // Typing a number means "graded": the teacher should not have to switch two controls.
    rows.edit(u, { points: Number(raw), gradeState: 'graded' });
  };
  const setGradeState = (u: string, gradeState: GradeState) =>
    rows.edit(u, gradeState === 'graded' ? { gradeState } : { gradeState, points: null });

  const report = (res: RowsResult, ok: string) => {
    if (res.committed.length) toast(ok);
    if (res.conflicts.length) toast(t('conflictsToast', { n: res.conflicts.length }), 'warn');
    if (res.failed.length) toast(t('failedToast', { n: res.failed.length, reason: t(errorKey(res.failed[0]!)) }), 'error');
  };

  const save = async (correctionReason?: string) => {
    setBusy('save'); setAskReason(false);
    try {
      const res = await saveGrades({
        offeringId: c.offering.id, assessment, actorUid: uid, correctionReason,
        rows: dirty.map((u) => ({ studentUid: u, ...rows.view(u), expectedRevision: rows.baseRevision(u) })),
      });
      rows.markSaved(res.committed);
      report(res, t('saved', { n: res.committed.length }));
    } catch (e) { toast(t(errorKey(toDataError(e))), 'error'); } finally { setBusy(null); }
  };

  const publish = async () => {
    setBusy('publish');
    try {
      const res = await publishGrades({ offeringId: c.offering.id, assessment, records: [...records.values()], actorUid: uid });
      if (!res.conflicts.length && !res.failed.length) { toast(t('publishedToast')); setConfirmPublish(false); } else report(res, t('saved', { n: res.committed.length }));
    } catch (e) { toast(t(errorKey(toDataError(e))), 'error'); } finally { setBusy(null); }
  };

  const pendingCount = uids.filter((u) => rows.view(u).gradeState === 'pending').length;

  return (
    <div className="sheet">
      <section className="sheet-head">
        <div>
          <h2>{assessment.title}</h2>
          <p className="sheet-sub">
            <span>{t(assessment.category as MessageKey)}</span>
            <span className="num">{t('outOf', { n: formatPoints(assessment.maxPoints) })}</span>
            <span>{assessment.dueAt ? `${t('dueAt')}: ${formatDateTime(assessment.dueAt, locale)}` : t('noDue')}</span>
          </p>
        </div>
        <PublicationChip value={assessment.gradesPublication} />
      </section>
      <p className="hint"><Icon name="info" size={15} />{t('pendingNotZero')}</p>

      <div className="table-wrap">
        <table className="table sheet-table grade-table">
          <thead>
            <tr><th className="col-n">№</th><th>{t('student')}</th><th>{t('submission')}</th><th>{t('grade')}</th><th className="col-points">{t('points')}</th><th>{t('feedback')}</th><th className="col-state"><span className="sr-only">{t('status')}</span></th></tr>
          </thead>
          <tbody>
            {c.activeRoster.map((s, i) => {
              const u = s.studentUid;
              const v = rows.view(u);
              const rec = records.get(u);
              const problem = problems.get(u);
              return (
                <tr key={u} className={['sheet-row', rows.isDirty(u) && 'is-dirty', rows.isConflict(u) && 'is-conflict'].filter(Boolean).join(' ')}>
                  <td className="col-n num c-n">{i + 1}</td>
                  <td className="c-person"><span className="person"><b>{s.displayName}</b><small>{s.studentNumber}</small></span></td>
                  <td className="c-sub" data-label={t('submission')}>
                    <select value={v.submission} aria-label={`${t('submission')}: ${s.displayName}`} onChange={(e) => rows.edit(u, { submission: e.target.value as SubmissionState })}>
                      {SUBMISSION_STATES.map((x) => <option key={x} value={x}>{t(`sub_${x}` as MessageKey)}</option>)}
                    </select>
                  </td>
                  <td className="c-grade" data-label={t('grade')}>
                    <select value={v.gradeState} aria-label={`${t('grade')}: ${s.displayName}`} onChange={(e) => setGradeState(u, e.target.value as GradeState)}>
                      {GRADE_STATES.map((x) => <option key={x} value={x}>{t(`grade_${x}` as MessageKey)}</option>)}
                    </select>
                  </td>
                  <td className="col-points c-points" data-label={t('points')}>
                    <input type="number" inputMode="decimal" className="points-input" min={0} max={assessment.maxPoints} step={0.5}
                      value={v.points ?? ''} aria-invalid={!!problem} aria-label={`${t('points')}: ${s.displayName}`}
                      onChange={(e) => setPoints(u, e.target.value)} />
                    {problem && <span className="field-error">{problem === 'points-required' ? t('errPointsRequired') : t('errPointsRange', { max: formatPoints(assessment.maxPoints) })}</span>}
                  </td>
                  <td className="c-remark" data-label={t('feedback')}><input className="remark-input" maxLength={1000} value={v.feedback} aria-label={`${t('feedback')}: ${s.displayName}`} onChange={(e) => rows.edit(u, { feedback: e.target.value })} /></td>
                  <td className="col-state c-state">
                    {rows.isConflict(u)
                      ? <button className="chip chip-conflict" onClick={() => rows.reset(u)} title={t('reloadRow')}><Icon name="alert" size={13} />{t('conflict')}</button>
                      : rows.isDirty(u) ? <PublicationChip value="draft" dirty />
                        : rec ? <span className="cell-stack">{rec.publication !== assessment.gradesPublication && <PublicationChip value={rec.publication} />}{rec.correction && <small className="muted">{t('corrected')}</small>}</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={`actionbar${dirty.length ? ' has-changes' : ''}`} role="region" aria-label={t('changedRows', { n: dirty.length })}>
        <span aria-live="polite">{dirty.length ? t('changedRows', { n: dirty.length }) : null}</span>
        <div className="actionbar-buttons">
          <button className="btn" disabled={!dirty.length || !!busy} onClick={rows.clear}>{t('discard')}</button>
          <button className="btn btn-primary" disabled={!dirty.length || problems.size > 0 || !!busy} onClick={() => (corrections.length ? setAskReason(true) : void save())}>
            {busy === 'save' ? t('saving') : published || corrections.length ? t('saveCorrections') : t('saveDraft')}
          </button>
          {!published && (
            <button className="btn btn-accent" disabled={!!busy || dirty.length > 0 || records.size === 0} onClick={() => setConfirmPublish(true)}
              title={dirty.length ? t('saveBeforePublish') : undefined}>
              <Icon name="send" size={16} />{busy === 'publish' ? t('publishing') : t('publish')}
            </button>
          )}
        </div>
      </div>

      {askReason && <ReasonDialog count={corrections.length} busy={busy === 'save'} onSubmit={(r) => void save(r)} onClose={() => setAskReason(false)} />}
      {confirmPublish && (
        <ConfirmDialog title={t('publishGradesQ', { title: assessment.title })} text={t('publishGradesText')} confirm={t('publish')} busy={busy === 'publish'}
          notes={pendingCount ? [t('publishPendingNote', { n: pendingCount })] : []} onConfirm={() => void publish()} onClose={() => setConfirmPublish(false)} />
      )}
      {blocker.state === 'blocked' && (
        <ConfirmDialog title={t('leaveQ')} text={t('leaveText')} confirm={t('leave')} danger onConfirm={() => blocker.proceed()} onClose={() => blocker.reset()} />
      )}
    </div>
  );
}
