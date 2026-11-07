import { useEffect, useRef, useState } from 'react'
import { useApp } from '../i18n.js'
import Icon from '../components/Icon.jsx'
import { Modal } from './Pages.jsx'

const A = './assets/'

// Canned, fully-offline assistant. Keyword -> reply, per language.
const KB = {
  ru: [
    [/расписан|пары|занят/, 'Расписание занятий находится в разделе «Меню → Расписание занятий». В демо-версии оно не заполнено.'],
    [/регистр|дисциплин/, 'Регистрация на дисциплины — на главном экране, плитка «Регистрация на дисциплины». Помните: регистрация в установленные сроки обязательна.'],
    [/общежити|жиль/, 'Информация о проживании — в «Меню → Общежитие».'],
    [/радар|риск|успеваем|посещаем/, 'Student Success Radar показывает ваш статус по каждому курсу: посещаемость, задания и результаты. Откройте «Меню → Student Success Radar».'],
    [/мерч|одежд|худи/, 'Мерч AITU — плитка «Мерч-магазин AITU» на главном экране.'],
    [/привет|здравств|дью/, 'Привет! Я Дью, цифровой помощник AITU. Спросите про расписание, регистрацию, общежитие или Radar.'],
  ],
  en: [
    [/schedule|timetable|class/, 'The class schedule is under “Menu → Class schedule”. It is empty in the demo.'],
    [/regist|course/, 'Course registration is the tile on the Home screen. Remember: registering within the deadlines is mandatory.'],
    [/dorm|housing|accommodation/, 'Housing information is under “Menu → Dormitory”.'],
    [/radar|risk|attendance|grades/, 'Student Success Radar shows your status per course: attendance, assignments and results. Open “Menu → Student Success Radar”.'],
    [/merch|hoodie|clothes/, 'AITU merch is the “AITU Merch Shop” tile on the Home screen.'],
    [/hi|hello|dew/, "Hi! I'm Dew, the AITU digital assistant. Ask about the schedule, registration, dorm or Radar."],
  ],
}
const FALLBACK = { ru: 'Я работаю офлайн в демо-режиме и знаю не всё. Попробуйте спросить про расписание, регистрацию, общежитие или Radar.', en: "I'm running offline in demo mode and don't know everything. Try asking about the schedule, registration, dorm or Radar." }
const CHIPS = { ru: ['Расписание', 'Регистрация на дисциплины', 'Что такое Radar?'], en: ['Schedule', 'Course registration', 'What is Radar?'] }

export function Chat({ nav }) {
  const { t, lang } = useApp()
  const [msgs, setMsgs] = useState([{ me: false, text: t('helloDew') + ' ' + t('imDew') + '.' }])
  const [text, setText] = useState('')
  const end = useRef(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs])
  const send = (q) => {
    const s = (q ?? text).trim(); if (!s) return
    setMsgs((m) => [...m, { me: true, text: s }]); setText('')
    const hit = KB[lang].find(([re]) => re.test(s.toLowerCase()))
    setTimeout(() => setMsgs((m) => [...m, { me: false, text: hit ? hit[1] : FALLBACK[lang] }]), 450)
  }
  return (
    <div className="modal" role="dialog" aria-label="Dew">
      <div className="mhdr"><h2>Dew</h2><button className="x" onClick={nav.pop} aria-label="Close"><Icon name="x" size={22} sw={2} /></button></div>
      <div className="chat">
        {msgs.map((m, i) => <div key={i} className={'msg ' + (m.me ? 'me' : 'bot')}>{m.text}</div>)}
        <div ref={end} />
      </div>
      <div className="chips">{CHIPS[lang].map((c) => <button key={c} onClick={() => send(c)}>{c}</button>)}</div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send() }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('typeMsg')} aria-label={t('typeMsg')} />
        <button type="submit" aria-label={t('send')}><Icon name="send" size={20} /></button>
      </form>
    </div>
  )
}

export function StoryViewer({ index, nav }) {
  const { t } = useApp()
  const [i, setI] = useState(index)
  const items = [
    { img: 'story-merch.webp', title: t('merch'), text: { ru: 'Худи, футболки и аксессуары с символикой AITU. Демо-экран: покупка не подключена.', en: 'Hoodies, T-shirts and accessories with AITU branding. Demo screen: purchasing is not connected.' } },
    { img: 'story-reg.webp', title: t('registration'), text: { ru: 'Регистрация на дисциплины проходит в установленные сроки. Демо-экран: запись не подключена.', en: 'Course registration happens within the set deadlines. Demo screen: enrolment is not connected.' } },
  ]
  const { lang } = useApp()
  useEffect(() => {
    const id = setTimeout(() => (i < items.length - 1 ? setI(i + 1) : nav.pop()), 6000)
    return () => clearTimeout(id)
  }, [i])
  const it = items[i]
  return (
    <div className="storyv" onClick={() => (i < items.length - 1 ? setI(i + 1) : nav.pop())}>
      <img src={A + it.img} width="720" height="1280" alt="" />
      <div className="prog"><i key={i} /></div>
      <button className="close" onClick={(e) => { e.stopPropagation(); nav.pop() }} aria-label="Close"><Icon name="x" size={20} sw={2.2} /></button>
      <div className="cap"><h3>{it.title}</h3><p>{it.text[lang]}</p></div>
    </div>
  )
}
