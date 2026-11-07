# 10 — Open questions / assumptions that must not be guessed

These questions are not answered by Stage 1, My DU replica, or the student-view LMS screenshot. Design defaults below are **demo choices**, not claims about official AITU rules.

| ID | Open question | Safe demo default | Must resolve before real use |
|---|---|---|---|
| Q-01 | Official attendance definition and permitted `late` credit? | present=1, late=.5, absent=0; excused excluded | yes |
| Q-02 | Are LMS `2 / 2` attendance points related to presence or grade? | Store separately as awarded points; calculate attendance as session percent | yes |
| Q-03 | Exact weights and passing thresholds for quiz/midterm/final per course? | example config only; no official final grade forecast | yes |
| Q-04 | Who can publish/correct marks, one teacher or multiple? | assigned `manage_grades`, correction reason required | yes |
| Q-05 | Does excused absence count in denominator? | exclude | yes |
| Q-06 | Do unsubmitted, ungraded works become missing automatically? | no; only explicit `missing` marks | yes |
| Q-07 | Roles and SSO: AITU Entra permissions available? | Emulator test users | yes |
| Q-08 | Who provisions/edits offering enrollments? | trusted seed/admin only | yes |
| Q-09 | When does a student retain access after withdrawing? | safest minimal demo: active enrollment only; history decision pending | yes |
| Q-10 | Permitted storage, retention, deletion, audit access and consent? | synthetic data, no real PII | yes |
| Q-11 | Notifications: opt-in, cooldown and acceptable times? | off in MVP | before enabling |
| Q-12 | Advisory staff access, instructor summaries and class ranking? | absent in MVP | before adding |
| Q-13 | Which timetable timezone and daylight handling? | UTC storage + Asia/Almaty display | confirm |
| Q-14 | Are quizzes/midterms LMS-graded or manually imported? | manual entry in simulator | before integration |
| Q-15 | What counts as course progress for categories not yet published? | observed assessment %, never final grade | yes |
| Q-16 | How are course groups/cross-listed offerings represented? | groupId on enrollments | if multiple groups exist |
| Q-17 | Can students dispute a result / request correction? | Contact teacher action only | later |

**Rule:** if Q-01–Q-06 are unresolved, the UI must prominently say “Demonstration risk model, not official academic result”.
