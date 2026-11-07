# 11 — Consistency, idempotency, repair and operational safeguards

## 1. Per-student provenance
Every student projection has `{offeringId, studentUid, sourceRevision, policyVersion, computedAt, freshness}`. `sourceRevision` is a nondecreasing **per `(offering, student)`** version in a trusted source metadata document. All commands that may affect one student's published calculation atomically increment that student's version and schedule its dirty job. A change to offering policy increments policy revision and schedules a backfill for every active enrollment, with paging.

## 2. Why a monotonically growing version matters
Firestore trigger delivery is at least once and has no total ordering. Concurrent worker A may start on version 8, worker B on version 9; B may finish first. Commit transaction must read current projection and source version, write only if input revision exactly matches current canonical version, and reject worker A's obsolete 8 after 9 has committed. Even equal versions may have duplicates, so output is deterministic and idempotent.

## 3. Atomic operation lifecycle
**Command start:** validate format; derive actor UID from verified auth context; calculate canonical `payloadHash` from stable JSON (not a raw client-supplied hash).
**Write transaction:** read receipt by `(actorUid,requestId)`, verify matching hash if existing; read offering/staff/enrollment/policy/revision; validate transition; commit canonical write + audit event + sourceRevision bump + dirty job + receipt.
**Command response:** canonical write acknowledged, but student view still `recalculating`. Never claim projection already up-to-date unless worker completion confirmed.
**Worker:** lock/fetch dirty job; load **currently published** data by `(offering,student)`; pure calculate; CAS on source revision and projection; update projection and clear job only if the input remains current.

## 4. Crash windows
| Failure window | Expected recovery |
|---|---|
| Before write commit | No write and no receipt; safe retry |
| Commit succeeded, HTTP response lost | Same request ID yields stored receipt, no duplicate grade |
| Canonical published, worker crashed | Dirty job remains; backoff retry and stale indicator |
| Trigger received twice | Deduplicated by revision/job state |
| Old trigger delivered after new | Older snapshot cannot overwrite newer sourceRevision |
| Student logs out during listener | Cancel listener and clear user-scoped cache; reject stale rendered state |
| Bulk publish fails halfway | Publish barrier stays closed until all chunks validated/committed; roll forward or compensate, never partial visibility |

## 5. Publishing barrier and bulk operation caveat
Firestore atomic commits are bounded; a roster with hundreds of grades cannot be assumed to fit one transaction. Treat a publication as a state machine `draft -> publishing -> published` at assessment/session level. During `publishing`, materialization excludes it. Chunk individual row updates/revision audit; verify all required rows before atomic top-level switch to `published`. Materializer checks the top-level published marker **and** record publication status, preventing half-published exposures. A correction to previously published grade can be a single-row atomic write/audit/job and takes effect after recompute.

## 6. Prevent silent data loss
- Canonical records may be corrected, not removed by students.
- Projection is rebuildable; publication history and audit are not.
- Repair command `rebuildStudentOfferingSummary` takes `(offeringId,studentUid)`, checks service/operator authorization, recomputes, logs job and repairs stale materialization.
- Schedule future reconciliation: compare number of active enrollments vs generated summary count, detect dirty jobs older than threshold, flag stale summary policyVersion.
- Before any real data: define retention, backup schedule, export/restoration rehearsal, deletion and account lifecycle.

## 7. Audit event required fields
`eventId, timestamp, actorUid, actorRole, offeringId, affectedStudentUid, eventType, recordPath, previousRevision, nextRevision, requestId, reason?, changedFieldNames, source='teacher-portal|moodle-import'`. Limit PII, encrypt in transit/at rest via platform, restrict read to privileged audit operation. Never dump full grade arrays to regular cloud logs.

## 8. Performance and budget risks
Student dashboard loads precomputed summaries once or through snapshot listener: avoid N individual source reads from client. Teacher roster paginated; bounded batch commands. Worker compute costs grow with number of sessions and grades per student; measure with representative fixture of 100 students × 6 courses, estimate Firestore read/write operations; no invented cost forecast before measuring. Budget alert and quotas in Firebase console required before enabling cloud billing.
