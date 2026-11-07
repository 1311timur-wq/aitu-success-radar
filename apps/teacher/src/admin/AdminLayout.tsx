import { NavLink, Outlet } from 'react-router';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { Icon, type IconName } from '../components/Icon.tsx';

const TABS: { to: string; label: MessageKey; icon: IconName; end?: boolean }[] = [
  { to: '/admin', label: 'adminTabOverview', icon: 'chart', end: true },
  { to: '/admin/users', label: 'adminTabUsers', icon: 'users' },
  { to: '/admin/courses', label: 'adminTabCourses', icon: 'book' },
  { to: '/admin/backup', label: 'adminTabBackup', icon: 'database' },
  { to: '/admin/log', label: 'adminTabLog', icon: 'list' },
];

export function AdminLayout() {
  const { t } = useI18n();
  return (
    <main id="main" className="page page-wide">
      <header className="page-header">
        <p className="kicker"><Icon name="shield" size={14} />{t('navAdmin')}</p>
        <h1>{t('adminTitle')}</h1>
        <nav className="tabs" aria-label={t('navAdmin')}>
          {TABS.map((x) => (
            <NavLink key={x.to} to={x.to} end={x.end} className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
              <Icon name={x.icon} size={15} />{t(x.label)}
            </NavLink>
          ))}
        </nav>
      </header>
      <Outlet />
    </main>
  );
}

/** Saves text as a file in the browser (backup JSON, CSV). */
export function downloadText(fileName: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
