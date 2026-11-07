import { useEffect, useRef, useState } from 'react'
import { useApp } from '../i18n.js'
import Icon from '../components/Icon.jsx'
import { NotAStudentError, useStudentSession } from '../session.tsx'
import { showDemoAccounts } from '../firebase.ts'
import { ForgotPassword } from './Register.tsx'

const A = './assets/'

export function Splash({ onDone, ms = 1700 }) {
  useEffect(() => { const id = setTimeout(onDone, ms); return () => clearTimeout(id) }, [])
  return (
    <div className="screen splash" aria-label="Astana IT University">
      <img className="logo" src={A + 'logo-white.webp'} width="304" height="160" alt="Astana IT University" />
      <div className="bar"><i /></div>
    </div>
  )
}

function LangChip({ dark }) {
  const { lang, setLang } = useApp()
  return (
    <button className={'lang-chip' + (dark ? ' dark' : '')} onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')} aria-label="Language">
      <Icon name="globe" size={18} sw={1.6} /> {lang.toUpperCase()}
    </button>
  )
}

export function Welcome({ onStudent }) {
  const { t, toast } = useApp()
  return (
    <div className="screen welcome">
      <LangChip />
      <img className="logo" src={A + 'logo-white.webp'} width="304" height="160" alt="Astana IT University" />
      <img className="dew" src={A + 'dew-wink.webp'} width="412" height="458" fetchPriority="high" alt={t('dewAlt')} />
      <div className="bubble b1">{t('helloDew')}</div>
      <div className="bubble b2">{t('imDew')}</div>
      <div className="btns">
        <button className="pill-btn" onClick={onStudent}>{t('imStudent')}</button>
        <button className="pill-btn" onClick={() => toast(t('applicantDemo'))}>{t('imApplicant')}</button>
      </div>
    </div>
  )
}

// Synthetic demo students (scripts/seed-data.ts). Password for all: demo-pass-2026.
const DEMO_PASSWORD = 'demo-pass-2026'
const DEMO_STUDENTS = [
  { email: 'student01@demo.aitu.kz', name: 'Арман Серикбаев', hint: 'demoArman' },
  { email: 'student02@demo.aitu.kz', name: 'SE-2419', hint: 'demoGroup' },
  { email: 'student26@demo.aitu.kz', name: 'SE-2420', hint: 'demoGroup' },
]

function authErrorKey(e) {
  if (e instanceof NotAStudentError) return 'notStudent'
  const code = String(e?.code ?? '')
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(code)) return 'errCredentials'
  if (code.includes('too-many-requests')) return 'errTooMany'
  if (code.includes('network-request-failed')) return 'errNetwork'
  return 'errGeneric'
}

export function Login({ onAuthed, onRegister }) {
  const { t, toast } = useApp()
  const { signIn } = useStudentSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [forgot, setForgot] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await signIn(email, password); onAuthed() }
    catch (err) { setError(t(authErrorKey(err))) }
    finally { setBusy(false) }
  }

  return (
    <div className="screen login login-real">
      <LangChip dark />
      <img className="logo" src={A + 'logo-white.webp'} width="304" height="160" alt="Astana IT University" />
      <img className="dew" src={A + 'dew-wave.webp'} width="256" height="307" alt="" />
      <h1>{t('welcome')}</h1>
      <div className="sub">{t('authNeeded')}</div>
      <form className="auth auth-form" onSubmit={submit} noValidate>
        <input type="email" autoComplete="username" placeholder={t('emailPh')} aria-label={t('emailPh')} value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" autoComplete="current-password" placeholder={t('passwordPh')} aria-label={t('passwordPh')} value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button type="submit" className="auth-primary" disabled={busy || !email || !password}>{busy ? t('signingIn') : t('signIn')}</button>
        <button type="button" className="link-btn" onClick={() => setForgot(true)}>{t('forgotPassword')}</button>
        <button type="button" className="auth-register" onClick={onRegister}>{t('noAccount')} <b>{t('registerCta')}</b></button>
      </form>
      {showDemoAccounts && (
        <div className="demo-logins">
          <span>{t('demoAccounts')}</span>
          {DEMO_STUDENTS.map((d) => (
            <button key={d.email} type="button" onClick={() => { setEmail(d.email); setPassword(DEMO_PASSWORD); setError(null) }}>
              <b>{d.name}</b><small>{d.email} · {t(d.hint)}</small>
            </button>
          ))}
        </div>
      )}
      <div className="legal">{t('agree')}</div>
      {forgot && <ForgotPassword initialEmail={email} onClose={() => setForgot(false)} />}
    </div>
  )
}

export function Passcode({ onDone }) {
  const { t, setPasscode } = useApp()
  const [first, setFirst] = useState(null)
  const [val, setVal] = useState('')
  const [shake, setShake] = useState(false)
  const [err, setErr] = useState(false)
  const lock = useRef(false)
  const step = first === null ? 1 : 2

  const press = (d) => {
    if (lock.current || val.length >= 4) return
    const next = val + d
    setVal(next); setErr(false)
    if (next.length === 4) {
      lock.current = true
      setTimeout(() => {
        if (step === 1) { setFirst(next); setVal('') }
        else if (next === first) { setPasscode(next); onDone(); return }
        else { setShake(true); setErr(true); setTimeout(() => { setShake(false); setVal(''); setFirst(null); lock.current = false }, 450); return }
        lock.current = false
      }, 180)
    }
  }
  const del = () => !lock.current && setVal(val.slice(0, -1))

  return (
    <div className="screen pass">
      <div className="step">{t('stepOf', { n: step })}</div>
      <div className="hd">
        {step === 1 ? <><h2>{t('createPass')}</h2><p>{t('createPassSub')}</p></> : <h2 style={{ marginTop: 22 }}>{t('repeatPass')}</h2>}
      </div>
      <div className={'dots' + (step === 2 ? ' s2' : '') + (shake ? ' shake' : '')} aria-label="passcode">
        {[0, 1, 2, 3].map((i) => <i key={i} className={i < val.length ? 'on' : ''} />)}
      </div>
      {err && <div className="err">{t('passMismatch')}</div>}
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => press(d)}>{d}</button>)}
        <span />
        <button onClick={() => press('0')}>0</button>
        <button onClick={del} aria-label="Delete"><Icon name="backspace" size={28} sw={1.5} /></button>
      </div>
      {step === 2 && <button className="backlink" onClick={() => { setFirst(null); setVal('') }}>{t('back')}</button>}
    </div>
  )
}

export function FaceId({ onDone }) {
  const { t, setFaceId, toast } = useApp()
  return (
    <div className="screen faceid">
      <div className="ic"><Icon name="faceid" size={56} sw={1.5} /></div>
      <h2>{t('faceQ')}</h2>
      <p>{t('faceSub')}</p>
      <button className="cta" onClick={() => { setFaceId(true); toast(t('faceEnabled')); onDone() }}>{t('faceOn')}</button>
      <button className="skip" onClick={() => { setFaceId(false); onDone() }}>{t('notNow')}</button>
    </div>
  )
}
