# 12 — Stage 1 requirements → architecture implementation traceability

Stage 1 is the provided `ICT_Project_Stage_1AnuarTimur.docx` and merged slides. Additional Teacher Portal is an **MVP extension** and should be separately labeled in reports to avoid pretending LMS replacement was in original scope.

| Stage 1 Req | Architecture realization | Test / metric |
|---|---|---|
| R1 Student auth | Firebase Auth, login state, ID-bound views | login / anonymous denied |
| R2 Clear risk per course | Student `courseSummaries`, Low/Medium/High/Unknown | DOM-01,04,05; SC1 |
| R3 Attendance indicators | offerings.sessions + attendanceRecords; student projection | DOM-02; teacher vertical slice |
| R4 Assignment completion | independent taskCompletionRecords (submitted/missing/pending) and gradeRecords | DOM-07,08 |
| R5 Multiple risk signals | Pure `computeRisk` with versioned demo policy | DOM-03,04,05 |
| R6 Explanation | structured `risk.reasons` and evidence metrics | DOM-03; UX inspection |
| R7 ≥2 recommendations | Rule-code → action-code mapping | DOM-03; SC2 |
| R8 Resource links could | Optional assets/links after MVP | deferred |
| R9 Dashboard <5 sec | precomputed projection, performance telemetry | SC3 load test |
| R10 Student data isolation | UID owner Firestore Rules; no canonical client read | RULE-01,02,03 |
| R11 First-time comprehension | minimal course health first; accessible labels | SC1 ≤30s observation |
| R12 Short interruption | durable server canonical; explicit offline/stale state | API-13 and E2E offline |

**Extension E1:** Teacher assigned-course auth/read roster/write Attendance → server commands + staff/enrollment relations.
**Extension E2:** Teacher gradebook/Quiz/Midterm/Final entry → assessment/grade canonical records + publishing.
**Extension E3:** Corrections and transparency → immutable audit, idempotent writes and recomputation.

The Stage 1 survey: 9/13 noticed risk too late, 12/13 would find combined warning useful, 10/13 want recommendations; small sample supports motivation, not claims of population-wide prevalence.
