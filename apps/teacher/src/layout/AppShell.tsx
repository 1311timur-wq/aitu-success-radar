import { Link, NavLink, Outlet } from 'react-router';
import { useAuth, useTeacher } from '../auth/AuthProvider.tsx';
import { useI18n } from '../i18n/index.tsx';
import { Icon } from '../components/Icon.tsx';

export function AppShell() {
  const { t, lang, setLang } = useI18n();
  const { signOut } = useAuth();
  const { profile, isAdmin } = useTeacher();
  const teaches = profile.role === 'teacher';
  const initials = profile.displayName.split(/\s+/).map((p) => p[0]).slice(0, 2).join('');
  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="navbar">
        <Link to="/" className="brand" aria-label={t('navDashboard')}>
          <img className="brand-mark" src="/aitu-mark.svg" width="34" height="34" alt="" />
          <span className="brand-text"><b>{t('appName')}</b><small>{t('appRole')}</small></span>
        </Link>
        <nav className="navbar-links" aria-label="Main">
          {teaches && <NavLink to="/" end aria-label={t('navDashboard')}><Icon name="book" size={16} /><span className="nav-label">{t('navDashboard')}</span></NavLink>}
          {isAdmin && <NavLink to="/admin" aria-label={t('navAdmin')}><Icon name="shield" size={16} /><span className="nav-label">{t('navAdmin')}</span></NavLink>}
        </nav>
        <div className="navbar-right">
          <button className="btn btn-ghost btn-sm" onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}>
            <Icon name="globe" size={16} /><span className="btn-label">{t('langSwitch')}</span>
          </button>
          <Link to="/account/password" className="navbar-account" title={t('changePasswordTitle')}>
            <span className="avatar" aria-hidden="true">{initials}</span>
            <span className="navbar-user">{profile.displayName}{isAdmin && <small className="role-tag">{t('roleAdmin')}</small>}</span>
          </Link>
          <button className="btn btn-ghost btn-sm" onClick={() => void signOut()} aria-label={t('signOut')}>
            <Icon name="logout" size={16} /><span className="btn-label">{t('signOut')}</span>
          </button>
        </div>
      </header>
      <div className="demo-strip">{t('demoBanner')}</div>
      <Outlet />
    </div>
  );
}
