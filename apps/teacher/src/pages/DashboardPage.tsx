import { Link } from 'react-router';
import { isSameZonedDay, type OfferingDTO } from '@aitu/domain';
import { watchDraftAttendance, watchMyOfferings, watchSessions } from '@aitu/data';
import { useTeacher } from '../auth/AuthProvider.tsx';
import { useI18n } from '../i18n/index.tsx';
import { useLive } from '../hooks/useLive.ts';
import { EmptyState, LoadingBlock, StaleBanner } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { errorKey } from '../errors.ts';
import { formatDate, formatTimeRange } from '../format.ts';

export function DashboardPage() {
  const { uid, profile } = useTeacher();
  const { t } = useI18n();
  const offerings = useLive(watchMyOfferings, uid);
  const firstName = profile.displayName.split(/\s+/)[0] ?? profile.displayName;

  return (
    <main id="main" className="page">
      <header className="page-header">
        <h1>{t('hello', { name: firstName })}</h1>
        <p className="lead">{t('dashboardLead')}</p>
      </header>
      {offerings.status === 'loading' && <LoadingBlock rows={4} />}
      {offerings.status === 'error' && <EmptyState icon="alert" title={t('loadError')} text={t(errorKey(offerings.error))} />}
      {offerings.status === 'ready' && <>
        {offerings.stale && <StaleBanner />}
        {offerings.data.length === 0
          ? <EmptyState icon="book" title={t('noCourses')} text={t('noCoursesText')} />
          : <>
              <ul className="course-list">
                {[...offerings.data].filter((o) => o.status === 'active').sort((a, b) => a.title.localeCompare(b.title)).map((o) => <CourseRow key={o.id} offering={o} />)}
              </ul>
              {offerings.data.some((o) => o.status !== 'active') && (
                <details className="archived-courses">
                  <summary><Icon name="archive" size={15} />{t('archivedCourses', { n: offerings.data.filter((o) => o.status !== 'active').length })}</summary>
                  <ul className="course-list">
                    {offerings.data.filter((o) => o.status !== 'active').map((o) => <CourseRow key={o.id} offering={o} />)}
                  </ul>
                </details>
              )}
            </>}
      </>}
    </main>
  );
}

function CourseRow({ offering }: { offering: OfferingDTO }) {
  const { t, locale } = useI18n();
  const sessions = useLive(watchSessions, offering.id);
  const records = useLive(watchDraftAttendance, offering.id);
  const now = Date.now();
  const list = sessions.status === 'ready' ? sessions.data.filter((s) => s.status !== 'cancelled') : [];
  const today = list.filter((s) => isSameZonedDay(s.startsAt, now));
  const next = [...list].filter((s) => s.startsAt + s.durationMinutes * 60_000 >= now).sort((a, b) => a.startsAt - b.startsAt)[0];
  const drafts = records.status === 'ready' ? records.data.length : 0;

  return (
    <li className="course-row">
      <Link to={`/courses/${offering.id}`} className="course-row-main">
        <span className="course-code">{offering.courseCode}</span>
        <span className="course-title">{offering.title}</span>
        <span className="course-sub">{offering.groupLabel}<span className="sep" />{offering.termLabel}<span className="sep" />{t('studentsCount', { n: offering.studentUids.length })}</span>
      </Link>
      <div className="course-row-side">
        {today.length > 0 && (
          <div className="today">
            <span className="today-label">{t('todayTitle')}</span>
            {today.map((s) => (
              <Link key={s.id} to={`/courses/${offering.id}/attendance/${s.id}`} className="today-session">
                <Icon name="clock" size={14} />{formatTimeRange(s.startsAt, s.durationMinutes, locale)} {t(s.type)}
                <span className="today-cta">{s.status === 'held' ? t('openSheet') : t('takeAttendance')}</span>
              </Link>
            ))}
          </div>
        )}
        {today.length === 0 && (
          <span className="muted">{next ? <>{t('nextSession')}: {formatDate(next.startsAt, locale)}, {formatTimeRange(next.startsAt, next.durationMinutes, locale)}</> : t('noUpcoming')}</span>
        )}
        {drafts > 0 && <span className="chip chip-draft"><Icon name="pencil" size={13} />{t('draftsToPublish', { n: drafts })}</span>}
      </div>
    </li>
  );
}
