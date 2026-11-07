# Data model v2 (Rules-first, v1.0)

Все времена хранятся как Firestore `Timestamp` (UTC), а показываются в `Asia/Almaty` (UTC+5). Пути используются только через `packages/data/src/paths.ts`.

## Аккаунты и справочники

| Путь | Ключевые поля | Пишет | Читает |
|---|---|---|---|
| `users/{uid}` | displayName, email, **role** `student/teacher/admin`, **source** `self/admin/seed`, studentNumber, groupLabel, program, department, mustChangePassword, createdAt, createdBy, consentAt | студент — себя при регистрации; администратор — преподавателей; seed / make-admin | сам пользователь, администратор |
| `users/{uid}/planState/current` | done {itemId → ms}, updatedAt | сам студент | сам студент |
| `terms/{termId}`, `courseCatalog/{code}` | label, status / code, title | администратор, seed | любой вошедший |
| `joinCodes/{CODE}` | offeringId, courseCode, title, groupLabel, termLabel (превью), active, createdBy, createdAt, revokedAt, revokedBy | staff курса, администратор | `get` — любой вошедший по точному коду; `list` — администратор |
| `adminLog/{id}` | type, actorUid, at, target, details | администратор (только создание) | администратор |
| `stats/latest` | computedAt, computedBy, data (AdminStats) | администратор | администратор |

## Курс

| Путь | Ключевые поля | Пишет | Читает |
|---|---|---|---|
| `offerings/{o}` | courseCode, title, termLabel, groupLabel, status `active/archived`, **staffUids[]**, **studentUids[]**, policy, policyVersion, **joinCode** | администратор; staff — только joinCode и удаление студента; студент — только добавить себя | администратор, staff и зачисленные (`array-contains`) |
| `offerings/{o}/enrollments/{uid}` | studentUid, displayName, studentNumber, groupLabel, status `active/withdrawn`, **via** `code/admin/seed`, **joinCode**, enrolledAt | студент (сам, по коду), администратор, staff (только «исключён») | администратор, staff; студент — своё |
| `offerings/{o}/sessions/{id}` | type, topic, room, startsAt, durationMinutes, status `scheduled/held/cancelled`, maxPoints, attendancePublication, revision, … | staff | администратор, staff и зачисленные |
| `offerings/{o}/attendanceRecords/{sessionId}_{uid}` | status `present/late/absent/excused/unmarked`, points, remark, publication, revision, updatedBy, updatedAt, correction | staff | администратор, staff; студент — свою и только `published` |
| `offerings/{o}/assessments/{id}` | title, category, maxPoints, dueAt, period, weight, gradesPublication, revision, … | staff | администратор, staff и зачисленные |
| `offerings/{o}/assessmentRecords/{assessmentId}_{uid}` | submission, gradeState, points, maxPoints, feedback, publication, revision, correction | staff | администратор, staff; студент — свою и только `published` |
| `offerings/{o}/checkinTokens/{sessionId}` | open, code, prevCode, rotatedAt (= время сервера), updatedBy | staff (экран у двери) | администратор, staff (**студенты — никогда**) |
| `offerings/{o}/checkins/{sessionId}_{uid}` | offeringId, sessionId, studentUid, code, at, method `qr/code` (`simulated` — только Admin SDK) | сам студент, один раз | администратор, staff; студент — свою |
| `offerings/{o}/audit/{id}` | type, actorUid, at, targetPath, reason, details | staff (только создание) | staff, администратор |

## Инварианты и где они проверяются

| Инвариант | Rules | Data-слой / UI | Тест |
|---|---|---|---|
| Роль студента при регистрации — только `student`, почта = почта токена, корпоративная | `validSelfRegistration` | `validateRegistration` (domain) | v2: registration |
| Администратор — только claim в токене | `isAdmin()` | `make-admin` | v2: admin |
| Преподаватель создаётся только администратором, с `mustChangePassword` | `validTeacherAccount` | `createTeacherAccount` | v2: admin |
| Студент добавляет только себя, только с активным кодом этого курса, почта подтверждена | `studentJoins`, `selfEnroll`, `trustedEmailFor` | `joinCourse`, `emailTrustedFor` | v2: join |
| Staff курса: только сменить код и исключить одного студента | `staffRotatesJoinCode`, `staffWithdrawsStudent` | `rotateJoinCode`, `withdrawStudent` | v2: roster |
| QR-код свежий по времени сервера, одна отметка, только зачисленный | `validCheckin` | `submitCheckin` | v2: QR |
| Студенты не читают токен двери | `checkinTokens` read | — | v2: QR |
| Пишет журнал только staff этого курса | `uid in staffUids` | — | API-01/02 |
| `revision` строго +1, автор и серверное время | да | конфликт по строке | API-08 |
| Изменение опубликованного требует причину | `correctionOk()` | ReasonDialog | API-10 |
| Черновик не виден студенту | `publication == 'published'` | — | API-09 |
| Журналы (`audit`, `adminLog`) только дописываются; удалить курс или пользователя нельзя | `allow update, delete: if false` | архив вместо удаления | rules tests |

## Бюджет правил
Одна запись отметки или оценки — 2 обращения (offering + `getAfter` занятия/оценивания). Firestore разрешает ≤ 20 обращений на коммит, поэтому `RECORDS_PER_COMMIT = 8`. Вступление в курс — 4 обращения (профиль, код, `getAfter` курса и зачисления), QR-отметка — 2 (курс, токен).

## Запросы
- Преподаватель: `offerings where staffUids array-contains uid`; подколлекции курса целиком (≈ 30 студентов).
- Студент: `offerings where studentUids array-contains uid`; по каждому курсу — свои записи `where studentUid == uid and publication == 'published'`; свои отметки `checkins where studentUid == uid`.
- Администратор: коллекции целиком (`users`, `offerings`, `adminLog orderBy at desc limit N`). Полное чтение базы — только для статистики, копии и CSV по кнопке.

## Оценивание AITU
Регистры **не хранятся** — их считает `computeStanding()` (`packages/domain/src/grading.ts`) у преподавателя (по всем сохранённым оценкам) и у студента (только по опубликованным). Сумма весов в регистре — 100 %; `excused` исключает работу, `missing` после срока = 0, `pending` не считается.

## «Мой план на неделю»
План **не хранится**: `buildWeeklyPlan()` (`packages/domain/src/plan.ts`) строит его из тех же данных, что и Radar (просрочки, дедлайны 7 дней, занятия, курсы с риском, допуск, стипендия). Хранятся только галочки (`planState/current`), старше 21 дня удаляются.

## Каталог аудиторий
`packages/domain/src/rooms.ts` — статический список корпусов C1.1 / C1.2 / C1.3; в базе хранится только строка-код.
