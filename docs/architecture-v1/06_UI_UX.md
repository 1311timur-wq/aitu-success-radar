# 06 — UI/UX interaction contract

## Design principles
- Reuse visual DNA of existing My DU (`src/styles.css` tokens, RU/EN translations, Radar summary), not demo authentication.
- Teacher Portal is a clean **desktop-first LMS-inspired** workflow; exact teacher Moodle UI is unknown (student screenshots only).
- First view: *which course needs attention?* Details: *why + what next?* Do not use red without text/icon, no shame/fright language, never imply academic punishment.
- Accessibility: readable typography, semantic tables, focus order, keyboard navigation, high contrast, touch targets and aria-live for updated statuses.

## Student app routes
| Route | Screen | Data | Empty/error |
|---|---|---|---|
| `/login` | Authentication | Firebase auth | Permission/SSO-not-configured state |
| `/radar` | Courses sorted High → Medium → Low → Unknown (with Unknown separate) | own courseSummaries | No enrollments vs loading vs network error |
| `/radar/:offeringId` | Course status, causes, actions, updatedAt | own courseSummary | No data / not assigned |
| `/radar/:offeringId/attendance` | Timeline of published sessions | own attendanceItems | No published lessons yet |
| `/radar/:offeringId/grades` | Quiz/Midterm/Final published grades and points | own gradeItems | Grading pending; not zero |
| `/profile` | Own account and language | own profile | Logout clears subscriptions |

**Course card:** title, term, risk label, updated timestamp, one brief main reason, attendance %, published progress (when meaningful); recommendation expansion not shown for Low. State `Unknown` says “Данных пока недостаточно” and never green by default.

## Teacher app routes
| Route | Workflow | Explicit guard |
|---|---|---|
| `/teacher` | Assigned offerings, today's sessions, incomplete grading | signed-in teacher |
| `/teacher/offerings/:id` | Offering overview, staff, enrolled group counts | staff relationship |
| `/teacher/offerings/:id/attendance/:sessionId` | Roster table: present, absent, late, excused; save draft → publish | manage_attendance |
| `/teacher/offerings/:id/assessments` | Create and list assessment definitions | manage_assessments |
| `/teacher/offerings/:id/grades/:assessmentId` | Enter points, preview, save draft, publish | manage_grades |
| `/teacher/offerings/:id/students` | Authorized roster only | view_roster |

**Teacher attendance screen:** sticky name column, batch selection, explicit `unmarked`, indicator of unsaved changes, optimistic revision conflict dialog (“Another user changed this record”), committed receipt, publication status, server time. Don't default all unmarked to absent. Publishing must be a separate confirm action.

**Teacher gradebook:** show min/max validation in cells, grading state, draft/published chips, bulk save result (which rows committed), correction reason for previously published grades. Warn before leaving with unsaved changes.

## Critical UI states
- `loading`: skeleton, no fake grades.
- `empty`: no offerings / no sessions / no published assessments.
- `unknown`: insufficient academic data — neutral wording.
- `recalculating`: saved to journal but student risk pending; show last update.
- `stale/offline`: previously synced data and visible timestamp, no guarantee of freshness.
- `permission-denied`: route replacement + safe explanation, never blank screen.
- `conflict`: user chooses refresh/compare, never silent overwrite.
- `failed-write`: teacher sees which changes did not persist; no green “saved” prematurely.

## Microcopy examples (RU)
- High: “Есть несколько показателей, которым стоит уделить внимание”.
- Medium: “Проверьте один важный показатель”.
- Unknown: “Пока недостаточно опубликованных данных для оценки”.
- Stale: “Показатели могут быть неактуальны. Последнее обновление: ...”.
- Correction: “Оценка исправлена преподавателем. Дата изменения: ...”.

## Design handoff
Create Figma/Storybook later; retain CSS design tokens and two density modes (mobile student, desktop teacher). Do not duplicate modules for attendance/grade formatting across apps: share presentation models, status labels, and date formatter as independent package.
