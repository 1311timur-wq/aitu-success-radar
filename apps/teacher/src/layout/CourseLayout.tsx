import { Link, NavLink, Outlet, useParams } from 'react-router';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { CourseProvider, useCourseSubscription, type CourseData } from '../course/CourseContext.tsx';
import { EmptyState, LoadingBlock, StaleBanner } from '../components/ui.tsx';
import { Icon, type IconName } from '../components/Icon.tsx';
import { errorKey } from '../errors.ts';
import { formatDate } from '../format.ts';

const TABS: { to: string; label: MessageKey; icon: IconName }[] = [
  { to: '', label: 'tabOverview', icon: 'home' },
  { to: 'attendance', label: 'tabAttendance', icon: 'calendar' },
  { to: 'grades', label: 'tabGrades', icon: 'book' },
  { to: 'participants', label: 'tabParticipants', icon: 'users' },
  { to: 'radar', label: 'tabRadar', icon: 'radar' },
];

export function CourseLayout() {
  const { offeringId = '' } = useParams();
  const { t } = useI18n();
  const state = useCourseSubscription(offeringId);

  if (state.status === 'loading') return <main id="main" className="page"><LoadingBlock rows={8} /></main>;
  if (state.status === 'missing' || (state.status === 'error' && state.error.kind === 'permission-denied')) {
    return <main id="main" className="page"><EmptyState icon="lock" title={t('noAccess')} text={t('noAccessText')}
      action={<Link className="btn" to="/">{t('toCourses')}</Link>} /></main>;
  }
  if (state.status === 'error') {
    return <main id="main" className="page"><EmptyState icon="alert" title={t('loadError')} text={t(errorKey(state.error))}
      action={<button className="btn" onClick={() => window.location.reload()}>{t('retry')}</button>} /></main>;
  }
  const course = state.data;
  return (
    <CourseProvider value={course}>
      <div className="course">
        <CourseIndex course={course} />
        <main id="main" className="course-main">
          <header className="course-header">
            <div className="crumbs"><Link to="/">{t('navDashboard')}</Link><Icon name="chevronRight" size={14} /><span>{course.offering.courseCode}</span></div>
            <h1>{course.offering.title}</h1>
            <p className="course-meta">
              <span>{course.offering.courseCode}</span>
              <span>{course.offering.groupLabel}</span>
              <span>{course.offering.termLabel}</span>
            </p>
            <nav className="tabs" aria-label={t('courseIndex')}>
              {TABS.map((tab) => (
                <NavLink key={tab.label} to={tab.to} end={tab.to === ''} className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
                  {t(tab.label)}
                </NavLink>
              ))}
            </nav>
          </header>
          {course.stale && <StaleBanner />}
          <Outlet />
        </main>
      </div>
    </CourseProvider>
  );
}

/** Moodle-like left drawer: course sections + upcoming sessions for quick jumps. */
function CourseIndex({ course }: { course: CourseData }) {
  const { t, locale } = useI18n();
  const recent = course.sessions.filter((s) => s.status !== 'cancelled').slice(0, 6);
  return (
    <aside className="course-index" aria-label={t('courseIndex')}>
      <div className="course-index-title">{t('courseIndex')}</div>
      <ul>
        {TABS.map((tab) => (
          <li key={tab.label}>
            <NavLink to={tab.to} end={tab.to === ''}><Icon name={tab.icon} size={16} />{t(tab.label)}</NavLink>
          </li>
        ))}
      </ul>
      {recent.length > 0 && <>
        <div className="course-index-title">{t('sessionsTitle')}</div>
        <ul className="course-index-sessions">
          {recent.map((s) => (
            <li key={s.id}>
              <NavLink to={`attendance/${s.id}`}>
                <span className={`dot dot-${s.attendancePublication === 'published' ? 'published' : s.status}`} aria-hidden="true" />
                <span>{formatDate(s.startsAt, locale)}</span>
                <small>{t(s.type)}</small>
              </NavLink>
            </li>
          ))}
        </ul>
      </>}
    </aside>
  );
}
