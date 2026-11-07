import { useEffect, useState } from 'react'
import { useApp, MONTHS_RU, MONTHS_EN } from '../i18n.js'
import { playNotifySound } from '../components/GradeNotifier.tsx'
import Icon from '../components/Icon.jsx'
import { ANNOUNCEMENTS, NOTIFICATIONS } from '../data.js'
import { useSignedInStudent } from '../session.tsx'
import { AnnCard } from './Tabs.jsx'

const A = './assets/'

export function Modal({ title, nav, children, light }) {
  return (
    <div className="modal" role="dialog" aria-label={title}>
      <div className="mhdr">
        <h2>{title}</h2>
        <button className="x" onClick={nav.pop} aria-label="Close"><Icon name="x" size={22} sw={2} /></button>
      </div>
      <div className="mbody">{children}</div>
    </div>
  )
}

function Skeleton({ n = 2 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="skel-card" style={{ borderRadius: 20 }}>
          <div className="skel" style={{ width: '33%' }} /><div className="skel" style={{ width: '58%' }} />
          {i === 0 && <><div className="skel" style={{ width: '27%' }} /><div className="skel" style={{ width: '52%' }} /></>}
        </div>
      ))}
    </div>
  )
}
function useReady(ms = 900) {
  const [r, setR] = useState(false)
  useEffect(() => { const id = setTimeout(() => setR(true), ms); return () => clearTimeout(id) }, [])
  return r
}

export function NotificationsModal({ nav, open }) {
  const { t, lang } = useApp()
  const ready = useReady(1000)
  return (
    <Modal title={t('notifications')} nav={nav}>
      {!ready ? <Skeleton /> : (
        <div className="notif">
          {NOTIFICATIONS.map((n) => (
            <button key={n.id} onClick={() => { nav.pop(); open(n.id) }}>
              <span className="circ"><Icon name={n.icon} size={22} sw={1.6} /></span>{n[lang]}
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}

function Empty({ icon, text }) {
  const { t } = useApp()
  return (
    <div className="page-empty">
      <span className="tile"><Icon name={icon} size={30} sw={1.5} /></span>
      <div>{text}</div>
      <span className="demo-chip">{t('demoNote')}</span>
    </div>
  )
}

function CalendarGrid() {
  const { t, lang } = useApp()
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  const first = (new Date(y, m, 1).getDay() + 6) % 7
  const days = new Date(y, m + 1, 0).getDate()
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  return (
    <div className="cal">
      <h3>{(lang === 'en' ? MONTHS_EN : MONTHS_RU.map((s) => s[0].toUpperCase() + s.slice(1)))[m]} {y}</h3>
      <div className="grid">
        {t('weekdays').map((d) => <div key={d} className="wd">{d}</div>)}
        {cells.map((d, i) => <div key={i} className={'d' + (d === now.getDate() ? ' today' : '')}>{d}</div>)}
      </div>
      <div className="note">{t('demoNote')}: {t('demoEmpty')}</div>
    </div>
  )
}

const IEP_LOOK = { MATH101: ['sigma', '#4b3fd8'], MATH102: ['wave', '#5a45e0'], CSE104: ['route', '#0e7c86'], SE101: ['code', '#1f9d63'], ENG101: ['book', '#1d6fe0'] }

export function MenuPage({ id, nav }) {
  const { t } = useApp()
  const { radar } = useSignedInStudent()
  const ready = useReady(id === 'peer' ? 1000 : 350)
  const titles = { dorm: 'dorm', calendar: 'calendar', schedule: 'schedule', docs: 'docs', applications: 'applications', iep: 'iep', peer: 'peer' }
  let body
  if (!ready) body = <Skeleton />
  else if (id === 'calendar') body = <CalendarGrid />
  else if (id === 'dorm') body = <Empty icon="home" text={t('emptyDorm')} />
  else if (id === 'schedule') body = <Empty icon="calendar" text={t('emptySchedule')} />
  else if (id === 'peer') body = <Empty icon="user" text={t('emptyPeer')} />
  else if (id === 'applications') body = <><Empty icon="clipboard" text={t('emptyApps')} /><button className="apps-cta" disabled>+ {t('applications')}</button></>
  else if (id === 'docs') body = <button className="doc-row" onClick={() => nav.push({ type: 'contract' })}><span className="tile"><Icon name="doc" size={20} sw={1.6} /></span>{t('contractTitle')}</button>
  else if (id === 'iep') body = (
    <>
      <div className="psub" style={{ margin: '0 4px 10px' }}>{t('iepSub')}{radar.courses[0] ? ` • ${radar.courses[0].termLabel}` : ''}</div>
      <div className="iep-list">
        {radar.status !== 'ready' ? <Skeleton /> : radar.courses.map((c) => {
          const [icon, tint] = IEP_LOOK[c.courseCode] ?? ['book', '#3d4756']
          return (
            <div key={c.offeringId} className="iep-row">
              <span className="cicon" style={{ background: tint, width: 40, height: 40 }}><Icon name={icon} size={20} /></span>
              <span><b>{c.title}</b><small>{c.courseCode}</small></span>
            </div>
          )
        })}
      </div>
    </>
  )
  return <Modal title={t(titles[id] || id)} nav={nav}>{body}</Modal>
}

export function PickerModal({ kind, nav }) {
  const { t, lang, setLang, theme, setTheme, faceId, setFaceId, toast, sound, setSound } = useApp()
  const Opt = ({ on, children, onClick }) => <button className={'opt' + (on ? ' on' : '')} onClick={onClick}>{children}{on && <Icon name="check" size={22} sw={2.2} />}</button>
  let title, list
  if (kind === 'lang') {
    title = t('language')
    list = [['ru', 'Русский'], ['en', 'English']].map(([k, n]) => <Opt key={k} on={lang === k} onClick={() => { setLang(k); nav.pop() }}>{n}</Opt>)
  } else if (kind === 'theme') {
    title = t('appTheme')
    list = [['auto', t('themeAuto')], ['light', t('themeLight')], ['dark', t('themeDark')]].map(([k, n]) => <Opt key={k} on={theme === k} onClick={() => { setTheme(k); nav.pop() }}>{n}</Opt>)
  } else if (kind === 'sound') {
    title = t('notifySound')
    list = [
      <Opt key="off" on={!sound} onClick={() => { setSound(false); nav.pop() }}>{t('soundOff')}</Opt>,
      <Opt key="on" on={sound} onClick={() => { setSound(true); playNotifySound(); nav.pop() }}>{t('soundOn')}</Opt>,
      <p key="n" className="sheet-note">{t('soundNote')}</p>,
    ]
  } else {
    title = t('security')
    list = [
      <Opt key="p" onClick={() => toast(t('toastDemo'))}>{t('changePass')}</Opt>,
      <button key="f" className="opt" onClick={() => setFaceId(!faceId)}>{t('faceId')}<span style={{ color: faceId ? 'var(--accent)' : 'var(--muted)' }}>{faceId ? t('on') : t('off')}</span></button>,
    ]
  }
  return <Modal title={title} nav={nav}><div className="sheet-list">{list}</div></Modal>
}

export function ContractModal({ nav }) {
  const { t } = useApp()
  return <Modal title={t('contractTitle')} nav={nav}><div className="card"><p style={{ margin: 0, lineHeight: 1.45 }}>{t('contractText')}</p></div></Modal>
}

export function AnnouncementsModal({ nav }) {
  const { t } = useApp()
  return (
    <Modal title={t('announcements')} nav={nav}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ANNOUNCEMENTS.map((a) => <AnnCard key={a.id} a={a} onClick={() => nav.push({ type: 'announcement', id: a.id })} />)}
      </div>
    </Modal>
  )
}

export function AnnouncementModal({ id, nav }) {
  const { t } = useApp()
  const a = ANNOUNCEMENTS.find((x) => x.id === id)
  return (
    <Modal title={t('announcements')} nav={nav}>
      <AnnCard a={a} full />
      <div className="note">{t('fullTextNA')}</div>
    </Modal>
  )
}

export function Confirm({ title, text, yes, no, danger, onYes, onNo }) {
  return (
    <div className="scrim" style={{ zIndex: 96 }}>
      <div className="ios-alert" role="alertdialog">
        <div className="body"><h4>{title}</h4><p>{text}</p></div>
        <div className="row"><button onClick={onNo}>{no}</button><button className={danger ? 'danger' : ''} onClick={onYes}>{yes}</button></div>
      </div>
    </div>
  )
}
