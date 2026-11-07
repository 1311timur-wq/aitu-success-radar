# 01 — System Blueprint / Architectural baseline

## 1. Product vision / граница ответственности
**Проблема:** посещаемость, результаты и сроки дают студенту разрозненные сигналы; трудно вовремя понять, что требует внимания.
**Обещание MVP:** Collect → Interpret → Explain → Act. Система принимает записи преподавателя, пересчитывает показатели и выдаёт понятные причины/действия в My DU.
**Не входит:** официальная LMS, автоматическая оценка работ, точные предсказания итоговых баллов, санкции за риск, синхронизация с AITU без разрешения, SSO AITU без разрешения, AI-психодиагностика.

### Акторы
- `student`: читает собственные **опубликованные** академические записи и сводки, рекомендации.
- `teacher`: управляет занятиями, посещаемостью, оценочными мероприятиями и оценками **только своих offerings** через server commands.
- `advisor`: future read-only role, только назначенные студенты и минимальный набор показателей; **не входит в MVP**.
- `system_admin`: доверенная server-side операция bootstrap/исправления; отдельный UI не строим.

## 2. Агрегаты и единый источник истины
- `CourseCatalog`: описание дисциплины (Calculus 1, MATH101).
- `CourseOffering`: конкретный курс + триместр + преподаватели + зачисленные студенты + policy snapshot.
- `Session`: конкретное занятие; attendanceRecord — состояние студента для этого занятия.
- `Assessment`: событие оценивания/задание; `taskCompletionRecord` — подтверждённая сдача задания, `gradeRecord` — результат проверки. Эти состояния независимы.
- `CourseSummary`: **производная проекция**, не официальный журнал. Можно удалить и полностью пересчитать из первичных записей.
- `AuditEvent`: неизменяемое событие изменения.

### Инварианты, которые нельзя нарушать
1. Только преподаватель с активным `offering.staff/{uid}` и подходящей permission может менять записи этого offering.
2. Любой `attendanceRecord.studentUid`, `taskCompletionRecord.studentUid` и `gradeRecord.studentUid` обязан соответствовать **активному enrollment** на момент операции (политика для исторических результатов — отдельное исключение).
3. `points` — конечное число от 0 до `maxPoints` включительно. `0` — только явно выставленный результат; отсутствующая проверка ≠ 0.
4. `unmarked`, `pending`, `excused`, `cancelled` не трактуются как отсутствие или низкий результат без явно согласованной политики.
5. Студент получает только данные со статусом `published` (редактируемые черновики из проекций исключаются).
6. Каждая модификация имеет `actorUid`, `updatedAt`, `revision`, `requestId`, audit; отдельные операции публикации.
7. Время хранится в Firestore Timestamp (UTC момент), отображается в локальной зоне (например, `Asia/Almaty`); не сохранять строку «10:00 местное» как единственный timestamp.
8. Сводка версии `sourceRevision` не должна перезаписывать сводку с большим revision.
9. Конкретная формула/вес/порог — часть `policyVersion`/`policySnapshot`, а не случайная константа React.
10. Все IDs непрозрачные; на client нельзя считать, что `email` или group принадлежит человеку только по тексту.

## 3. Контейнерная архитектура
```mermaid
flowchart LR
 Teacher[Teacher web portal] -->|Firebase ID token + callable command| API[Cloud Functions v2]
 Student[My DU Student Radar] -->|auth + read-only snapshot listener| Views[(Firestore /students/{uid}/*)]
 Auth[Firebase Auth] -. identity .-> API
 API --> ACL[Policy/Access guards]
 ACL --> Journal[(Firestore canonical records)]
 Journal --> Queue[Recompute worker / dirty jobs]
 Queue --> Engine[Pure domain calculator]
 Engine --> Views
 Moodle[Moodle API - optional future] -. explicit permission + mapping .-> API
```

**Architecture style:** modular monolith, one Firebase project **per environment** (`dev`, `staging`, `prod`), single canonical data store, no microservices or cross-Firebase dependencies in MVP.

## 4. Write path (teacher)
1. Student/teacher signs in with Firebase Auth; no visual mock-login in production.
2. Teacher calls a typed callable Function, e.g. `recordAttendanceBatch`, `{requestId, offeringId, sessionId, expectedRevision?, records}`.
3. Server validates ID token, active user, role, assigned offering, student enrollments, lifecycle state, field/size bounds.
4. Server transaction checks idempotency key and business preconditions, commits canonical records + audit + dirty-recompute marker atomically (chunk large batches).
5. Background/synchronous worker reads the **latest** canonical source; calculates and publishes updated student projection only if revision is current. Failure retains dirty marker and retries.
6. Student watches permitted summary/detail projections with Firestore Rules; receives data with `updatedAt`, `freshness`, `riskVersion`.

**Publication barrier:** draft attendance/grade is not exposed to student projection. Publishing is a distinct action. If a draft is edited before publish, student metrics do not move. Recompute is triggered by **published** changes.

## 5. Read path (student)
- `students/{currentUid}/courseSummaries/*` lists active term offerings, per-course status and explanations.
- `students/{currentUid}/attendanceItems/*` lists **published** sessions visible to the student.
- `students/{currentUid}/taskItems/*` lists published assignment completion; `students/{currentUid}/gradeItems/*` lists **published** assessments. Search/filters by `offeringId` with indexes after query design.
- Only permitted read streams; `users/{uid}` returns own safe profile. Teacher data, class averages and peer marks are not shipped by default.
- A newly enrolled user with no records sees **Unknown / Данных недостаточно**, not synthetic Low.

## 6. Consistency & failed operations
- Canonical write and audit/dirty marker: atomic transaction when bounded by Firestore limits.
- Summary update: eventual (normal delay seconds), UI visibly says “Обновляется” and shows last successful time.
- Trigger deliveries can be duplicated and out of order; worker is idempotent, works from latest source snapshot, protects monotonically increasing revision. Never rely solely on trigger event payload order.
- Retried calls with same actor + `requestId` + same payload return prior result; reused ID with a different payload → conflict. Store hash + result/status and TTL/retention policy.
- Rollback/correction: explicit mutation with revision and audit; historical published projections recomputed.
- On transient error, original canonical writes remain durable; dirty job retries; dashboard may show STALE, not fabricate newest result.

## 7. NFR & observability
| Area | Criterion and verification |
|---|---|
| Security | Cross-account/cross-offering reads and writes blocked; emulator rules + functions integration tests |
| UX | First-time student spots highest-risk course within 30s (Stage 1 SC1) |
| Actions | Any High gives ≥2 specific actions (SC2) |
| Performance | Test dataset dashboard ≤5s in normal conditions (SC3); log p50/p95 |
| Availability | Short interruption preserves server data; stale state explicit, no hidden optimistic grade edits |
| Accessibility | Text + icon + colour; touch target ≥44x44 CSS px guideline; keyboard and readable contrast |
| Integrity | Revision guards, published-only projections, immutable audit, deterministic calculations |
| Localization | RU + EN, avoid hardcoded academic text inside domain |
| Privacy | Synthetic seed data only; minimum necessary personal attributes; private sources never logged |
| Ops | Dev/staging/prod isolation, budget alerts, error monitoring, backup/restore drill before real data |

## 8. Explicit trade-offs
- Teacher portal is an LMS **simulator** for ICT; it does not replace AITU Moodle. A real integration becomes an external adapter with institution approval.
- Firestore is chosen for fast prototyping and real-time projections. Canonical entities normalized enough to stay portable to PostgreSQL later.
- Role + per-offering authorization in server functions. Security Rules allow student **read-only** views; all canonical writes denied to clients.
- `Course Health` uses explainable rules, not AI. “High” is a support signal, not administrative verdict.
- Teacher UI is an **inspired-by-LMS** interface, not claimed to match actual teacher Moodle UI (screenshots are from student account).
