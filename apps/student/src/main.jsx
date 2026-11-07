import { createRoot } from 'react-dom/client'
import './firebase.ts'
import { StudentSessionProvider } from './session.tsx'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StudentSessionProvider>
    <App />
  </StudentSessionProvider>,
)

// Offline shell only in production builds. Private data is never cached by the worker (Firestore is cross-origin).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
