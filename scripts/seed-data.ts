// Pure generator of the synthetic demo dataset v4 (AITU term: week 8 of 10, registers + final, join codes, admin) (no Firebase imports): used by seed.ts and verify-seed.ts.
// 2 groups x 25 students, 5 courses, 4 teachers => 10 offerings, ~5 000 documents (fits the Spark daily write quota).
// Every name, number and result is invented. Not AITU data.
import { DEFAULT_DEMO_POLICY, JOIN_CODE_ALPHABET, ROOMS, suggestedAttendancePoints, type AssessmentCategory, type AttendanceStatus, type GradingPeriod, type RoomKind } from '../packages/domain/src/index.ts';

/** Placeholder for a Firestore Timestamp; seed.ts converts it, verify-seed.ts reads `.ms`. */
export class SeedTimestamp {
  readonly ms: number;
  constructor(ms: number) { this.ms = ms; }
}
export interface SeedDoc { path: string; data: Record<string, unknown> }
export interface SeedAccount { uid: string; email: string; displayName: string; admin?: boolean }

export const SEED_PASSWORD = 'demo-pass-2026';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const ALMATY_OFFSET = 5 * HOUR; // Kazakhstan: UTC+5, no DST
const TERM_ID = 'demo-term-fall-2026';
const TERM_LABEL = 'Fall 2026';

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const half = (x: number) => Math.round(x * 2) / 2;

// ---------------------------------------------------------------- people
export const TEACHERS = [
  { uid: 'demo-teacher-math', email: 'teacher.math@demo.aitu.kz', displayName: 'Айгерим Садыкова' },
  { uid: 'demo-teacher-la', email: 'teacher.la@demo.aitu.kz', displayName: 'Ержан Тулегенов' },
  { uid: 'demo-teacher-se', email: 'teacher.se@demo.aitu.kz', displayName: 'Асхат Нуртаев' },
  { uid: 'demo-teacher-eng', email: 'teacher.eng@demo.aitu.kz', displayName: 'Лаура Смагулова' },
];

/** Administrator: creates teachers and courses, sees statistics, exports backups (custom claim admin: true). */
export const ADMINS = [
  { uid: 'demo-admin', email: 'admin@demo.aitu.kz', displayName: 'Администратор Radar', admin: true },
];

/** Uids/ids that belong to the demo dataset: `npm run seed` replaces ONLY these and keeps everything else. */
export const DEMO_PREFIX = 'demo-';

export const GROUPS = [
  { id: 'se2419', label: 'SE-2419', hourShift: 0 },
  { id: 'se2420', label: 'SE-2420', hourShift: 2 },
] as const;

const MALE = ['Нурлан', 'Тимур', 'Данияр', 'Ерасыл', 'Санжар', 'Алихан', 'Бекзат', 'Дастан', 'Ернур', 'Мирас', 'Айдос', 'Темирлан', 'Нурсултан', 'Асылжан', 'Рустем', 'Олжас', 'Ильяс', 'Батыр', 'Жандос', 'Абылай', 'Еркебулан', 'Арсен', 'Самат', 'Адиль'];
const FEMALE = ['Дана', 'Алия', 'Мадина', 'Камила', 'Айша', 'Жанель', 'Аружан', 'Томирис', 'Асель', 'Диана', 'Амина', 'Сабина', 'Инкар', 'Дильназ', 'Карина', 'Мерей', 'Жансая', 'Аяулым', 'Назерке', 'Акбота', 'Әсем', 'Улжан', 'Малика', 'Арайлым'];
const SURNAMES = ['Ахмет', 'Жумабек', 'Касым', 'Оспан', 'Абдрахман', 'Исмаил', 'Нургали', 'Бекмухамед', 'Темирбек', 'Кали', 'Мурат', 'Сапар', 'Ержан', 'Карим', 'Абен', 'Сулеймен', 'Тулеу', 'Жакуп', 'Мухамед', 'Байжан', 'Есен', 'Омар', 'Рахим', 'Шарип', 'Ибра'];
const surname = (base: string, female: boolean) => {
  const vowelEnd = /[аеиоуы]$/.test(base);
  return base + (vowelEnd ? (female ? 'ева' : 'ев') : (female ? 'ова' : 'ов'));
};

type Archetype = 'strong' | 'average' | 'declining' | 'recovering' | 'struggling' | 'skipper' | 'latecomer';
/** presence / skill / submission probability as a function of term progress t in [0, 1]. */
const ARCHETYPES: Record<Archetype, { p: (t: number) => number; s: (t: number) => number; sub: (t: number) => number; late: number }> = {
  strong: { p: () => 0.97, s: () => 0.9, sub: () => 0.99, late: 0.03 },
  average: { p: () => 0.9, s: () => 0.78, sub: () => 0.96, late: 0.06 },
  declining: { p: (t) => 0.96 - 0.4 * t, s: (t) => 0.86 - 0.3 * t, sub: (t) => 0.99 - 0.35 * t, late: 0.06 },
  recovering: { p: (t) => 0.7 + 0.28 * t, s: (t) => 0.6 + 0.3 * t, sub: (t) => 0.75 + 0.24 * t, late: 0.05 },
  struggling: { p: () => 0.78, s: () => 0.6, sub: () => 0.82, late: 0.08 },
  skipper: { p: () => 0.66, s: () => 0.74, sub: () => 0.78, late: 0.05 },
  latecomer: { p: () => 0.93, s: () => 0.76, sub: () => 0.93, late: 0.3 },
};
const GROUP_MIX: Archetype[] = [
  ...Array<Archetype>(6).fill('strong'), ...Array<Archetype>(8).fill('average'), ...Array<Archetype>(3).fill('declining'),
  ...Array<Archetype>(2).fill('recovering'), ...Array<Archetype>(2).fill('struggling'), ...Array<Archetype>(2).fill('skipper'),
  ...Array<Archetype>(2).fill('latecomer'),
];

export interface SeedStudent extends SeedAccount { studentNumber: string; groupLabel: string; groupId: string; archetype: Archetype | 'scripted' }

function buildStudents(): SeedStudent[] {
  const r = rng(77);
  const used = new Set<string>(['Арман Серикбаев']);
  const out: SeedStudent[] = [];
  let n = 0;
  for (const [gi, g] of GROUPS.entries()) {
    const mix = [...GROUP_MIX].sort(() => r() - 0.5);
    for (let k = 0; k < 25; k++) {
      n++;
      const num = String(n).padStart(2, '0');
      let displayName: string;
      let archetype: SeedStudent['archetype'];
      if (n === 1) { displayName = 'Арман Серикбаев'; archetype = 'scripted'; mix.pop(); }
      else {
        do {
          const female = r() < 0.5;
          const first = (female ? FEMALE : MALE)[Math.floor(r() * (female ? FEMALE : MALE).length)]!;
          displayName = `${first} ${surname(SURNAMES[Math.floor(r() * SURNAMES.length)]!, female)}`;
        } while (used.has(displayName));
        archetype = mix[k] ?? 'average';
      }
      used.add(displayName);
      out.push({
        uid: `demo-student-${num}`, email: `student${num}@demo.aitu.kz`, displayName,
        studentNumber: `24${gi === 0 ? '19' : '20'}${num}`, groupLabel: g.label, groupId: g.id, archetype,
      });
    }
  }
  return out;
}
export const STUDENTS = buildStudents();

// ---------------------------------------------------------------- courses
// AITU trimester as of "now": week 8 of 10. Register Midterm (weeks 1–5) is closed, Register Endterm (6–10) is open,
// the Final is in week 12. Every item is on a 0–100 scale, weights per syllabus (20 / 20 / 20 / 40).
export const CURRENT_WEEK = 8;
interface AssessmentSpec { id: string; title: string; category: AssessmentCategory; week: number; period: GradingPeriod; weight: number; overdue: boolean }
interface CourseSpec {
  code: string; title: string; teacher: string; english?: boolean;
  slots: { weekday: number; hour: number; type: 'lecture' | 'practice' | 'lab' }[];
  topics: string[];
  assessments: AssessmentSpec[];
  /** Quiz 2 (this week): draft grades (live demo), published, or not graded yet. */
  quiz2: 'draft' | 'published' | 'none';
  unpublishedGroups?: string[];
  difficulty: number;
  /** Arman (student01): scripted results per assessment id (percent; 'missing' = not submitted). */
  student01: { presence: number[]; results: Record<string, number | 'missing'> };
}

const term = (q: [string, string], a: [string, string, string, string], aCategory: AssessmentCategory = 'assignment'): AssessmentSpec[] => [
  { id: 'quiz1', title: q[0], category: 'quiz', week: 3, period: 'midterm', weight: 0.2, overdue: false },
  { id: 'hw1', title: a[0], category: aCategory, week: 3, period: 'midterm', weight: 0.2, overdue: true },
  { id: 'hw2', title: a[1], category: aCategory, week: 5, period: 'midterm', weight: 0.2, overdue: true },
  { id: 'mid', title: 'Midterm', category: 'midterm', week: 5, period: 'midterm', weight: 0.4, overdue: false },
  { id: 'hw3', title: a[2], category: aCategory, week: 7, period: 'endterm', weight: 0.2, overdue: true },
  { id: 'quiz2', title: q[1], category: 'quiz', week: 8, period: 'endterm', weight: 0.2, overdue: false },
  { id: 'hw4', title: a[3], category: aCategory, week: 9, period: 'endterm', weight: 0.2, overdue: true },
  { id: 'end', title: 'Endterm', category: 'endterm', week: 10, period: 'endterm', weight: 0.4, overdue: false },
  { id: 'final', title: 'Final Exam', category: 'final', week: 12, period: 'final', weight: 1, overdue: false },
];

export const COURSES: CourseSpec[] = [
  {
    code: 'MATH101', title: 'Calculus 1', teacher: 'demo-teacher-math', difficulty: -0.04,
    slots: [{ weekday: 0, hour: 9, type: 'lecture' }, { weekday: 2, hour: 11, type: 'practice' }],
    topics: ['Функции и их графики', 'Предел последовательности', 'Предел функции', 'Непрерывность', 'Производная', 'Правила дифференцирования', 'Производная сложной функции', 'Применение производной', 'Исследование функции', 'Неопределённый интеграл'],
    assessments: term(['Quiz 1: Пределы', 'Quiz 2: Применение производной'], ['Assignment 1: Пределы и непрерывность', 'Assignment 2: Производная', 'Assignment 3: Исследование функции', 'Assignment 4: Интегралы']),
    quiz2: 'draft',
    // RegMid = 0.2·55 + 0 + 0 + 0.4·50 = 31 → RegEnd must be ≥ 69 for admission (≈ 72 % on the rest)
    student01: { presence: [1, 0, 1, 0.5, 0, 1, 0, 1, 1, 0], results: { quiz1: 55, hw1: 'missing', hw2: 'missing', mid: 50, hw3: 60, quiz2: 58 } },
  },
  {
    code: 'MATH102', title: 'Linear Algebra', teacher: 'demo-teacher-la', difficulty: 0,
    slots: [{ weekday: 1, hour: 13, type: 'lecture' }, { weekday: 4, hour: 9, type: 'practice' }],
    topics: ['Матрицы', 'Определители', 'Обратная матрица', 'Системы линейных уравнений', 'Метод Гаусса', 'Ранг матрицы', 'Векторные пространства', 'Базис и размерность', 'Линейные преобразования', 'Собственные значения'],
    assessments: term(['Quiz 1: Матрицы', 'Quiz 2: Векторные пространства'], ['Assignment 1: Операции над матрицами', 'Assignment 2: Системы уравнений', 'Assignment 3: Ранг и базис', 'Assignment 4: Линейные отображения']),
    quiz2: 'none',
    student01: { presence: [1, 0, 1, 0, 1, 0, 1, 0, 1, 1], results: { quiz1: 82, hw1: 85, hw2: 80, mid: 78, hw3: 84 } },
  },
  {
    code: 'CSE104', title: 'Discrete Mathematics', teacher: 'demo-teacher-la', difficulty: -0.02,
    slots: [{ weekday: 2, hour: 9, type: 'lecture' }, { weekday: 3, hour: 11, type: 'practice' }],
    topics: ['Логика высказываний', 'Предикаты и кванторы', 'Множества', 'Отношения', 'Функции', 'Индукция', 'Комбинаторика', 'Рекуррентные соотношения', 'Графы', 'Деревья'],
    assessments: term(['Quiz 1: Логика', 'Quiz 2: Комбинаторика'], ['Assignment 1: Множества и отношения', 'Assignment 2: Индукция', 'Assignment 3: Комбинаторика', 'Assignment 4: Графы']),
    quiz2: 'published',
    // ≈ 66 % overall: admitted, but below 70 % → scholarship at risk
    student01: { presence: [1, 1, 1, 1, 0, 1, 1, 1, 1, 1], results: { quiz1: 62, hw1: 70, hw2: 65, mid: 66, hw3: 68, quiz2: 64 } },
  },
  {
    code: 'SE101', title: 'Programming', teacher: 'demo-teacher-se', difficulty: 0.04,
    slots: [{ weekday: 1, hour: 10, type: 'lecture' }, { weekday: 3, hour: 14, type: 'lab' }],
    topics: ['Введение в Python', 'Типы данных', 'Условия', 'Циклы', 'Функции', 'Списки', 'Строки', 'Словари и множества', 'Файлы', 'Исключения'],
    assessments: term(['Quiz 1: Типы и выражения', 'Quiz 2: Списки и строки'], ['Lab 1: Ввод-вывод', 'Lab 2: Функции', 'Lab 3: Строки', 'Lab 4: Файлы'], 'lab'),
    quiz2: 'published',
    student01: { presence: [1, 1, 1, 1, 0.5, 1, 1, 1, 1, 1], results: { quiz1: 87, hw1: 92, hw2: 90, mid: 86, hw3: 90, quiz2: 92 } },
  },
  {
    code: 'ENG101', title: 'English', teacher: 'demo-teacher-eng', english: true, difficulty: 0.02,
    slots: [{ weekday: 2, hour: 15, type: 'practice' }, { weekday: 4, hour: 15, type: 'practice' }],
    topics: ['Introductions', 'Present tenses', 'University life', 'Past Simple', 'Storytelling', 'Present Perfect', 'Technology', 'Future forms', 'Making plans', 'Presentations'],
    assessments: term(['Quiz 1: Present tenses', 'Quiz 2: Future forms'], ['Essay 1: About myself', 'Essay 2: My university', 'Essay 3: Technology', 'Essay 4: My plans']),
    quiz2: 'none',
    unpublishedGroups: ['se2419'],
    student01: { presence: Array(10).fill(1), results: { quiz1: 80, hw1: 85, hw2: 82, mid: 78, hw3: 84 } },
  },
];

/** A fixed room per course and session type, from the campus catalog (lecture → L, practice → P, lab → K). */
function roomFor(courseIndex: number, groupIndex: number, type: 'lecture' | 'practice' | 'lab'): string {
  const kind: RoomKind = type === 'lecture' ? 'L' : type === 'lab' ? 'K' : 'P';
  const pool = ROOMS.filter((r) => r.kind === kind);
  return pool[(courseIndex * 7 + groupIndex * 3) % pool.length]!.code;
}

export const offeringIdOf = (code: string, groupId: string) => `demo-fall26-${code.toLowerCase()}-${groupId}`;

/** Stable join code per demo course (same after every reseed, so it can be printed on slides). */
export function demoJoinCode(offeringId: string): string {
  let h = 2166136261;
  for (const ch of offeringId) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const r = rng(h >>> 0);
  let code = '';
  for (let i = 0; i < 6; i++) code += JOIN_CODE_ALPHABET[Math.floor(r() * JOIN_CODE_ALPHABET.length)]!;
  return code;
}

// ---------------------------------------------------------------- texts
const FEEDBACK_RU = {
  high: ['Отличная работа!', 'Аккуратное и полное решение.', 'Хорошее понимание темы.'],
  mid: ['Хорошо, но проверьте оформление.', 'Есть ошибки в вычислениях, разберите задачу 3.', 'В целом верно, не хватает обоснования.'],
  low: ['Разберите ошибки на консультации.', 'Повторите тему и решите задачи из практики.', 'Много пропущенных шагов — подойдите в офис-часы.'],
};
const FEEDBACK_EN = {
  high: ['Excellent work!', 'Clear and well structured.', 'Great vocabulary range.'],
  mid: ['Good, check your verb tenses.', 'Nice ideas, work on paragraph structure.', 'Mostly correct, a few grammar slips.'],
  low: ['Please review the unit and redo the exercises.', 'Come to office hours to go through the mistakes.', 'Too short — follow the task requirements.'],
};
const EXCUSES = ['Справка', 'Спортивные соревнования', 'Семейные обстоятельства', 'Олимпиада'];

// ---------------------------------------------------------------- generator
function startOfLocalWeek(now: number) {
  const local = new Date(now + ALMATY_OFFSET);
  const dow = (local.getUTCDay() + 6) % 7; // 0 = Monday
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow) - ALMATY_OFFSET;
}

export function buildSeed(now: number): { accounts: SeedAccount[]; docs: SeedDoc[] } {
  const rand = rng(2026);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
  const docs: SeedDoc[] = [];
  const put = (path: string, data: Record<string, unknown>) => { docs.push({ path, data }); };
  const ts = (ms: number) => new SeedTimestamp(ms);
  const weekStart = startOfLocalWeek(now);
  const todayLocal = Math.floor((now + ALMATY_OFFSET) / DAY) * DAY - ALMATY_OFFSET;

  for (const a of ADMINS) put(`users/${a.uid}`, { displayName: a.displayName, email: a.email, role: 'admin' });
  for (const t of TEACHERS) put(`users/${t.uid}`, { displayName: t.displayName, email: t.email, role: 'teacher' });
  for (const s of STUDENTS) put(`users/${s.uid}`, { displayName: s.displayName, email: s.email, role: 'student', studentNumber: s.studentNumber, groupLabel: s.groupLabel });
  put(`terms/${TERM_ID}`, { label: TERM_LABEL, startsAt: ts(Date.UTC(2026, 8, 1)), endsAt: ts(Date.UTC(2026, 11, 20)), status: 'active' });

  // a stable per-student, per-course aptitude shift (good at code, weaker at maths, ...)
  const aptitude = new Map<string, number>();
  for (const s of STUDENTS) for (const c of COURSES) aptitude.set(`${s.uid}|${c.code}`, (rand() - 0.5) * 0.18);

  for (const [ci, c] of COURSES.entries()) {
    put(`courseCatalog/${c.code}`, { code: c.code, title: c.title });
    for (const [gi, g] of GROUPS.entries()) {
      const id = offeringIdOf(c.code, g.id);
      const o = `offerings/${id}`;
      const roster = STUDENTS.filter((s) => s.groupId === g.id);
      const publishing = !(c.unpublishedGroups ?? []).includes(g.id);
      const isMainDemo = c.code === 'MATH101' && g.id === 'se2419';
      const audit = (eid: string, data: Record<string, unknown>) => put(`${o}/audit/${eid}`, { actorUid: c.teacher, reason: null, details: {}, ...data });

      put(o, {
        courseCode: c.code, title: c.title, termId: TERM_ID, termLabel: TERM_LABEL, groupLabel: g.label, status: 'active',
        staffUids: [c.teacher], studentUids: roster.map((s) => s.uid),
        policy: { ...DEFAULT_DEMO_POLICY, attendancePointShare: { ...DEFAULT_DEMO_POLICY.attendancePointShare } },
        policyVersion: DEFAULT_DEMO_POLICY.version, joinCode: demoJoinCode(id),
      });
      put(`joinCodes/${demoJoinCode(id)}`, {
        offeringId: id, courseCode: c.code, title: c.title, groupLabel: g.label, termLabel: TERM_LABEL,
        active: true, createdBy: c.teacher, createdAt: ts(Date.UTC(2026, 8, 1)),
      });
      for (const s of roster) {
        put(`${o}/enrollments/${s.uid}`, { studentUid: s.uid, displayName: s.displayName, studentNumber: s.studentNumber, groupLabel: s.groupLabel, status: 'active', enrolledAt: ts(Date.UTC(2026, 8, 1)), via: 'seed' });
      }

      // ----- sessions: the whole term, weeks 1–10, two per week -----
      const termStart = weekStart - (CURRENT_WEEK - 1) * 7 * DAY;
      const sessions: { id: string; startsAt: number; type: 'lecture' | 'practice' | 'lab'; past: boolean; week: number }[] = [];
      for (let week = 1; week <= 10; week++) {
        for (const [k, slot] of c.slots.entries()) {
          const startsAt = termStart + (week - 1) * 7 * DAY + slot.weekday * DAY + (slot.hour + g.hourShift) * HOUR;
          sessions.push({ id: `w${week}-${k + 1}`, startsAt, type: slot.type, past: startsAt + 50 * 60_000 < now, week });
        }
      }
      if (isMainDemo) { // a lecture TODAY for the dashboard "Today" block
        const at = Math.max(todayLocal + 8 * HOUR, Math.ceil(now / HOUR) * HOUR + HOUR);
        sessions.push({ id: 'today', startsAt: Math.min(at, todayLocal + 22 * HOUR), type: 'lecture', past: false, week: CURRENT_WEEK });
      }
      const held = sessions.filter((s) => s.past).sort((a, b) => a.startsAt - b.startsAt);
      const lastHeld = held.at(-1);

      for (const s of sessions) {
        const isDraftDemo = isMainDemo && s === lastHeld;
        const published = s.past && publishing && !isDraftDemo;
        const topic = c.topics[(s.week - 1) % c.topics.length]!;
        put(`${o}/sessions/${s.id}`, {
          offeringId: id, type: s.type, topic, room: roomFor(ci, gi, s.type), startsAt: ts(s.startsAt), durationMinutes: 50,
          status: s.past ? 'held' : 'scheduled', maxPoints: 2, attendancePublication: published ? 'published' : 'draft',
          publishedAt: published ? ts(s.startsAt + 2 * HOUR) : null, revision: published ? 3 : 1,
          createdBy: c.teacher, updatedBy: c.teacher, updatedAt: ts(s.startsAt + 2 * HOUR),
        });
        if (!s.past) continue;
        const idx = held.indexOf(s);
        const progress = held.length > 1 ? idx / (held.length - 1) : 0;
        let corrections = 0;
        for (const [i, st] of roster.entries()) {
          let status: AttendanceStatus;
          if (st.archetype === 'scripted') {
            const v = c.student01.presence[idx % c.student01.presence.length]!;
            status = v === 1 ? 'present' : v === 0.5 ? 'late' : 'absent';
          } else {
            const a = ARCHETYPES[st.archetype];
            const p = clamp01(a.p(progress));
            const r = rand();
            status = r < p ? (rand() < a.late ? 'late' : 'present') : r < p + (1 - p) * 0.25 ? 'excused' : 'absent';
          }
          if (isDraftDemo && i === roster.length - 1) status = 'unmarked'; // left unmarked on purpose
          // A few published absences were later excused by the teacher (visible "Исправлено" + audit trail).
          const corrected = published && status === 'absent' && st.archetype !== 'scripted' && corrections < 1 && rand() < 0.12;
          const finalStatus: AttendanceStatus = corrected ? 'excused' : status;
          const remark = finalStatus === 'excused' ? pick(EXCUSES) : finalStatus === 'late' ? `Опоздание ${5 + Math.floor(rand() * 4) * 5} мин` : '';
          const recId = `${s.id}_${st.uid}`;
          put(`${o}/attendanceRecords/${recId}`, {
            offeringId: id, sessionId: s.id, studentUid: st.uid, status: finalStatus, points: suggestedAttendancePoints(finalStatus, 2),
            remark, publication: published ? 'published' : 'draft', revision: published ? (corrected ? 3 : 2) : 1,
            updatedBy: c.teacher, updatedAt: ts(s.startsAt + (corrected ? 2 * DAY : HOUR)),
            correction: corrected ? { reason: 'Студент предоставил подтверждающий документ', at: ts(s.startsAt + 2 * DAY), previous: { status: 'absent', points: 0 } } : null,
          });
          if (corrected) {
            corrections++;
            audit(`corr-${recId}`, { type: 'attendance.corrected', at: ts(s.startsAt + 2 * DAY), targetPath: `${o}/sessions/${s.id}`, reason: 'Студент предоставил подтверждающий документ', details: { studentUids: [st.uid] } });
          }
        }
        if (published) audit(`pub-${s.id}`, { type: 'attendance.published', at: ts(s.startsAt + 2 * HOUR), targetPath: `${o}/sessions/${s.id}`, details: { records: roster.length } });
      }

      // ----- assessments & results (0–100, AITU registers) -----
      for (const a of c.assessments) {
        // Due at the end of its week (Friday 18:00); Quiz 2 of the current week was written yesterday.
        const due = a.week === CURRENT_WEEK ? now - DAY : termStart + (a.week - 1) * 7 * DAY + 4 * DAY + 18 * HOUR;
        const past = due < now;
        const isQuiz2 = a.id === 'quiz2';
        const graded = past && (!isQuiz2 || c.quiz2 !== 'none');
        const published = publishing && graded && (!isQuiz2 || (c.quiz2 === 'published' && !isMainDemo));
        put(`${o}/assessments/${a.id}`, {
          offeringId: id, title: a.title, category: a.category, maxPoints: 100, dueAt: ts(due), countsForOverdue: a.overdue,
          period: a.period, weight: a.weight,
          gradesPublication: published ? 'published' : 'draft', publishedAt: published ? ts(Math.min(now, due + 2 * DAY)) : null,
          revision: published ? 2 : 1, createdBy: c.teacher, updatedBy: c.teacher, updatedAt: ts(Math.min(now, due + 2 * DAY)),
        });
        if (!graded) continue;
        if (published) audit(`pub-${a.id}`, { type: 'grades.published', at: ts(Math.min(now, due + 2 * DAY)), targetPath: `${o}/assessments/${a.id}`, details: { records: roster.length } });
        const progress = clamp01((a.week - 1) / 9);
        let gradeCorrections = 0;
        for (const st of roster) {
          let submission: 'submitted' | 'late_submitted' | 'missing' = 'submitted';
          let points: number | null;
          if (st.archetype === 'scripted') {
            const r = c.student01.results[a.id];
            if (r === 'missing') submission = 'missing';
            points = r === 'missing' ? null : r ?? 80;
          } else {
            const arch = ARCHETYPES[st.archetype];
            if (a.overdue) {
              const subP = clamp01(arch.sub(progress));
              submission = rand() < subP ? (rand() < 0.12 ? 'late_submitted' : 'submitted') : 'missing';
            }
            const skill = clamp01(arch.s(progress) + c.difficulty + (aptitude.get(`${st.uid}|${c.code}`) ?? 0) + (rand() - 0.5) * 0.2);
            points = submission === 'missing' ? null : half(skill * 100);
          }
          const gradeState = submission === 'missing' ? 'missing' : 'graded';
          const bank = c.english ? FEEDBACK_EN : FEEDBACK_RU;
          const pct = (points ?? 0) / 100;
          const feedback = gradeState === 'graded' && rand() < 0.35 ? pick(pct >= 0.85 ? bank.high : pct >= 0.6 ? bank.mid : bank.low) : '';
          // Appeals: a published grade raised after review (shows "Исправлено" for the student).
          const scriptedAppeal = st.archetype === 'scripted' && c.code === 'SE101' && a.id === 'quiz1';
          const appeal = published && gradeState === 'graded' && points != null && points <= 95
            && (scriptedAppeal || (st.archetype !== 'scripted' && gradeCorrections < 1 && rand() < 0.06));
          const finalPoints = appeal && points != null ? points + 5 : points;
          const recId = `${a.id}_${st.uid}`;
          put(`${o}/assessmentRecords/${recId}`, {
            offeringId: id, assessmentId: a.id, studentUid: st.uid, submission, gradeState, points: gradeState === 'graded' ? finalPoints : null,
            maxPoints: 100, feedback: appeal ? (c.english ? 'Re-checked after appeal: task 4 accepted.' : 'Перепроверено по апелляции: задача 4 засчитана.') : feedback,
            publication: published ? 'published' : 'draft', revision: published ? (appeal ? 3 : 2) : 1,
            updatedBy: c.teacher, updatedAt: ts(Math.min(now, due + (appeal ? 4 : 1) * DAY)),
            correction: appeal ? { reason: 'Пересмотр работы по апелляции студента', at: ts(Math.min(now, due + 4 * DAY)), previous: { gradeState: 'graded', points } } : null,
          });
          if (appeal) {
            gradeCorrections++;
            audit(`corr-${recId}`, { type: 'grade.corrected', at: ts(Math.min(now, due + 4 * DAY)), targetPath: `${o}/assessments/${a.id}`, reason: 'Пересмотр работы по апелляции студента', details: { studentUids: [st.uid] } });
          }
        }
      }
    }
  }
  return { accounts: [...ADMINS, ...TEACHERS, ...STUDENTS], docs };
}
