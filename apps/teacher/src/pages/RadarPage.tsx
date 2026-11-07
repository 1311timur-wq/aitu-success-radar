import { RISK_ORDER, type CourseStanding, type RiskReason } from '@aitu/domain';
import { useRosterRisk } from '../course/useRosterRisk.ts';
import { useI18n, type MessageKey, type T } from '../i18n/index.tsx';
import { EmptyState, RiskBadge } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { formatPercent } from '../format.ts';

const ADMISSION_KEY: Record<CourseStanding['admission'], MessageKey> = {
  admitted: 'admAdmitted', 'on-track': 'admOnTrack', 'at-risk': 'admAtRisk', 'not-admitted': 'admNotAdmitted', unknown: 'admUnknown',
};

export function reasonText(r: RiskReason, t: T): string {
  const observed = r.code === 'OVERDUE_WORK' ? String(r.observed) : r.code === 'ADMISSION_RISK' || r.code === 'SCHOLARSHIP_RISK' ? r.observed.toFixed(1) : String(Math.round(r.observed));
  return t(`reason_${r.code}` as MessageKey, { observed, threshold: r.threshold, count: r.evidenceCount });
}

export function RadarPage() {
  const { t } = useI18n();
  const rows = useRosterRisk();
  if (rows.length === 0) return <EmptyState icon="users" title={t('radarEmpty')} />;
  const counts = Object.fromEntries(RISK_ORDER.map((l) => [l, rows.filter((r) => r.health.risk.level === l).length]));
  return (
    <div className="stack">
      <header>
        <h2>{t('radarTitle')}</h2>
        <p className="lead">{t('radarLead')}</p>
      </header>
      <p className="banner banner-info"><Icon name="info" size={16} />{t('radarDemoNote')} {t('publishedOnlyNote')}</p>
      <ul className="risk-dist risk-dist-row">
        {RISK_ORDER.map((l) => <li key={l}><RiskBadge level={l} /><b>{counts[l]}</b></li>)}
      </ul>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>{t('student')}</th><th>{t('status')}</th><th>{t('reasons')}</th><th className="num">{t('attendancePct')}</th><th className="num">{t('calcRegMid')}</th><th className="num">{t('regTermCol')}</th><th>{t('calcAdmission')}</th><th className="num">{t('overdue')}</th><th className="num">{t('evidence')}</th></tr>
          </thead>
          <tbody>
            {rows.map(({ student, health }) => {
              const m = health.risk.metrics;
              const st = health.risk.standing;
              return (
                <tr key={student.studentUid}>
                  <td><span className="person"><b>{student.displayName}</b><small>{student.studentNumber}</small></span></td>
                  <td><RiskBadge level={health.risk.level} /></td>
                  <td>
                    {health.risk.reasons.length
                      ? <ul className="reasons">{health.risk.reasons.map((r) => <li key={r.code}>{reasonText(r, t)}</li>)}</ul>
                      : <span className="muted">{t('noReasons')}</span>}
                  </td>
                  <td className="num">{formatPercent(m.attendancePercent)}<small className="muted block">{m.attendanceCount}</small></td>
                  <td className="num">{st?.regMid.value != null ? st.regMid.value.toFixed(1) : st?.regMid.current != null ? `~${st.regMid.current.toFixed(1)}` : '—'}</td>
                  <td className="num">{st?.regTerm.value != null ? st.regTerm.value.toFixed(1) : st?.regTerm.estimate != null ? `~${st.regTerm.estimate.toFixed(1)}` : '—'}</td>
                  <td>{st ? <span className={`chip adm-${st.admission === 'admitted' || st.admission === 'on-track' ? 'ok' : st.admission === 'unknown' ? 'muted' : 'bad'}`}>{t(ADMISSION_KEY[st.admission])}</span> : '—'}</td>
                  <td className="num">{m.overdueCount}</td>
                  <td className="num">{m.evidenceChannels}/3</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
