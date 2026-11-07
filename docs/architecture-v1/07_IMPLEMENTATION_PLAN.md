# 07 — Delivery plan, dependencies and integration with existing My DU

## Priority order — architecture before UI
**P0 (days 1–2):** freeze entity nomenclature and collection paths, approve demo scoring policy, create Firebase DEMO Emulator project and Auth/Firestore rules, unit tests domain, synthetic users/group/offering seed.
**P1 (days 3–4):** teacher identity/offerings, `getRoster`, createSession, draft & published Attendance with server-side access tests. Student sees attendance read projection and shows stale/loading.
**P2 (days 5–6):** createAssessment, recordTaskCompletionBatch, recordGrade, publishGrades, projection recompute, Risk Engine and reasons/actions. Student Radar replaced with repository-based Firebase data.
**P3 (days 7–8):** correction/audit, idempotency/duplicate retries, concurrency tests, performance and accessibility validation, polished ICT demo.

This is a suggested implementation sequence rather than a promise of guaranteed calendar duration. Workstream order matters more than exact duration.

## Existing app: file-by-file migration (verified source)
| Existing file | Today | Recommended action |
|---|---|---|
| `src/data.js` | PROFILE and RADAR fixed; `reasonsFor()` hardcodes conditions | Move nonacademic demo texts to fixtures; replace academic imports with repositories and typed view models |
| `src/screens/Radar.jsx` | imports RADAR/reasonsFor; renders fixed score/status/assignments | Divide `RadarDashboard`, `CourseDetail`, `AttendanceTimeline`, `PublishedGrades`, `RecommendationList`, query hooks |
| `src/screens/Startup.jsx` | visual login flow, buttons simply transition UI state | Separate auth screens; actual Firebase Auth for production; label mock-login as demo if retained |
| `src/App.jsx` | `stage` state machine; browser localStorage for preferences | `AuthProvider`, `Router`, ProtectedRoutes; session teardown on sign-out |
| `src/screens/Main.jsx` | stack of modal-like screens | Gradually migrate Radar to routable features; preserve current shell until cutover |
| `src/i18n.js` | in-memory RU/EN strings | Add `UNKNOWN`, statuses, errors, action codes; keep frontend localization |
| `src/styles.css` | one large CSS bundle | Extract tokens/common UI, feature styles; keep visual identity |
| `public/sw.js` | static asset cache | audit caching; DO NOT cache private API/Firestore/auth responses cache-first |
| `package.json` | React + Vite, no Firebase SDK | add Firebase client SDK, router, lint/test/typecheck gradually |

The existing mobile design can remain; core replacement is auth/data/repository/risk semantics. Do not put Admin SDK in frontend. Use one Firebase app instance and unsubscribe snapshots when UID changes.

## Recommended repo packages
```text
apps/student — My DU shell + Radar (React/Vite)
apps/teacher — desktop portal (React/Vite)
packages/domain — pure calculations / policy / enums, tested (current code in this package)
packages/shared-ui — later, only actual reusable components
packages/firebase-client — typed client SDK adapters (later)
functions — callable backend, guards, transaction, worker (NOT implemented yet)
firestore — security rules and indexes
docs — architectural contracts
```

## Vertical slice 1: Attendance end-to-end
1. Trusted script creates demo teachers/students via Authentication Emulator, offering, staff, enrollments, one held session.
2. Student and teacher roles provisioned by trusted script (custom claims and offering relation).
3. Teacher logs in and loads allowed roster, marks attendance **draft**.
4. Server validates points/status/enrollment and records audit/receipt.
5. Teacher publishes session; student projection updated once job completes.
6. Student sees own sessions and attendance %, without seeing other students.
7. Teacher corrects a session, gives reason; summary recalculated.
8. Denial scenarios: student write, other teacher write, cross-account read.

## Vertical slice 2: Grade, Task Completion and Risk
1. Teacher defines Quiz 1 and published grades.
2. Graded `0` differs from pending; partial scoring visible but **not official final grade**.
3. Another teacher cannot edit, student cannot write.
4. High result produces ≥2 clear recommended actions and explains each factor.
5. Duplicate delivery + two rapid teacher updates do not produce stale final projection.

## Split of work (two developers)
- Developer A: Firestore/Auth Emulator, secure callable commands, audit and rules tests.
- Developer B: Teacher UI + My DU Radar data adapter, empty/loading/recalculating/error states.
- Shared contract freeze: domain types + endpoints + fixtures first; both contribute to domain tests.
- Integrate after each vertical slice rather than waiting for final week.

## CI quality gates
- `npm test` for domain every PR.
- Future: Firestore Rules test (owner vs other), Cloud Function integration against Emulator, TypeScript typecheck, eslint, build both apps, Playwright cross-account E2E.
- Branch protection, `.env.example` without credentials, secrets in secret manager; no screenshot names/personal info in seed.
- Dedicated `demo-*` Firebase project during development; separate staging/prod only after security review.

## Freeze criteria for first demo
Successful login → teacher creates session → drafts → publishes → student attendance changes → teacher creates/grades/publishes quiz → risk changes with reasons → corrected grade updates safely. Screens outside this path are secondary.
