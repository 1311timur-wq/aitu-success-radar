import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './firebase.ts';
import { I18nProvider } from './i18n/index.tsx';
import { AuthProvider } from './auth/AuthProvider.tsx';
import { ToastProvider } from './components/ui.tsx';
import { App } from './App.tsx';
import './styles/tokens.css';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </I18nProvider>
  </StrictMode>,
);
