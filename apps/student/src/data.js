// Static demo content of the replica (announcements, menu). The profile and all academic data come from
// Firebase now: see src/session.tsx and src/screens/Radar.tsx.

export const ANNOUNCEMENTS = [
  {
    id: 'a1', date: [2026, 8, 10],
    ru: { title: 'Каждая пятница - День национальной одежды в AITU!', body: 'Поддержи добрую традицию!' },
    en: { title: 'Every Friday is National Clothing Day at AITU!', body: 'Support the good tradition!' },
  },
  {
    id: 'a2', date: [2026, 3, 8],
    ru: { title: 'Инструкция для обучающихся по регистрации', body: 'Важно знать!\n• Регистрация в установленные сроки является обязательной для всех обучающ…' },
    en: { title: 'Registration instructions for students', body: 'Important to know!\n• Registration within the established deadlines is mandatory for all stud…' },
  },
  {
    id: 'a3', date: [2026, 3, 6],
    ru: { title: 'Объявляется конкурс для магистрантов 1 курса на участие в совместной программе двойного диплома с Lawrence Technological University (США)', body: 'Объявляется конкурс на участие в программе двойного диплома (для магистрантов 1 курса):' },
    en: { title: 'Call for 1st-year master\'s students: joint double-degree programme with Lawrence Technological University (USA)', body: 'A call is announced for participation in the double-degree programme (for 1st-year master\'s students):' },
  },
  {
    id: 'a4', date: [2026, 2, 31],
    ru: { title: 'Для студентов Astana IT University открыт конкурс на участие в программе академической мобильности на осенний семестр 2026–2027 учебного года!', body: 'Студенты 1 курса бакалавриата могут подать заявку на обучение в Kyungpook National University (Южная Корея) в течени…' },
    en: { title: 'Astana IT University students: call open for the academic mobility programme, autumn semester 2026–2027!', body: '1st-year bachelor students can apply to study at Kyungpook National University (South Korea) within th…' },
  },
  {
    id: 'a5', date: [2026, 2, 26],
    ru: { title: 'Национальная олимпиада по финансовой безопасности – 2026', body: 'Открыта регистрация на отборочный тур Национальной олимпиады по финансовой безопасности – 2026.' },
    en: { title: 'National Financial Security Olympiad – 2026', body: 'Registration for the qualifying round of the National Financial Security Olympiad – 2026 is open.' },
  },
]

export const NOTIFICATIONS = [
  { id: 'dorm', icon: 'home', ru: 'Общежитие', en: 'Dormitory' },
  { id: 'calendar', icon: 'calendar', ru: 'Академический календарь', en: 'Academic calendar' },
  { id: 'iep', icon: 'route', ru: 'Индивидуальный учебный план', en: 'Individual study plan' },
  { id: 'applications', icon: 'editdoc', ru: 'Заявления', en: 'Applications' },
]

export const MENU = [
  { id: 'dorm', icon: 'home', ru: 'Общежитие', en: 'Dormitory' },
  { id: 'calendar', icon: 'calendar', ru: 'Академический календарь', en: 'Academic calendar' },
  { id: 'schedule', icon: 'calendar', ru: 'Расписание занятий', en: 'Class schedule' },
  { id: 'radar', icon: 'radar', ru: 'Student Success Radar', en: 'Student Success Radar', badge: true },
  { id: 'plan', icon: 'plan', ru: 'Мой план на неделю', en: 'My weekly plan', badge: true },
  { id: 'checkin', icon: 'qr', ru: 'Отметиться на занятии', en: 'Check in to class', badge: true },
  { id: 'join', icon: 'plus', ru: 'Вступить в курс по коду', en: 'Join a course with a code', badge: true },
  { id: 'docs', icon: 'folder', ru: 'Документы для ознакомления', en: 'Documents to review' },
  { id: 'applications', icon: 'clipboard', ru: 'Заявления', en: 'Applications' },
  { id: 'iep', icon: 'route', ru: 'Индивидуальный учебный план', en: 'Individual study plan' },
  { id: 'peer', icon: 'peer', ru: 'Peer Advisor', en: 'Peer Advisor' },
]

