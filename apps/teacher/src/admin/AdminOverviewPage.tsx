// Admin overview: live counters (cheap) + statistics computed on demand (one full read, cached in stats/latest).
import { useState } from 'react';
import { Link } from 'react-router';
import { refreshStats, toDataError, watchAllOfferings, watchAllUsers, watchStats } from '@aitu/data';
import { useTeacher } from '../auth/AuthProvider.tsx';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { useLive } from '../hooks/useLive.ts';
import { EmptyState, LoadingBlock, useToast } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { errorKey } from '../errors.ts';
import { formatDateTime } from '../format.ts';
import { BarChart, RiskStack } from './charts.tsx';

const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WEEKDAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function AdminOverviewPage() {
  const { t, lang, locale } = useI18n();
  const { uid } = useTeacher();
  const toast = useToast();
  const users = useLive(watchAllUsers);
  const offerings = useLive(watchAllOfferings);
  const stats = useLive(watchStats);
  const [progress, setProgress] = useState<[number, number] | null>(null);

  const recompute = async () => {
    setProgress([0, 1]);
    try { await refreshStats(uid, (d, n) => setProgress([d, n])); toast(t('statsRefreshed')); }
    catch (e) { toast(t(errorKey(toDataError(e))), 'error'); }
    finally { setProgress(null); }
  };

  const u = users.status === 'ready' ? users.data : [];
  const o = offerings.status === 'ready' ? offerings.data : [];
  const live = [
    { k: 'adminKStudents', v: u.filter((x) => x.role === 'student').length, to: '/admin/users?role=student' },
    { k: 'adminKTeachers', v: u.filter((x) => x.role === 'teacher').length, to: '/admin/users?role=teacher' },
    { k: 'adminKCourses', v: o.filter((x) => x.status === 'active').length, to: '/admin/courses' },
    { k: 'adminKEnrollments', v: o.reduce((s, x) => s + x.studentUids.length, 0), to: '/admin/courses' },
    { k: 'adminKSelf', v: u.filter((x) => x.source === 'self').length, to: '/admin/users?role=student' },
  ] as const;

  const s = stats.status === 'ready' ? stats.data : null;
  const wd = lang === 'en' ? WEEKDAYS_EN : WEEKDAYS_RU;
  const source = s?.computedAt ? t('chartSource', { when: formatDateTime(s.computedAt, locale) }) : '';

  return (
    <div className="stack">
      {(users.status === 'loading' || offerings.status === 'loading') ? <LoadingBlock rows={2} /> : (
        <dl className="stats stats-5">
          {live.map((x) => <div key={x.k}><dt>{t(x.k as MessageKey)}</dt><dd><Link to={x.to}>{x.v}</Link></dd></div>)}
        </dl>
      )}

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>{t('adminStatsTitle')}</h2>
            <p className="muted small">{s?.computedAt ? t('adminStatsAt', { when: formatDateTime(s.computedAt, locale) }) : t('adminStatsNever')}</p>
          </div>
          <button className="btn btn-primary" onClick={() => void recompute()} disabled={!!progress}>
            <Icon name="refresh" size={16} />{progress ? t('adminStatsProgress', { done: progress[0], total: progress[1] }) : t('adminStatsRefresh')}
          </button>
        </div>
        <p className="muted small">{t('adminStatsHint')}</p>
      </section>

      {stats.status === 'loading' && <LoadingBlock rows={4} />}
      {stats.status === 'ready' && !s && <EmptyState icon="chart" title={t('adminStatsEmptyTitle')} text={t('adminStatsEmptyText')} />}
      {s && (
        <>
          <dl className="stats stats-5">
            <div><dt>{t('adminSHeld')}</dt><dd>{s.totals.sessionsHeld}</dd></div>
            <div><dt>{t('adminSAttendance')}</dt><dd>{s.totals.attendanceRecords}</dd></div>
            <div><dt>{t('adminSGrades')}</dt><dd>{s.totals.gradeRecords}</dd></div>
            <div><dt>{t('adminSCheckins')}</dt><dd>{s.totals.checkins}</dd></div>
            <div><dt>{t('adminSNew7')}</dt><dd>{s.totals.registeredLast7Days}</dd></div>
          </dl>

          <div className="admin-risk">
            {(['high', 'medium', 'low', 'unknown'] as const).map((k) => (
              <div key={k} className={`admin-risk-cell risk-${k}`}><b>{s.risk[k]}</b><span>{t(`level_${k}` as MessageKey)}</span></div>
            ))}
            <div className="admin-risk-cell adm"><b>{s.admission['at-risk'] + s.admission['not-admitted']}</b><span>{t('adminAdmissionRisk')}</span></div>
          </div>

          <RiskStack title={t('chartRiskTitle')} subtitle={t('chartRiskSub')} source={source}
            rows={s.courses.map((c) => ({ label: c.label, high: c.high, medium: c.medium, low: c.low, unknown: c.unknown }))} />

          <div className="split split-even">
            <BarChart title={t('chartAbsenceTitle')} subtitle={t('chartAbsenceSub')} source={source} unit="%" yLabel={t('chartAbsenceY')} xLabel={t('chartWeekday')}
              bars={s.absenceByWeekday.filter((w) => w.marked > 0).map((w) => ({ label: wd[w.weekday]!, value: w.absencePercent, note: t('chartMarked', { n: w.marked }) }))} />
            <BarChart title={t('chartGradeTitle')} subtitle={t('chartGradeSub')} source={source} unit="%" max={100} yLabel={t('chartGradeY')} xLabel={t('chartCategory')}
              bars={s.gradeByCategory.map((g) => ({ label: t(g.category as MessageKey), value: g.avgPercent, note: t('chartN', { n: g.n }) }))} />
          </div>
          <div className="split split-even">
            <BarChart title={t('chartLateTitle')} subtitle={t('chartLateSub')} source={source} unit="%" yLabel={t('chartLateY')} xLabel={t('chartHour')}
              bars={s.lateByHour.map((h) => ({ label: `${String(h.hour).padStart(2, '0')}:00`, value: h.latePercent, note: t('chartMarked', { n: h.marked }) }))} />
            <BarChart title={t('chartAttendanceTitle')} subtitle={t('chartAttendanceSub')} source={source} unit="%" max={100} yLabel={t('chartAttendanceY')} xLabel={t('adminCourse')}
              horizontal
              bars={s.courses.map((c) => ({ label: c.label, value: c.attendancePercent, note: t('chartStudents', { n: c.students }) }))} />
          </div>
          <p className="banner banner-info"><Icon name="info" size={16} />{t('adminStatsSynthetic')}</p>
        </>
      )}
    </div>
  );
}
