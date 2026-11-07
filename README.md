# AITU Student Success Radar

**ICT Final Project · Astana IT University · group SE-2619 · Timur Nurzhanov, Anuar Baimukhanov**

An early academic-risk module for the My DU app. For every course a student sees one honest state — **High risk, Needs attention, On track or Not enough data** — the reasons behind it and concrete next steps, following the AITU grading rules. Teachers enter attendance and grades in a **Teacher Portal** (an LMS simulator); an **administrator panel** manages accounts, courses and backups. Everything runs on one free Firebase project; Firestore Security Rules act as the backend.

> Unofficial student prototype. All data is synthetic. Not connected to the official AITU Moodle or university sign-in.

| | |
|---|---|
| **My DU (student)** | https://aitu-success-radar-709c4.web.app/my-du/ |
| **Teacher Portal + admin** | https://aitu-success-radar-709c4.web.app |
| **Final report** | Group_SE-2619_Team_ICT_FinalProject.pdf (submitted in the LMS) |

### Test accounts (password for all: `demo-pass-2026`, also shown on the sign-in pages)

| Role | E-mail |
|---|---|
| Student (shows all four Radar states) | `student01@demo.aitu.kz` |
| Teacher (Calculus 1) | `teacher.math@demo.aitu.kz` |
| Administrator | `admin@demo.aitu.kz` |

### Run it

Node.js 20.19–24.

```bash
npm install
cp .env.example .env        # Firebase web config; the service-account key is never committed
npm run dev:teacher         # Teacher Portal + admin  -> http://localhost:5174
npm run dev:student         # My DU                   -> http://localhost:5173
npm run demo:offline        # whole system without internet (in-browser demo data)
npm test                    # 46 domain unit tests + demo-data check
npm run test:rules          # 52 Security Rules tests + 3 data-layer tests (Firestore emulator, needs Java)
npm run deploy              # build and publish both apps (rules first: npm run deploy -- rules)
```

### Who built what

| Member | Main parts |
|---|---|
| Timur Nurzhanov | My DU student app (`apps/student`): Radar dashboard, course details, recommendations, weekly plan, live notifications, offline state, phone layout; user tests and performance |
| Anuar Baimukhanov | Teacher Portal and admin panel (`apps/teacher`), data layer (`packages/data`), Firestore Security Rules and tests, deployment, scripts (seed, backup, restore, IoT simulation, analysis) |
| Together | Risk Engine and AITU grading rules (`packages/domain`), architecture, documentation |

### Repository map

`apps/student` My DU · `apps/teacher` Teacher Portal + admin · `packages/domain` Risk Engine (pure TypeScript, unit-tested) · `packages/data` Firestore access · `firestore/` Security Rules · `tests/rules` rules tests · `scripts/` seed, backup, restore, IoT simulation, analysis · `analysis/` SQL · `tools/offline` offline demo adapter · `docs/` data model, decisions, security

---

*Подробная документация на русском ниже.*

## Документация (RU)

Учебный проект ICT. Преподаватель отмечает посещаемость (в том числе по QR-коду у двери аудитории) и публикует оценки в **Teacher Portal** (симулятор LMS). Студент сам регистрируется в My DU, вступает в курсы по коду и видит свои опубликованные данные, риск по каждому курсу, причины риска и план на неделю во вкладке **Radar**. Администратор управляет аккаунтами, курсами и резервными копиями.

> Неофициальный прототип. Данные синтетические, к LMS AITU и Microsoft Entra ID проект не подключён. Версия **1.0**.

## Что умеет v1.0

| Часть | Что внутри |
|---|---|
| **Роли и аккаунты** | Студент **регистрируется сам** в My DU (только корпоративная почта, проверка каждого поля), подтверждает почту и вступает в курсы **по коду**. Преподавателя **создаёт администратор** (временный пароль → обязательная смена при первом входе). Администратор — отдельная роль в токене (custom claim), выдаётся только командой `npm run make-admin` |
| **Панель администратора** | Обзор и аналитика по всем курсам (5 графиков + таблицы), пользователи, создание преподавателей и курсов, состав курса, коды курсов, резервные копии и CSV, неизменяемый журнал действий |
| **Вступление в курс по коду** | Код `XXX-XXX` (без похожих символов O/0, I/1), QR-код для первой лекции, смена кода в один клик; правила проверяют, что студент добавил только себя и только с действующим кодом |
| **IoT: QR у двери аудитории** | Планшет у входа показывает QR, который меняется каждые 20 с. Студент сканирует камерой → My DU отмечает его. Код проверяется **по времени сервера** (45 с), одна отметка на студента. Преподаватель переносит отметки в ведомость одной кнопкой (позже 10 минут — «опоздал») |
| **«Мой план на неделю»** | Сводка для студента: просрочки, ближайшие дедлайны, занятия, курсы с риском, что сделать для допуска и стипендии; галочки сохраняются |
| **Резервное копирование** | JSON-копия всей базы из панели администратора, ночная копия через GitHub Actions, восстановление с пробным прогоном (`npm run restore`) |
| **Безопасность** | Security Rules на каждое поле, заголовки CSP / HSTS / X-Frame-Options, выход после 30 мин бездействия, журнал администратора и аудит курса только на добавление |
| Журнал оценок как в Moodle, Radar, выбор аудитории, адаптивный интерфейс, офлайн-демо | из v0.4–v0.6 |

Проверки: 46 доменных тестов ✅, 52 теста правил + 3 интеграционных (эмулятор), сквозные сценарии в браузере (студент, администратор, преподаватель, дверь).

## Архитектура в одной картинке

```mermaid
flowchart LR
  T[Teacher Portal<br/>+ панель администратора] -- запись --> R{{Security Rules<br/>роль · состав курса ·<br/>код курса · время сервера}}
  Dr[Экран у двери<br/>QR каждые 20 с] -- код --> R
  S[My DU<br/>регистрация · код · план · Radar] -- своё: профиль, вступление, отметка --> R
  R --> F[(Cloud Firestore)]
  F -- только свои опубликованные --> S
  D[[@aitu/domain<br/>Risk Engine · валидация · план]] --- T & S
  A[Firebase Auth<br/>claim admin] -.-> T & S
```

Один проект Firebase (Firestore + Auth + Hosting, бесплатный тариф Spark), без собственного сервера: всю «серверную» проверку делают Security Rules. Причины решений — в [docs/DECISIONS.md](docs/DECISIONS.md), модель данных — в [docs/DATA_MODEL.md](docs/DATA_MODEL.md), безопасность — в [docs/SECURITY.md](docs/SECURITY.md), подробное объяснение для команды — в [docs/GUIDE.md](docs/GUIDE.md).

## Обновление с v0.6 до v1.0

Правила новые, поэтому **сначала правила, потом данные**:
```powershell
npm install
npm test                           # 46 доменных тестов + проверка демо-базы v4
npm run deploy -- rules            # обязательно: без новых правил регистрация, коды и QR будут отклонены
npm run seed -- --yes              # демо-база v4: коды курсов + демо-администратор
npm run deploy                     # собрать и опубликовать оба приложения
```
- Демо-администратор: `admin@demo.aitu.kz` / `demo-pass-2026` (роль выдаёт `seed`).
- Сделать администратором себя: `npm run make-admin -- ваша.почта@astanait.edu.kz` (аккаунт должен уже существовать; после этого выйти и войти заново).
- `seed` теперь пересоздаёт **только** демо-данные (`demo-*`): курсы, созданные в панели администратора, и самостоятельно зарегистрированные студенты остаются.
- Для писем «подтвердите почту» и «сброс пароля» ничего настраивать не нужно: их отправляет Firebase Auth. Шаблон письма можно поменять в **Authentication → Templates** (язык — русский).

## Резервное копирование и восстановление

| Как | Команда / место | Что получится |
|---|---|---|
| Из браузера | Панель администратора → «Резервные копии» → «Скачать резервную копию» | `aitu-radar-backup-<дата>.json` (все документы Firestore) |
| С компьютера владельца | `npm run backup` | `backups/aitu-radar-<дата>.json` + список аккаунтов (без паролей) |
| Каждую ночь | `.github/workflows/backup.yml` (секреты `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`) | артефакт в GitHub Actions, хранится 30 дней |
| Проверить файл | «Резервные копии» → «Проверить файл копии» | целая ли копия, сколько документов по коллекциям (файл не покидает браузер) |
| Восстановить | `npm run restore -- backups/файл.json` → пробный прогон; `--yes` — записать; `--wipe` — ещё и удалить лишнее | база как в копии |

Восстановление из браузера намеренно недоступно: оно может перезаписать всё, поэтому выполняется только через Admin SDK с компьютера владельца. Папка `backups/` в `.gitignore`.

## Анализ данных (End-term, Part C)
`npm run analysis` — загружает CSV из `analysis/data` (выгрузка: «Резервные копии» → «Подготовить CSV») в SQLite и выполняет запросы `analysis/queries.sql` (GROUP BY / COUNT / AVG). Свою выгрузку: `npm run analysis -- путь/к/папке`. То же самое формулами — `analysis/Stage2_analysis.xlsx`.

## IoT: экран у двери (QR-отметка)

1. Портал → курс → «Посещаемость» → занятие → **«Экран у двери»** (открывается на планшете или ноутбуке у входа, во весь экран).
2. «Начать отметку». Студенты наводят камеру телефона на QR → My DU открывается и отмечает. Без камеры: My DU → Меню → «Отметиться на занятии» → 6 цифр с экрана.
3. На экране только число отметившихся (имена видит лишь преподаватель). В ведомости появляется панель «Отметились по QR» → **«Перенести в ведомость»** → проверить → опубликовать.
4. Без телефонов: `npm run iot:simulate -- --offering demo-fall26-math101-se2419 --session today --students 12` — «виртуальные студенты» отмечаются через Admin SDK (берут код с открытого экрана у двери).

## Оценивание по правилам AITU

| Что | Как считается |
|---|---|
| Register Midterm | работы недель 1–5 с весами из силлабуса (например A1 20 %, A2 20 %, Quiz 20 %, Midterm 40 %) |
| Register Endterm | работы недель 6–10, так же |
| Register Term | 0.5 · RegMid + 0.5 · RegEnd |
| Допуск к файналу | RegMid ≥ 25, RegEnd ≥ 25 и RegTerm ≥ 50, иначе F (летний семестр) |
| Total | 0.3 · RegMid + 0.3 · RegEnd + 0.4 · Final (пример: 80 / 86 / 70 → 77.8) |
| Итог по файналу | Final 25–49 → FX (платная пересдача), Final < 25 → F |
| Стипендия | по каждому курсу ≥ 70 % (GPA 2.33); рекомендуется ≥ 80 % (GPA 3.0) |

**Откуда берутся рекомендации.** Их никто не пишет вручную. Risk Engine (`packages/domain`) сам считает регистры, допуск и прогноз по **опубликованным** оценкам, а My DU превращает причины в конкретные советы с числами: «наберите в Register Endterm не меньше 69 — в среднем 72 % за оставшиеся работы». Преподаватель влияет на них только тем, что ставит и публикует оценки. Несданная работа после срока считается за 0, ещё не оценённая — не считается вовсе (pending ≠ 0).

## Запуск: облачный проект Firebase (Windows 11, ≈20 минут)

Нужен только **Node.js 24 LTS** (подходят 20.19–24; на Node 26 Firebase CLI ставится с ошибками). Если Node уже стоит другой версии: `winget install CoreyButler.NVMforWindows`, затем `nvm install 24` и `nvm use 24`. Проверить: `node -v`.
Java для этого режима **не нужна**.

> PowerShell пишет *«выполнение сценариев отключено»* на `npm` → один раз выполните `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (или работайте в **cmd**).
> Кракозябры вместо кириллицы в консоли → `chcp 65001` или Windows Terminal.

### 1. Создать проект в Firebase Console (один раз)
1. https://console.firebase.google.com → **Create project**, имя например `aitu-success-radar`. Google Analytics можно выключить. Тариф остаётся бесплатным (**Spark**).
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
3. **Build → Firestore Database → Create database**. Edition — Standard, если спросит. Регион — `europe-west3 (Frankfurt)` или ближайший к Казахстану (**потом его не поменять**). Режим — **Production**: наши правила зальём сами.
4. **⚙ Project settings → General → Your apps → Web `</>`** → зарегистрировать приложение (например `teacher-portal`) → скопировать значения `apiKey`, `authDomain`, `projectId`, `appId`.
5. **⚙ Project settings → Service accounts → Generate new private key.** Сохранить JSON **вне папки проекта**, например `C:\Users\Имя\keys\aitu-radar-admin.json`. Это секрет: не отправлять, в git не добавлять.

### 2. Настроить проект
```powershell
Copy-Item .env.example .env        # в cmd: copy .env.example .env
notepad .env                       # вписать FIREBASE_* из шага 4 и путь к ключу из шага 5
npm install
npm test                           # доменные тесты + проверка демо-данных (без интернета)
npx firebase login                 # вход в Google-аккаунт владельца проекта (один раз)
```

### 3. Залить правила и данные, запустить
```powershell
npm run deploy -- rules            # Security Rules — без них база закрыта для всех
npm run seed -- --yes              # демо-данные в облако (стирает и пересоздаёт демо-коллекции)
npm run dev:teacher                # http://localhost:5174 — портал преподавателя (облачная база)
npm run dev:student                # http://localhost:5173 — My DU для студентов (второе окно терминала)
npm run check:student              # консольная проверка: изоляция данных + живой Radar
```

### 4. Опубликовать оба приложения по ссылке
```powershell
npm run deploy                     # правила + сборка обоих приложений + Hosting
```
- Портал преподавателя: `https://<projectId>.web.app`
- My DU для студентов: `https://<projectId>.web.app/my-du/`. На телефоне: открыть в Safari или Chrome → «На экран Домой», и он запускается как приложение.
Если deploy попросит настроить Hosting, откройте в консоли **Build → Hosting → Get started**, пройдите мастер до конца и повторите команду.

### Как показать базу преподавателю
- **Портал и My DU**: отправьте ссылки `https://<projectId>.web.app` и `…/my-du/`. На страницах входа есть кнопки демо-аккаунтов.
- **Сама база**: **⚙ Project settings → Users and permissions → Add member** → почта преподавателя → роль **Viewer**. Ему станет видно **Firestore Database → Data**: коллекции `offerings`, `sessions`, `attendanceRecords`… Изменять он ничего не сможет.
- Удобный ход на защите: открыть рядом консоль Firestore и портал, опубликовать посещаемость и показать, как у записи меняется `publication: draft → published` и растёт `revision`.

> Демо-пароль публичный, поэтому любой, у кого есть ссылка, может войти в демо-аккаунт и поменять **синтетические** данные. Восстановить их можно командой `npm run seed -- --yes`. Настоящие данные студентов сюда не загружать.

### Локальный режим с эмулятором (необязательно)
Нужен для автотестов правил (`npm run test:rules`) и экспериментов без облака. Требует Java: `winget install EclipseAdoptium.Temurin.21.JDK`.
В `.env` поставить `USE_EMULATORS=true`, затем: окно 1 — `npm run emulators`, окно 2 — `npm run seed`, `npm run dev:teacher`.

### Проверки
```powershell
npm run typecheck                  # TypeScript во всём репозитории
npm run test:rules                 # правила + data-слой на эмуляторе (нужна Java)
```

Демо-аккаунты (пароль у всех `demo-pass-2026`):

| Кто | Почта | Что ведёт / где учится |
|---|---|---|
| Администратор Radar | `admin@demo.aitu.kz` | панель администратора |
| Айгерим Садыкова | `teacher.math@demo.aitu.kz` | Calculus 1 (SE-2419, SE-2420) |
| Ержан Тулегенов | `teacher.la@demo.aitu.kz` | Linear Algebra, Discrete Mathematics |
| Асхат Нуртаев | `teacher.se@demo.aitu.kz` | Programming |
| Лаура Смагулова | `teacher.eng@demo.aitu.kz` | English (в SE-2419 ещё ничего не опубликовала) |
| Арман Серикбаев | `student01@demo.aitu.kz` | SE-2419: показывает все четыре состояния Radar |
| Студенты | `student02` … `student25` / `student26` … `student50` `@demo.aitu.kz` | SE-2419 / SE-2420 |

У студентов разные траектории: стабильные, «скатывается к середине семестра», «восстанавливается», часто пропускающие, вечно опаздывающие. Есть исправленные отметки и оценки с записями в журнале аудита.

## Сценарий демонстрации на защите (≈4 минуты)

Рядом открыты три окна: портал (`…web.app`), My DU на телефоне или в узком окне (`…web.app/my-du/`) и консоль Firestore.

1. **My DU** → вход `student01@…` → Меню → Student Success Radar. Calculus 1 — **Высокий риск** (RegMid 31, допуск под угрозой: нужно ≥ 69 в Register Endterm), Linear Algebra — **Внимание** (посещаемость), Discrete Mathematics — **Внимание** (стипендия: курс ниже 70 %), Programming — **В норме**, English — **Мало данных** (а не «всё хорошо»). В Programming у Quiz 1 стоит «Исправлено преподавателем».
2. **Портал** → `teacher.math@…` → Calculus 1 · SE-2419 → «Посещаемость». Последнее занятие сохранено как **черновик**, студент его не видит. «Опубликовать» → Radar в My DU обновляется сам, без перезагрузки.
3. «Занятия» → «Новое занятие»: в поле аудитории набрать `C1.3` — список аудиторий корпуса у столовой с этажом и типом. Открыть занятие и отметить группу клавишами П / О / У / Н (↓ — следующий студент). Сохранить и опубликовать.
4. «Оценки» → журнал с колонками RegMid / RegEnd / RegTerm / Total и допуском. Quiz 2 (черновик) → опубликовать. У Армана в Calculus 1 пересчитываются Register Endterm и совет «сколько нужно набрать», в консоли у записей `publication: draft → published`.
5. Исправить опубликованную отметку. Портал просит **причину**, у студента появляется «Исправлено», в `audit` новая запись.
6. «Радар успеваемости» в портале: кому в группе нужна поддержка. Расчёт тот же, что у студента, и только по опубликованному.
7. Безопасность: `npm run check:student` показывает, что чтение чужих оценок и запись своей оценки **отклоняются правилами**.

Дополнительно для v1.0 (≈3 минуты):

8. **Администратор** (`admin@demo.aitu.kz`) → «Обзор» → «Пересчитать»: графики по всем курсам. «Пользователи» → «Добавить преподавателя» → показан временный пароль. «Курсы» → «Создать курс» → сразу появляется код курса.
9. **Новый преподаватель** входит с временным паролем → портал требует сменить пароль.
10. **Регистрация студента** в My DU: «Зарегистрироваться» → неверная почта / пароль / группа подсвечиваются → корпоративная почта → «Вступить в курс по коду» → подтвердить почту → курс появился в Radar.
11. **Экран у двери**: «Начать отметку» → студент сканирует QR телефоном → счётчик на экране растёт → в ведомости «Перенести в ведомость».
12. **«Мой план на неделю»** у `student01`: что сделать на этой неделе, с галочками.
13. «Резервные копии» → скачать копию → «Проверить файл копии»; «Журнал» — все действия администратора, изменить или удалить запись нельзя.

## Структура

```
firestore/            firestore.rules — вся модель прав; indexes
packages/domain/      чистый TS: метрики, оценивание AITU, Risk Engine, аудитории, время (без Firebase)
packages/data/        Firestore: пути, конвертеры, команды преподавателя, подписки студента
apps/teacher/         Teacher Portal + панель администратора + экран у двери (Vite + React 19 + React Router 7)
apps/student/         My DU (дизайн оригинальной реплики; Radar, вход и профиль — на Firebase)
scripts/              seed, verify-seed, check-student, make-admin, backup, restore, iot-simulate, deploy
tests/rules/          тесты правил и data-слоя (vitest + @firebase/rules-unit-testing)
docs/                 GUIDE (объяснение), DECISIONS, DATA_MODEL, SECURITY, ROADMAP; docs/architecture-v1 — исходный пакет
tools/offline/        офлайн-адаптер Firebase для демо без интернета
.github/workflows/    ci.yml (проверки), backup.yml (ночная копия)
```

## Важные правила предметной области

- **Черновик ≠ опубликовано.** Студент и Risk Engine видят только опубликованное.
- **Не проверено ≠ 0 баллов. Не отмечен ≠ пропуск. Мало данных ≠ «в норме».**
- Сдача работы и оценка — **независимые** поля.
- Формулы регистров, допуска и стипендии — правила AITU (`risk-aitu-v1`). Пороги посещаемости (< 80 %) и просрочек (≥ 2) — пока **демо-политика**, их нужно сверить с академической политикой (вопросы Q-01…Q-17 в `docs/architecture-v1/10_OPEN_QUESTIONS.md`).
