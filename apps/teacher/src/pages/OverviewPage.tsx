import { Link } from 'react-router';
import { RISK_ORDER } from '@aitu/domain';
import { useCourse } from '../course/CourseContext.tsx';
import { useRosterRisk } from '../course/useRosterRisk.ts';
import { useI18n } from '../i18n/index.tsx';
import { RiskBadge } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { formatDate, formatPercent } from '../format.ts';
import { JoinCodeCard } from '../components/JoinCodeCard.tsx';

export function OverviewPage() {
  const c = useCourse();
  const { t, locale } = useI18n();
  const risk = useRosterRisk();
  const held = c.sessions.filter((s) => s.status === 'held');
  const pcts = risk.map((r) => r.health.risk.metrics.attendancePercent).filter((x): x is number => x != null);
  const avgAttendance = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;

  const todo: { key: string; text: string; to: string }[] = [];
  for (const s of held) {
    if (s.attendancePublication === 'draft') {
      todo.push({ key: `s${s.id}`, to: `attendance/${s.id}`, text: t('todoAttendanceDraft', { title: `${formatDate(s.startsAt, locale)}, ${t(s.type)}` }) });
    }
  }
  for (const a of c.assessments) {
    const recs = c.grades.filter((g) => g.assessmentId === a.id);
    const ungraded = c.activeRoster.filter((st) => {
      const r = recs.find((x) => x.studentUid === st.studentUid);
      return !r || r.gradeState === 'pending';
    }).length;
    const pastDue = a.dueAt == null || a.dueAt < Date.now();
    if (recs.some((g) => g.publication === 'draft')) todo.push({ key: `g${a.id}`, to: `grades/${a.id}`, text: t('todoGradesDraft', { title: a.title }) });
    else if (pastDue && ungraded > 0) todo.push({ key: `u${a.id}`, to: `grades/${a.id}`, text: t('todoUngraded', { title: a.title, n: ungraded }) });
  }

  const counts = Object.fromEntries(RISK_ORDER.map((l) => [l, risk.filter((r) => r.health.risk.level === l).length]));

  return (
    <div className="stack">
      <dl className="stats">
        <div><dt>{t('overviewStudents')}</dt><dd>{c.activeRoster.length}</dd></div>
        <div><dt>{t('overviewHeld')}</dt><dd>{held.length}</dd></div>
        <div><dt>{t('overviewAttendance')}</dt><dd>{formatPercent(avgAttendance)}</dd></div>
        <div><dt>{t('overviewAssessments')}</dt><dd>{c.assessments.length}</dd></div>
      </dl>

      <div className="split">
        <section className="panel">
          <h2>{t('overviewTodo')}</h2>
          {todo.length === 0
            ? <p className="muted"><Icon name="check" size={16} /> {t('todoNone')}</p>
            : <ul className="todo">{todo.map((x) => <li key={x.key}><Link to={x.to}>{x.text}<Icon name="chevronRight" size={16} /></Link></li>)}</ul>}
        </section>

        <section className="panel">
          <h2>{t('overviewRiskTitle')}</h2>
          <ul className="risk-dist">
            {RISK_ORDER.map((l) => (
              <li key={l}><RiskBadge level={l} /><b>{counts[l]}</b></li>
            ))}
          </ul>
          <p className="muted small">{t('publishedOnlyNote')}</p>
          <Link className="btn" to="radar"><Icon name="radar" size={16} />{t('openRadar')}</Link>
        </section>
      </div>

      <JoinCodeCard offering={c.offering} />
    </div>
  );
}

