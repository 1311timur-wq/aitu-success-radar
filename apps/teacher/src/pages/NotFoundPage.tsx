import { Link } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { EmptyState } from '../components/ui.tsx';

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <main id="main" className="page page-narrow">
      <EmptyState icon="search" title={t('notFound')} text={t('notFoundText')} action={<Link className="btn" to="/">{t('toCourses')}</Link>} />
    </main>
  );
}
