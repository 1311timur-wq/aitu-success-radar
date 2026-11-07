import { useEffect, useState } from 'react'
import { useApp } from '../i18n.js'
import Icon from '../components/Icon.jsx'
import { Home, MenuTab, ProfileTab } from './Tabs.jsx'
import { Modal, NotificationsModal, MenuPage, PickerModal, ContractModal, AnnouncementModal, AnnouncementsModal } from './Pages.jsx'
import Radar from './Radar.tsx'
import GradeNotifier from '../components/GradeNotifier.tsx'
import WeeklyPlan from './WeeklyPlan.tsx'
import JoinCourse from './JoinCourse.tsx'
import Checkin from './Checkin.tsx'
import { useStudentSession } from '../session.tsx'
import { Chat, StoryViewer } from './Chat.jsx'

export default function Main({ onLogout }) {
  const { t } = useApp()
  const [tab, setTab] = useState('home')
  const [stack, setStack] = useState([])
  const push = (o) => setStack((s) => [...s, o])
  const pop = () => setStack((s) => s.slice(0, -1))
  const swap = (o) => setStack((s) => [...s.slice(0, -1), o])
  const nav = { push, pop, swap, setTab, onLogout }

  // Android / desktop back button closes the topmost overlay
  useEffect(() => {
    if (!stack.length) return
    window.history.pushState({ o: stack.length }, '')
    const onPop = () => setStack((s) => s.slice(0, -1))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [stack.length])

  const OVERLAY_PAGES = ['radar', 'plan', 'join', 'checkin']
  const open = (id) => (OVERLAY_PAGES.includes(id) ? push({ type: id }) : push({ type: 'page', id }))

  // A QR scan (?checkin=…) or a join link (?join=CODE) opened the app: show that screen once.
  const { pending, clearPending } = useStudentSession()
  useEffect(() => {
    if (!pending) return
    if (pending.kind === 'checkin') push({ type: 'checkin', scanned: { offeringId: pending.offeringId, sessionId: pending.sessionId, code: pending.code } })
    else push({ type: 'join', code: pending.code })
    clearPending()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  return (
    <div className="screen" style={{ animation: 'none' }}>
      {tab === 'home' && <Home nav={nav} open={open} />}
      {tab === 'menu' && <MenuTab nav={nav} open={open} />}
      {tab === 'profile' && <ProfileTab nav={nav} />}
      <nav className="tabbar" aria-label="Tabs">
        {[['home', 'home', t('home')], ['menu', 'menu', t('menu')], ['profile', 'user', t('profile')]].map(([id, ic, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => { setTab(id); setStack([]) }} aria-current={tab === id}>
            <Icon name={ic} size={24} sw={1.7} />{label}
          </button>
        ))}
      </nav>
      {stack.map((o, i) => <Overlay key={i} o={o} nav={nav} open={open} />)}
      <GradeNotifier onOpen={(course) => push({ type: 'radar', course })} />
    </div>
  )
}

function Overlay({ o, nav, open }) {
  switch (o.type) {
    case 'notifications': return <NotificationsModal nav={nav} open={open} />
    case 'page': return <MenuPage id={o.id} nav={nav} />
    case 'radar': return <Radar nav={nav} initialCourse={o.course} />
    case 'plan': return <WeeklyPlan nav={nav} />
    case 'join': return <JoinCourse nav={nav} initialCode={o.code} />
    case 'checkin': return <Checkin nav={nav} scanned={o.scanned} />
    case 'chat': return <Chat nav={nav} />
    case 'story': return <StoryViewer index={o.index} nav={nav} />
    case 'announcements': return <AnnouncementsModal nav={nav} />
    case 'announcement': return <AnnouncementModal id={o.id} nav={nav} />
    case 'picker': return <PickerModal kind={o.kind} nav={nav} />
    case 'contract': return <ContractModal nav={nav} />
    default: return null
  }
}
export { Modal }
