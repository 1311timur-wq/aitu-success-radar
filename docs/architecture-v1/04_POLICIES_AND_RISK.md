# 04 — Academic metrics and Risk Engine specification (DEMO POLICY)

> Сведения Stage 1 не содержат официальных весов, порогов и правил AITU. Все цифры в этом разделе — **параметры демонстрации**, подлежащие утверждению/замене. Не выдавать эти результаты за официальный рейтинг, GPA, итоговую оценку или диагноз риска отчисления.

## 1. Разделение показателей
1. **Attendance %** — доля подтверждённого посещения среди учитываемых отмеченных занятий; не то же самое, что суммарные баллы посещаемости LMS.
2. **Observed assessment %** — баллы опубликованных graded assessments / максимальные баллы этих же assessments (частичная картина); не final course grade.
3. **Recent grade %** — среднее нормализованных процентов последних **до трёх опубликованных** graded assessments, при наличии минимум двух для risk signal.
4. **Explicit overdue/missing count** — только опубликованные `taskCompletionRecords` с `state=missing`, у которых истёк dueAt. Неизвестная оценка/не выставленная запись не считается missing.
5. **Risk status** — Low/Medium/High/Unknown с причинами и действиями; отделён от official results.

## 2. Attendance calculation
При обработке: session.status должен быть `held`, attendanceRecord.publication = `published`; `cancelled/scheduled`, `unmarked` и `excused` исключаются из знаменателя. Демо коэффициенты: `present=1`, `late=0.5`, `absent=0`. Процент = `100 * sum(coefficients) / number_of_eligible_sessions`. Допускаются дробные веса, округление *только на display*, не внутри правил. Отдельно можно отображать LMS attendance points и max points, не смешивая показатели.

**Граница:** если обработанных eligible sessions меньше 3, сигнал attendance считается недостаточно надёжным (`null`), хотя сам процент при одном занятии можно показать с пометкой «мало данных».

## 3. Assessment metrics
Для graded record: `0 ≤ earned ≤ maxPoints`, `maxPoints > 0`. `pending` и `excused` исключаются. Explicit `missing` у gradeRecord — отдельное состояние, не автоматически ноль; отсутствие сдачи задания фиксируется НЕ в gradeRecord, а в `taskCompletionRecord`. Только при утверждённой policy `missingCountsAsZero: true` explicit missing может войти в итоговые расчёты как 0 (текущий DEMO движок не добавляет missing к observed grade%).

Если в учебной политике установлены веса категорий Quiz/Midterm/Final, отдельно считать weighted observed percentage по категориям **только среди опубликованных оцененных**; не показывать как final score, пока необходимые категории не закрыты. Если категории не утверждены, не рассчитывать итоговый балл дисциплины вообще.

## 4. Rule-based risk (risk-demo-v1)
| Signal | Demo threshold | Когда доступен |
|---|---|---|
| `ATTENDANCE_LOW` | attendancePercent < 80 | хотя бы 3 eligible занятия |
| `TWO_OVERDUE` | overdueCount ≥ 2 | есть опубликованные записи task completion по заданиям с прошедшим дедлайном |
| `RECENT_GRADES_LOW` | recentGradePercent < 60 | хотя бы 2 graded assessments |

Risk resolver: 
- `high`: сработали **≥2 независимых** сигнала;
- `medium`: сработал ровно 1 сигнал;
- `low`: нет негативных сигналов **и** достаточно данных хотя бы по 2 независимым каналам (attendance, eligible assignments, recent results);
- `unknown`: негативных сигналов нет, но подтверждений по менее чем двум каналам недостаточно.

`Unknown` не равно `Low`. Не применять правила к неопубликованным оценкам. Порог строго меньше: 80% посещаемости сам по себе не низкий, 79.99% — низкий. `dueAt` сравнивается с серверным `now`, без подмены временной зоны.

## 5. Reasons & recommendations
Причина в structured form: `{code, observed, threshold, evidenceCount}`; frontend локализует её. Actions are codes: `CHECK_ATTENDANCE`, `COMPLETE_MISSING_WORK`, `REVIEW_WEAK_ASSESSMENTS`, `CONTACT_TEACHER`, `MAKE_STUDY_PLAN`. Для High всегда ≥2 **конкретных** действия; при риске отсутствия рекомендаций fallback: `CONTACT_TEACHER`, `MAKE_STUDY_PLAN`. Никаких обещаний «сдашь экзамен» или официальных санкций.

## 6. Revision, hysteresis and notifications
- Risk engine is pure (`input, now, policy -> output`), deterministic (sort events by timestamp + id).
- Update on published input or policy version change; store `ruleVersion`, `dataAsOf`, `sourceRevision`.
- In MVP notifications optional; if enabled: do not send at every recompute, only controlled meaningful state transitions, debounce cooldown, suppress backfills.
- Hysteresis (reduce status flapping) optional after testing; **not included** in v1 rules to keep transparency.
- Data freshness: `current/stale/recalculating`; do not hide that result can lag behind a newly saved grade.

## 7. Edge cases
- No sessions, zero graded records → `unknown`.
- Cancelled lesson, excused attendance, unmarked attendance → no penalty.
- Grade `graded:0` is a real zero; `pending` is not.
- Grade > maxPoints or negative → reject input.
- Overdue without explicitly marked taskCompletionRecord.missing → no inferred failure. Submission and grade are independent.
- Retaken assessment, duplicate grade, retrospective correction → same `(offering, assessment, student)` canonical record, revision and audit, recalc.
- Long academic breaks, holidays, inaccessible network → no automatic bad attendance.
- Missing policy/version → return validation error or `unknown`, never fabricate threshold.

### Stage 1 success criteria mapping
- SC1: risk ordering on dashboard and usability test ≤30s.
- SC2: High has at least two recommendations.
- SC3: 5s typical test data load.
- R5–R7: Engine + explanation + actions.
- R10: separate security rules + guarded teacher write commands.
