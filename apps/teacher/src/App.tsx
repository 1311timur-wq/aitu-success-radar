import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';
import { useAuth, useTeacher } from './auth/AuthProvider.tsx';
import { useI18n } from './i18n/index.tsx';
import { AppShell } from './layout/AppShell.tsx';
import { CourseLayout } from './layout/CourseLayout.tsx';
import { EmptyState, LoadingBlock } from './components/ui.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { OverviewPage } from './pages/OverviewPage.tsx';
import { SessionsPage } from './pages/SessionsPage.tsx';
import { AttendanceSheetPage } from './pages/AttendanceSheetPage.tsx';
import { GradebookPage } from './pages/GradebookPage.tsx';
import { GradeSheetPage } from './pages/GradeSheetPage.tsx';
import { ParticipantsPage } from './pages/ParticipantsPage.tsx';
import { RadarPage } from './pages/RadarPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { ChangePasswordPage } from './pages/ChangePasswordPage.tsx';
import { DoorDisplayPage } from './pages/DoorDisplayPage.tsx';
import { AdminLayout } from './admin/AdminLayout.tsx';
import { AdminOverviewPage } from './admin/AdminOverviewPage.tsx';
import { AdminUsersPage } from './admin/AdminUsersPage.tsx';
import { AdminCoursesPage } from './admin/AdminCoursesPage.tsx';
import { AdminCoursePage } from './admin/AdminCoursePage.tsx';
import { AdminBackupPage } from './admin/AdminBackupPage.tsx';
import { AdminLogPage } from './admin/AdminLogPage.tsx';

/** Signed in as a teacher or an administrator; a teacher with a temporary password must change it first. */
function RequireStaff() {
  const { state, signOut } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  if (state.status === 'loading') return <main className="page"><LoadingBlock /></main>;
  if (state.status === 'signed-out') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  const role = state.profile?.role;
  if (!state.isAdmin && role !== 'teacher') {
    return (
      <main className="page page-narrow">
        <EmptyState icon="lock" title={t('notTeacherTitle')} text={t('notTeacherText', { name: state.profile?.displayName ?? state.user.email ?? '' })}
          action={<button className="btn" onClick={() => void signOut()}>{t('signOut')}</button>} />
      </main>
    );
  }
  if (state.profile?.mustChangePassword && role === 'teacher') return <ChangePasswordPage forced />;
  return <Outlet />;
}

function RequireAdmin() {
  const { isAdmin } = useTeacher();
  const { t } = useI18n();
  if (!isAdmin) return <main className="page page-narrow"><EmptyState icon="lock" title={t('adminOnlyTitle')} text={t('adminOnlyText')} /></main>;
  return <Outlet />;
}

/** "/" → teachers see their courses, administrators the admin panel. */
function Home() {
  const { isAdmin, profile } = useTeacher();
  return isAdmin && profile.role !== 'teacher' ? <Navigate to="/admin" replace /> : <DashboardPage />;
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireStaff />,
    children: [
      // Full-screen display for a tablet / laptop at the classroom door (no navigation chrome).
      { path: 'door/:offeringId/:sessionId', element: <DoorDisplayPage /> },
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Home /> },
          { path: 'account/password', element: <ChangePasswordPage /> },
          {
            path: 'courses/:offeringId',
            element: <CourseLayout />,
            children: [
              { index: true, element: <OverviewPage /> },
              { path: 'attendance', element: <SessionsPage /> },
              { path: 'attendance/:sessionId', element: <AttendanceSheetPage /> },
              { path: 'grades', element: <GradebookPage /> },
              { path: 'grades/:assessmentId', element: <GradeSheetPage /> },
              { path: 'participants', element: <ParticipantsPage /> },
              { path: 'radar', element: <RadarPage /> },
            ],
          },
          {
            path: 'admin',
            element: <RequireAdmin />,
            children: [{
              element: <AdminLayout />,
              children: [
                { index: true, element: <AdminOverviewPage /> },
                { path: 'users', element: <AdminUsersPage /> },
                { path: 'courses', element: <AdminCoursesPage /> },
                { path: 'courses/:offeringId', element: <AdminCoursePage /> },
                { path: 'backup', element: <AdminBackupPage /> },
                { path: 'log', element: <AdminLogPage /> },
              ],
            }],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
