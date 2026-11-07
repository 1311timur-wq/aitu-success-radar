# 03 — Security architecture and access control

## 1. Trust boundaries
Browser/student device and teacher browser are **untrusted**. A valid Firebase login establishes identity but not teaching authority or class membership. Cloud Functions Admin SDK bypasses Firestore Security Rules; permissions must be rechecked in **every** callable. Default all Firestore client writes to DENY.

## 2. Matrix (MVP)
| Operation | Student | Assigned teacher | Other teacher | System backend |
|---|---|---|---|---|
| Read own published summary/details | yes | via authorized class analytics only (future) | no | yes |
| Read all grade records from canonical offering | no | via protected callable, own offering | no | yes |
| Create/update session | no | own offering + permission | no | yes |
| Record/update attendance | no | own offering + permission | no | yes |
| Create assessment/task status/enter grade | no | own offering + permission | no | yes |
| Publish/correct grade/attendance | no | own offering + permission and reason if correction | no | yes |
| Provision identity, staff, enrollment, policy | no | no | no | bootstrap admin |
| Modify computed risk / audit | no | no | no | backend only |

## 3. Auth
- MVP uses Firebase Authentication with **test users**, in isolated `demo-...` Emulator for development; no fake OAuth window used for production claims.
- For actual AITU sign-in, coordinate Microsoft Entra application registration, tenant restrictions, redirects and admin approval. An email domain is **not** authority to access grades.
- Role is granted by trusted provisioning (Admin SDK custom claims), never profile `roles` from client. Assignment permissions live at `offerings/{id}/staff/{uid}` and must be checked server-side on every write.
- Session expiration/sign-out clears client listeners and user-scoped cache. Avoid unbounded cache-first PWA handling of private data and service-worker caching of auth responses.
- MFA may be required by university policy; no bypass via client state or passcode UI.

## 4. Firestore client authorization
`firestore/firestore.rules`:
- signed-in student may `get/list` only under `students/{request.auth.uid}` and own `users/{uid}`;
- nothing beneath `offerings`, `auditEvents`, `operationReceipts`, `dirtySummaries` is client-readable/writable;
- teacher reads happen via callable only, with a server-side filter by teacher membership;
- user profile self-write denied; labels, roles and enrollment cannot be forged.

**Query caveat:** Firestore Rules are not filters; a list query must be provably owner-scoped. Student-specific subtree solves this problem.

## 5. Server authorization pseudocode
```text
require auth.uid and user active
require approved teacher role from token or trusted user record
load offerings/{offeringId}/staff/{auth.uid}
require staff.status == active
require permission in staff.permissions
require offering.status == active
for every studentUid: require offering.enrollments/{uid}.status == active
validate state machine, input length, numeric range, expectedRevision
write in transaction: canonical + audit + dirty marker + idempotency receipt
```
Callable app-check (where applicable), rate limiting and request caps supplement checks. No secrets / Admin SDK credentials in browser. Use minimum IAM permissions for service accounts.

## 6. Threat catalogue
| Threat | Mitigation | Test |
|---|---|---|
| Student manually writes own grade | Rules deny any client canonical writes | E2E-RULE-02 |
| Student reads another student projection | Own-UID path requirement | E2E-RULE-01 |
| Teacher edits unrelated offering | Server staff relation checked | API-SEC-03 |
| Teacher spoofs `studentUid` not enrolled | Enrollment relation check | API-SEC-04 |
| Forged `role` in frontend/localStorage | Server ignores client role | API-SEC-05 |
| Replay duplicate request | requestId + payload hash receipt; idempotent | API-CONS-06 |
| Old update overwrites new result | expectedRevision + monotonic projection guard | API-CONS-07 |
| Unpublished grade leaked | Publishing barrier, separate projection | API-SEC-08 |
| PWA shared-device cache leaks grade | no private service-worker caching, logout cleanup | E2E-SEC-09 |
| Log exposes full student records | redact/minimize logs; role-restricted audit | SEC-OPS-10 |

## 7. Launch gates
Before staging/prod: (1) pass security rules tests in Emulator, (2) all callable guards tested, (3) separate projects/secrets, (4) Firebase budget alerts, (5) backup/restore and retention policy, (6) synthetic-only seed, (7) explicit institution consent for any real student data.

Sources: https://firebase.google.com/docs/firestore/security/rules-conditions ; https://firebase.google.com/docs/auth/admin/custom-claims ; https://firebase.google.com/docs/emulator-suite/connect_auth
