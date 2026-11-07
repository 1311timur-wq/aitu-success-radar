import { useCallback, useEffect, useMemo, useState } from 'react'
import { I18n, STR, fmt } from './i18n.js'
import { StatusIcons } from './components/Icon.jsx'
import { Splash, Welcome, Login, Passcode, FaceId } from './screens/Startup.jsx'
import Main from './screens/Main.jsx'
import { Register, CompleteProfile } from './screens/Register.tsx'
import { useStudentSession } from './session.tsx'

const ls = {
  get(k, d) { try { return localStorage.getItem('mydu.' + k) || d } catch { return d } },
  set(k, v) { try { localStorage.setItem('mydu.' + k, v) } catch { /* private mode */ } },
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t) }, [])
  return now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function App() {
  const [lang, setLangState] = useState(() => ls.get('lang', 'ru'))
  const [theme, setThemeState] = useState(() => ls.get('theme', 'auto'))
  const { session, signOut } = useStudentSession()
  // Startup: splash -> (signed in ? main : welcome -> login -> splash -> passcode -> Face ID -> main).
  // Passcode and Face ID are visual demo screens; the real authentication is Firebase Auth on the login screen.
  const [stage, setStage] = useState('splash1')
  const [splashDone, setSplashDone] = useState(false)
  useEffect(() => {
    if (stage !== 'splash1' || !splashDone || session.status === 'loading') return
    setStage(session.status === 'signed-in' ? 'main' : 'welcome')
  }, [stage, splashDone, session.status])
  useEffect(() => {
    if (stage === 'main' && session.status === 'signed-out') setStage('welcome')
  }, [stage, session.status])
  const [toastMsg, setToastMsg] = useState(null)
  const [faceId, setFaceId] = useState(false)
  // Notification sound is OFF by default and only ever plays after a user gesture (never autoplay).
  const [sound, setSoundState] = useState(() => ls.get('sound', 'off') === 'on')
  const setSound = (v) => { setSoundState(v); ls.set('sound', v ? 'on' : 'off') }
  const [passcode, setPasscode] = useState('')
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [sysDark, setSysDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true)
  const clock = useClock()

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = (e) => setSysDark(e.matches)
    mq.addEventListener?.('change', on)
    const rs = () => setView({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', rs)
    return () => { mq.removeEventListener?.('change', on); window.removeEventListener('resize', rs) }
  }, [])

  const scheme = theme === 'auto' ? (sysDark ? 'dark' : 'light') : theme
  useEffect(() => {
    document.documentElement.dataset.scheme = scheme
    document.documentElement.lang = lang
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = scheme === 'dark' ? '#242424' : '#f2f3f5'
  }, [scheme, lang])

  const setLang = (l) => { setLangState(l); ls.set('lang', l) }
  const setTheme = (t) => { setThemeState(t); ls.set('theme', t) }
  const t = useCallback((k, vars) => { const v = STR[lang][k] ?? STR.ru[k] ?? k; return typeof v === 'string' ? fmt(v, vars) : v }, [lang])
  const toast = useCallback((msg) => { setToastMsg(msg); clearTimeout(window.__toast); window.__toast = setTimeout(() => setToastMsg(null), 2200) }, [])

  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone
  // Phone mock-up only on desktop (mouse). Phones and tablets get the real full-screen app.
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  const frame = view.w > 520 && view.h > 560 && !standalone && !coarse
  const scale = frame ? Math.min(1, (view.h - 24) / 872, (view.w - 24) / 413) : 1

  const ctx = useMemo(() => ({ lang, setLang, theme, setTheme, scheme, t, toast, faceId, setFaceId, sound, setSound, passcode, setPasscode, frame }), [lang, theme, scheme, t, toast, faceId, sound, passcode, frame])

  const blue = stage === 'welcome'
  let body
  switch (stage) {
    case 'splash1': body = <Splash onDone={() => setSplashDone(true)} />; break
    case 'welcome': body = <Welcome onStudent={() => setStage('login')} />; break
    case 'login': body = <Login onAuthed={() => setStage('splash2')} onRegister={() => setStage('register')} />; break
    case 'register': body = <Register onDone={() => setStage('splash2')} onBack={() => setStage('login')} />; break
    case 'splash2': body = <Splash onDone={() => setStage('pass1')} />; break
    case 'pass1': case 'pass2': body = <Passcode onDone={() => setStage('faceid')} />; break
    case 'faceid': body = <FaceId onDone={() => setStage('main')} />; break
    default: body = session.status === 'needs-profile'
      ? <CompleteProfile />
      : <Main onLogout={() => { setPasscode(''); setStage('welcome'); void signOut() }} />
  }

  const device = (
    <div className={'device' + (frame ? '' : ' full')}>
      {frame && <div className="island" />}
      {frame && <div className={'statusbar' + (blue ? ' on-blue' : '')}><span>{clock}</span><StatusIcons /></div>}
      {body}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  )

  return (
    <I18n.Provider value={ctx}>
      <div className={'stage' + (frame ? '' : ' full')}>
        {frame ? <div className="bezel" style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}>{device}</div> : device}
      </div>
    </I18n.Provider>
  )
}
