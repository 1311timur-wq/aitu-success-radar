import { useEffect, useState } from 'react'
import { useApp, fmtDate } from '../i18n.js'
import Icon from '../components/Icon.jsx'
import { ANNOUNCEMENTS, MENU } from '../data.js'
import { firstName, useSignedInStudent, yearOfStudy } from '../session.tsx'
import { Confirm } from './Pages.jsx'
import { PlanCard } from './WeeklyPlan.tsx'
import { programLabel } from '@aitu/domain'

const A = './assets/'

function Header({ title, nav, onSurface }) {
  const { t } = useApp()
  return (
    <header className={'hdr' + (onSurface ? ' on-surface' : '')}>
      <img className="fox" src={A + 'dew-head.webp'} width="76" height="91" alt="" />
      <h1>{title}</h1>
      {nav && (
        <button className="bell" onClick={() => nav.push({ type: 'notifications' })} aria-label={t('notifications')}>
          <Icon name="bell" size={25} sw={1.5} /><b>4</b>
        </button>
      )}
    </header>
  )
}

function useReady(ms = 900) {
  const [r, setR] = useState(false)
  useEffect(() => { const id = setTimeout(() => setR(true), ms); return () => clearTimeout(id) }, [])
  return r
}

export function AnnCard({ a, full, onClick }) {
  const { lang } = useApp()
  const L = a[lang]
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={'card ann' + (full ? ' full' : '')} onClick={onClick}>
      <div className="date">{fmtDate(a.date, lang)}</div>
      <div className="title">{L.title}</div>
      {L.body && <div className="body">{L.body}</div>}
    </Tag>
  )
}

// First visit shows skeleton cards (seen in the recording), later visits are instant.
let homeSeen = false
export function Home({ nav }) {
  const { t } = useApp()
  const { profile } = useSignedInStudent()
  const [ready0] = useState(homeSeen)
  const ready = useReady(ready0 ? 0 : 900); homeSeen = true
  const name = firstName(profile.displayName)
  return (
    <>
      <Header title={t('hello', { name })} nav={nav} />
      <div className="content">
        <div className="stories">
          <button className="story" onClick={() => nav.push({ type: 'story', index: 0 })}><img src={A + 'story-merch-thumb.webp'} width="200" height="200" alt="" /><span>{t('merch')}</span></button>
          <button className="story" onClick={() => nav.push({ type: 'story', index: 1 })}><img src={A + 'story-reg-thumb.webp'} width="200" height="200" alt="" /><span>{t('registration')}</span></button>
        </div>
        <button className="assistant" onClick={() => nav.push({ type: 'chat' })}>
          <span>{t('assistantBar')}</span><Icon name="chat" size={28} sw={2} />
        </button>
        <PlanCard onOpen={() => nav.push({ type: 'plan' })} />
        <div className="sec-head">
          <h2>{t('announcements')}</h2>
          <button onClick={() => nav.push({ type: 'announcements' })}>{t('viewAll')} <Icon name="chevR" size={16} sw={2.2} /></button>
        </div>
        <div className="cards">
          {ready
            ? ANNOUNCEMENTS.map((a) => <AnnCard key={a.id} a={a} onClick={() => nav.push({ type: 'announcement', id: a.id })} />)
            : [0, 1, 2].map((i) => <div key={i} className="skel-card"><div className="skel" style={{ width: '38%' }} /><div className="skel" style={{ width: '88%' }} /><div className="skel" style={{ width: '60%' }} /></div>)}
        </div>
      </div>
    </>
  )
}

export function MenuTab({ nav, open }) {
  const { t, lang } = useApp()
  const [q, setQ] = useState('')
  const items = MENU.filter((m) => m[lang].toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <>
      <Header title={t('menuTitle')} nav={nav} />
      <div className="content">
        <label className="search">
          <Icon name="search" size={22} sw={1.6} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchServices')} enterKeyHint="search" />
        </label>
        {items.length === 0 && <div className="empty">{t('nothingFound')}</div>}
        {items.map((m) => (
          <button key={m.id} className={'mrow' + (m.badge ? ' new' : '')} onClick={() => open(m.id)}>
            <span className="tile">{m.icon === 'radar' ? <img src={A + 'radar-mark.svg'} width="34" height="34" alt="" /> : <Icon name={m.icon === 'peer' ? 'headset' : m.icon} size={20} sw={1.6} />}</span>
            <span className="lbl">{m[lang]}</span>
            {m.badge && <span className="badge-new">{t('newBadge')}</span>}
          </button>
        ))}
      </div>
    </>
  )
}

/** Initials instead of a photo: the prototype shows no real personal images. */
const initials = (name) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')

function Field({ k, v }) { return <div className="field"><div className="k">{k}</div><div className="v">{v}</div></div> }

export function ProfileTab({ nav }) {
  const { t, theme, sound } = useApp()
  const { profile } = useSignedInStudent()
  const [confirm, setConfirm] = useState(false)
  const year = yearOfStudy(profile.groupLabel)
  const themeName = { auto: t('themeAuto'), light: t('themeLight'), dark: t('themeDark') }[theme]
  return (
    <>
      <Header title={t('profile')} onSurface />
      <div className="content" style={{ paddingBottom: 18 }}>
        <div className="pcard top">
          <div className="avatar initials" aria-hidden="true">{initials(profile.displayName)}</div>
          <div><span className="pill">{t('student')}</span></div>
          <div className="pname">{profile.displayName}</div>
          <div className="psub">{t('courseGroup', { c: year ?? t('noProfileValue'), g: profile.groupLabel || t('noProfileValue') })}</div>
        </div>
        <div className="pcard">
          <Field k={t('barcode')} v={profile.studentNumber || t('noProfileValue')} />
          <Field k={t('corpMail')} v={profile.email || t('noProfileValue')} />
          <Field k={t('degree')} v={t('degreeV')} />
          <Field k={t('epGroup')} v={t('epGroupV')} />
          <Field k={t('program')} v={profile.program ? programLabel(profile.program) : t('programV')} />
        </div>
        <button className="pcard linkrow" style={{ borderRadius: 0 }} onClick={() => nav.push({ type: 'contract' })}>
          <span className="tile"><Icon name="doc" size={20} sw={1.6} /></span>
          <span className="lbl">{t('contract')}</span><Icon name="chevR" size={16} sw={2} className="chev" />
        </button>
        <div className="pcard">
          <div className="group-title">{t('basic')}</div>
          <button className="linkrow group-row" onClick={() => nav.push({ type: 'picker', kind: 'lang' })}>
            <span className="tile"><Icon name="globe" size={20} sw={1.6} /></span><span className="lbl">{t('language')}</span><span className="val">{t('langName')}</span><Icon name="chevR" size={16} sw={2} className="chev" />
          </button>
          <button className="linkrow group-row" onClick={() => nav.push({ type: 'picker', kind: 'theme' })}>
            <span className="tile green"><Icon name="sun" size={20} sw={1.6} /></span><span className="lbl">{t('appTheme')}</span><span className="val">{themeName}</span><Icon name="chevR" size={16} sw={2} className="chev" />
          </button>
          <button className="linkrow group-row" onClick={() => nav.push({ type: 'picker', kind: 'sound' })}>
            <span className="tile"><Icon name="bell" size={20} sw={1.6} /></span><span className="lbl">{t('notifySound')}</span><span className="val">{sound ? t('on') : t('off')}</span><Icon name="chevR" size={16} sw={2} className="chev" />
          </button>
          <button className="linkrow group-row" onClick={() => nav.push({ type: 'picker', kind: 'security' })}>
            <span className="tile"><Icon name="lock" size={20} sw={1.6} /></span><span className="lbl">{t('security')}</span><span className="val">{t('passcode')}</span><Icon name="chevR" size={16} sw={2} className="chev" />
          </button>
        </div>
        <div className="pcard">
          <div className="group-title">{t('other')}</div>
          <button className="linkrow logout" onClick={() => setConfirm(true)}>
            <span className="tile danger"><Icon name="logout" size={20} sw={1.6} /></span><span className="lbl">{t('logout')}</span>
          </button>
        </div>
      </div>
      {confirm && <Confirm title={t('logoutQ')} text={t('logoutText')} yes={t('logout')} no={t('cancel')} danger onNo={() => setConfirm(false)} onYes={nav.onLogout} />}
    </>
  )
}
