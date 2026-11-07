# 08 — Acceptance and test strategy

## Test pyramid
1. **Unit/domain** (currently executable): deterministic calculation, evidence thresholds, zero/null distinction, draft exclusion, optimistic revision.
2. **Firestore Emulator Security Rules** (to implement before real backend): ownership read and all client-write deny tests.
3. **Callable integration tests** (to implement): assignment auth, enrollment, idempotency, transactions, publishing, worker retry.
4. **React E2E** (to implement): student/teacher login, unauthorized deep links, offline states, usability, performance.

## Domain test matrix
| ID | Input | Expected |
|---|---|---|
| DOM-01 | No attendance, no grades | UNKNOWN |
| DOM-02 | Three held published sessions: present, late, absent; cancelled + excused | Attendance 50%, cancelled/excused excluded |
| DOM-03 | 3 sessions with attendance below 80%; 2 confirmed overdue missing | HIGH + ≥2 actions |
| DOM-04 | Exactly one negative factor | MEDIUM |
| DOM-05 | Enough good evidence in 2 channels | LOW |
| DOM-06 | Attendance exactly 80% | Not attendance warning |
| DOM-07 | graded 0 and pending null | Zero included, pending excluded |
| DOM-08 | Missing due in future | Not overdue |
| DOM-09 | Draft grades | No impact on student risk |
| DOM-10 | Grade > maximum / negative | Validation error |
| DOM-11 | incoming revision lower than current | Reject stale projection |
| DOM-12 | More than 3 graded assessments | Recent 3 only |
| DOM-13 | Task submitted, grade pending | Task completed, no overdue |
| DOM-14 | Task pending after deadline | No inferred missing |
| DOM-15 | Grade missing without task missing | No overdue signal |

## Security / server test matrix (TODO: requires Firebase Functions implementation)
| ID | Actor/action | Expected |
|---|---|---|
| RULE-01 | studentA get studentB summary | permission-denied |
| RULE-02 | studentA write own summary/source grade | permission-denied |
| RULE-03 | anonymous read own-looking path | permission-denied |
| RULE-04 | own account read own summary | success |
| API-01 | teacherA writes teacherB offering | permission-denied |
| API-02 | valid assigned teacher writes current offering | success |
| API-03 | teacher writes for a non-enrolled uid | permission-denied |
| API-04 | teacher without `manage_grades` records grade | permission-denied |
| API-05 | role spoofed in user-facing profile | permission-denied |
| API-06 | same requestId + same body retry | same receipt, one canonical write/audit |
| API-07 | same requestId + different body | already-exists / conflict |
| API-08 | two actors updating same revision | one conflict, no silent overwrite |
| API-09 | grade saved as draft | not visible in student projection |
| API-10 | corrected published grade | audit + correct latest projection |
| API-11 | duplicate/out-of-order trigger | idempotent, sourceRevision monotonically increases |
| API-12 | oversized batch or invalid status | reject; no partial writes |
| API-13 | outage between source write and recompute | durable job retries; UI marks stale |
| API-14 | logout and another user's login same device | no previous user's private data/cache |

## Functional acceptance and UX
- **SC1:** time 5 first-time students from opening Radar to naming highest-risk course; expected ≤30s; capture median and every outlier.
- **SC2:** High warning displays ≥2 clear, actionable study actions; tap provides meaningful next step.
- **SC3:** dashboard test dataset appears in ≤5s under normal network, measure p50/p95 and show loading.
- **R10:** unauthorized student cannot read another student's academic records.
- **Availability:** simulate 10s offline and return online; backend truth intact, client shows `stale` rather than 0.

## Release checklist
- [ ] Official thresholds/weights clearly marked Demo or approved
- [ ] Emulator Rules tests green
- [ ] Backend authorization and idempotency integration tests green
- [ ] No credentials nor genuine academic personal data in repo
- [ ] PWA private cache audited
- [ ] All HIGH have ≥2 recommendations
- [ ] Error/loading/unknown/published states verified
- [ ] Accessibility keyboard and screen reader sanity-check
- [ ] SC1/SC2/SC3 evidence collected
