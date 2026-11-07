import { Fragment, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  ASSESSMENT_CATEGORIES, utcToZonedWallTime, zonedWallTimeToUtc,
  type AssessmentCategory, type AssessmentDTO, type AssessmentRecordDTO, type CourseStanding, type GradingPeriod,
} from '@aitu/domain';
import { createAssessment, toDataError } from '@aitu/data';
import { useCourse } from '../course/CourseContext.tsx';
import { PERIOD_ORDER, teacherStanding, weightSums } from '../course/standing.ts';
import { useTeacher } from '../auth/AuthProvider.tsx';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { EmptyState, PublicationChip, useToast } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { errorKey } from '../errors.ts';
import { formatDate, formatPoints } from '../format.ts';

const PERIOD_KEY: Record<GradingPeriod, MessageKey> = { midterm: 'periodMidterm', endterm: 'periodEndterm', final: 'periodFinal' };
const ADMISSION_KEY: Record<CourseStanding['admission'], MessageKey> = {
  admitted: 'admAdmitted', 'on-track': 'admOnTrack', 'at-risk': 'admAtRisk', 'not-admitted': 'admNotAdmitted', unknown: 'admUnknown',
};
const fmtScore = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2));

/** Moodle-style grader report: registers as column groups + calculated Register / Total columns. */
export function GradebookPage() {
  const c = useCourse();
  const { t, locale } = useI18n();
  const [showForm, setShowForm] = useState(false);
  const byKey = new Map(c.grades.map((g) => [`${g.assessmentId}_${g.studentUid}`, g]));
  const sums = weightSums(c.assessments);
  const groups = PERIOD_ORDER.map((p) => ({ period: p, items: c.assessments.filter((a) => a.period === p) })).filter((g) => g.items.length);
  const hasRegisters = c.assessments.some((a) => a.period != null);

  return (
    <div className="stack">
      <div className="section-head">
        <h2>{t('gradesTitle')}</h2>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}><Icon name="plus" size={16} />{t('newAssessment')}</button>
      </div>
      {showForm && <NewAssessmentForm onDone={() => setShowForm(false)} sums={sums} />}
      {hasRegisters && <p className="hint"><Icon name="info" size={15} />{t('registerFormulaHint')}</p>}
      {c.assessments.length === 0
        ? !showForm && <EmptyState icon="book" title={t('noAssessments')} text={t('noAssessmentsText')} />
        : (
          <div className="table-wrap">
            <table className="table grader">
              <thead>
                <tr className="grader-groups">
                  <th className="sticky-col" />
                  {groups.map((g) => (
                    <th key={String(g.period)} colSpan={g.items.length + (g.period === 'midterm' || g.period === 'endterm' ? 1 : 0) + (g.period === 'endterm' ? 1 : 0)}>
                      {g.period ? t(PERIOD_KEY[g.period]) : t('periodNone')}
                      {g.period && <WeightSum sum={sums[g.period]} />}
                    </th>
                  ))}
                  {hasRegisters && <th colSpan={2}>{t('calcTotal')}</th>}
                </tr>
                <tr>
                  <th className="sticky-col">{t('student')}</th>
                  {groups.map((g) => (
                    <Fragment key={String(g.period)}>
                      {g.items.map((a) => <AssessmentHead key={a.id} a={a} locale={locale} />)}
                      {g.period === 'midterm' && <th className="calc-col">{t('calcRegMid')}</th>}
                      {g.period === 'endterm' && <><th className="calc-col">{t('calcRegEnd')}</th><th className="calc-col">{t('calcRegTerm')}</th></>}
                    </Fragment>
                  ))}
                  {hasRegisters && <><th className="calc-col">{t('calcTotalCol')}</th><th>{t('calcAdmission')}</th></>}
                </tr>
              </thead>
              <tbody>
                {c.activeRoster.map((s) => {
                  const st = hasRegisters ? teacherStanding(c.offering, c.assessments, c.grades, s.studentUid) : null;
                  return (
                    <tr key={s.studentUid}>
                      <th scope="row" className="sticky-col"><span className="person"><b>{s.displayName}</b><small>{s.studentNumber}</small></span></th>
                      {groups.map((g) => (
                        <Fragment key={String(g.period)}>
                          {g.items.map((a) => <td key={a.id} className="num"><GradeCell g={byKey.get(`${a.id}_${s.studentUid}`)} /></td>)}
                          {g.period === 'midterm' && <CalcCell value={st?.regMid.value} pace={st?.regMid.current} />}
                          {g.period === 'endterm' && <><CalcCell value={st?.regEnd.value} pace={st?.regEnd.current} /><CalcCell value={st?.regTerm.value} pace={st?.regTerm.estimate} /></>}
                        </Fragment>
                      ))}
                      {hasRegisters && <>
                        <CalcCell value={st?.total.value} pace={null} strong />
                        <td><AdmissionChip st={st} /></td>
                      </>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

function WeightSum({ sum }: { sum: number }) {
  const { t } = useI18n();
  const pct = Math.round(sum * 100);
  return pct === 100
    ? <span className="wsum ok">Σ 100%</span>
    : <span className="wsum warn" title={t('weightSumWarn')}><Icon name="alert" size={12} />Σ {pct}%</span>;
}

function AssessmentHead({ a, locale }: { a: AssessmentDTO; locale: string }) {
  const { t } = useI18n();
  return (
    <th className="grader-col">
      <Link to={a.id} className="grader-head">
        <span className="grader-cat">{t(a.category as MessageKey)}{a.weight != null ? ` · ${Math.round(a.weight * 100)}%` : ''}</span>
        <b>{a.title}</b>
        <small className="num">{t('outOf', { n: formatPoints(a.maxPoints) })}{a.dueAt ? `, ${formatDate(a.dueAt, locale)}` : ''}</small>
        <PublicationChip value={a.gradesPublication} />
      </Link>
    </th>
  );
}

/** Calculated grade: exact value when the register is complete, otherwise the current pace in italics. */
function CalcCell({ value, pace, strong }: { value: number | null | undefined; pace: number | null | undefined; strong?: boolean }) {
  const { t } = useI18n();
  if (value != null) return <td className={'num calc-col' + (strong ? ' calc-strong' : '')}>{fmtScore(value)}</td>;
  if (pace != null) return <td className="num calc-col calc-pace" title={t('calcPaceHint')}>~{fmtScore(pace)}</td>;
  return <td className="num calc-col muted">—</td>;
}

function AdmissionChip({ st }: { st: CourseStanding | null }) {
  const { t } = useI18n();
  if (!st) return <span className="muted">—</span>;
  if (st.outcome) return <span className={`chip adm-${st.outcome === 'pass' ? 'ok' : 'bad'}`}>{st.outcome === 'pass' ? `${st.grade?.letter ?? ''} · ${st.grade?.gpa.toFixed(2) ?? ''}` : st.outcome}</span>;
  const tone = st.admission === 'admitted' || st.admission === 'on-track' ? 'ok' : st.admission === 'unknown' ? 'muted' : 'bad';
  return <span className={`chip adm-${tone}`}>{t(ADMISSION_KEY[st.admission])}</span>;
}

function GradeCell({ g }: { g: AssessmentRecordDTO | undefined }) {
  const { t } = useI18n();
  if (!g) return <span className="muted" title={t('grade_pending')}>·</span>;
  const draft = g.publication === 'draft';
  const label = g.gradeState === 'graded' ? formatPoints(g.points) : t(`grade_${g.gradeState}` as MessageKey);
  return (
    <span className={`grade-cell gs-${g.gradeState}${draft ? ' is-draft' : ''}`} title={draft ? t('draft') : t('published')}>
      {label}
      {draft && <span className="sr-only"> ({t('draft')})</span>}
    </span>
  );
}

const DEFAULT_WEIGHT: Partial<Record<AssessmentCategory, number>> = { quiz: 20, assignment: 20, lab: 20, project: 20, midterm: 40, endterm: 40, final: 100 };
const DEFAULT_PERIOD: Partial<Record<AssessmentCategory, GradingPeriod>> = { midterm: 'midterm', endterm: 'endterm', final: 'final' };

function NewAssessmentForm({ onDone, sums }: { onDone: () => void; sums: Record<GradingPeriod, number> }) {
  const c = useCourse();
  const { uid } = useTeacher();
  const { t } = useI18n();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<AssessmentCategory>('quiz');
  const [period, setPeriod] = useState<GradingPeriod | ''>('endterm');
  const [weightPct, setWeightPct] = useState(20);
  const [maxPoints, setMaxPoints] = useState(100);
  const [dueDate, setDueDate] = useState(utcToZonedWallTime(Date.now() + 7 * 86_400_000).date);
  const [dueTime, setDueTime] = useState('23:59');
  const [hasDue, setHasDue] = useState(true);
  const [countsForOverdue, setCountsForOverdue] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCategory = (k: AssessmentCategory) => {
    setCategory(k);
    if (DEFAULT_PERIOD[k]) setPeriod(DEFAULT_PERIOD[k]!);
    if (DEFAULT_WEIGHT[k]) setWeightPct(DEFAULT_WEIGHT[k]!);
  };
  const after = period ? Math.round((sums[period] + weightPct / 100) * 100) : null;
  const weightOk = !period || (weightPct > 0 && weightPct <= 100);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await createAssessment(c.offering.id, {
        title, category, maxPoints, dueAt: hasDue ? zonedWallTimeToUtc(dueDate, dueTime) : null, countsForOverdue: hasDue && countsForOverdue,
        period: period || null, weight: period ? weightPct / 100 : null,
      }, uid);
      toast(t('assessmentCreated'));
      onDone();
    } catch (err) { setError(t(errorKey(toDataError(err)))); } finally { setBusy(false); }
  };

  return (
    <form className="panel form-grid" onSubmit={submit}>
      <label className="field span-2"><span className="field-label">{t('title')}</span><input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quiz 2" /></label>
      <label className="field"><span className="field-label">{t('category')}</span>
        <select value={category} onChange={(e) => onCategory(e.target.value as AssessmentCategory)}>
          {ASSESSMENT_CATEGORIES.map((k) => <option key={k} value={k}>{t(k as MessageKey)}</option>)}
        </select>
      </label>
      <label className="field"><span className="field-label">{t('maxPoints')}</span><input type="number" min={0.5} max={1000} step={0.5} required value={maxPoints} onChange={(e) => setMaxPoints(Number(e.target.value))} /></label>
      <label className="field span-2"><span className="field-label">{t('period')}</span>
        <select value={period} onChange={(e) => setPeriod(e.target.value as GradingPeriod | '')}>
          <option value="midterm">{t('periodMidterm')}</option>
          <option value="endterm">{t('periodEndterm')}</option>
          <option value="final">{t('periodFinal')}</option>
          <option value="">{t('periodNone')}</option>
        </select>
      </label>
      {period && (
        <label className="field span-2"><span className="field-label">{t('weightInRegister')}</span>
          <input type="number" min={1} max={100} step={1} required value={weightPct} aria-invalid={!weightOk} onChange={(e) => setWeightPct(Number(e.target.value))} />
          <span className={after === 100 ? 'room-hint' : 'field-error'}>{t('weightAfter', { n: after ?? 0 })}</span>
        </label>
      )}
      <label className="check span-all"><input type="checkbox" checked={hasDue} onChange={(e) => setHasDue(e.target.checked)} />{t('dueAt')}</label>
      {hasDue && <>
        <label className="field"><span className="field-label">{t('date')}</span><input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
        <label className="field"><span className="field-label">{t('startTime')}</span><input type="time" required value={dueTime} onChange={(e) => setDueTime(e.target.value)} /></label>
        <label className="check span-2"><input type="checkbox" checked={countsForOverdue} onChange={(e) => setCountsForOverdue(e.target.checked)} />
          <span>{t('countsForOverdue')}<small className="muted block">{t('countsForOverdueHint')}</small></span></label>
      </>}
      {error && <p className="form-error span-all" role="alert"><Icon name="alert" size={16} />{error}</p>}
      <div className="form-actions span-all">
        <button type="button" className="btn" onClick={onDone}>{t('cancel')}</button>
        <button className="btn btn-primary" disabled={busy || !title.trim() || !(maxPoints > 0) || !weightOk}>{t('createAssessment')}</button>
      </div>
    </form>
  );
}
