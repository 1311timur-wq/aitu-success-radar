# 05 — Callable API contracts v1.0 (not yet implemented)

## 1. Transport & conventions
Firebase Cloud Functions v2 `onCall` HTTPS callable. Firebase client SDK attaches Firebase Auth ID token and (if enabled) App Check context. Teacher Portal never writes canonical Firestore documents directly.

Each command accepts `requestId` (UUID recommended), `offeringId`, and operation-specific payload. Server replies `{ok:true,data:{...},requestId,serverTime}` or typed Firebase `HttpsError` codes. Display error messages are localized in UI; do not leak enrollment data or internal stack traces in public responses.

| Error | Meaning | Client action |
|---|---|---|
| `unauthenticated` | No valid Firebase identity | Sign in |
| `permission-denied` | Not teacher of this offering / not enrolled / not allowed | Show access denied, no retry |
| `invalid-argument` | Malformed ID, invalid points, bad state | Highlight fields |
| `not-found` | Offering/session/assessment does not exist or is inaccessible | Safe generic message |
| `failed-precondition` | Draft/published state or inactive offering incompatible | Refresh context |
| `already-exists` | Reused requestId with different body | Generate new requestId after diagnosis |
| `aborted` | Revision collision (concurrent edit) | Refresh and compare before retry |
| `resource-exhausted` | Too many records/rate limit | Chunk, retry later |
| `unavailable` | Temporary backend problem | Show pending/stale and retry |

## 2. Teacher queries (read via callable)
`getMyOfferings({pageSize?, pageToken?})` → own offerings summary; `getOfferingRoster({offeringId,pageSize?,pageToken?})` → student ID + minimal safe displayName; `getAttendanceSheet({offeringId,sessionId})` → one session and current attendee record revisions; `getTaskCompletionSheet({offeringId,assessmentId})` → submission statuses for assigned coursework; `getGradebook({offeringId,assessmentId,pageSize?,pageToken?})` → grades for own offering. Queries return no unrelated students and have bounded page sizes.

## 3. Teacher write commands
### `createSession`
```json
{"requestId":"11111111-1111-4111-8111-111111111111","offeringId":"demo-offering-1","type":"lecture","startsAt":"2026-10-26T05:00:00Z","durationMinutes":50,"maxAttendancePoints":2}
```
Validates active offering, teacher `manage_sessions`, temporal format and duration. Returns `{sessionId,revision:1,status:'scheduled'}`. Session IDs allocated on server.

### `recordAttendanceBatch`
```json
{
  "requestId":"22222222-2222-4222-8222-222222222222","offeringId":"demo-offering-1","sessionId":"session-1",
  "records":[
    {"studentUid":"demo-student-01","status":"present","pointsAwarded":2,"expectedRevision":0},
    {"studentUid":"demo-student-02","status":"absent","pointsAwarded":0,"expectedRevision":0}
  ], "publish":false
}
```
Batch allowed only for active session in `held` state; max N configured server-side (MVP suggested N=50). Each status validated, all students enrolled, points within session max, expectedRevision obeyed. `publish:false` drafts only; a separate publish operation makes them visible.

### `publishAttendanceSession`
`{requestId,offeringId,sessionId,expectedRevision}` → publishes all explicitly marked approved records for the session; **unmarked students stay unmarked**, not absent. For larger rosters use deterministic chunking + publication state gate so students never see half-published session.

### `createAssessment`
`{requestId,offeringId,title,category,maxPoints,dueAt?,overdueEligible:false}` → assessment draft; weights from offering policy, not chosen silently by teacher.

### `recordTaskCompletionBatch`
`{requestId,offeringId,assessmentId,records:[{studentUid,state:'submitted'|'late_submitted'|'missing'|'pending'|'excused',expectedRevision}]}` → records confirmed assignment submission status independently of grading. Only explicit published `missing` after dueAt contributes to overdue risk; student task projection is published through a separate controlled command.

### `recordGrade`
`{requestId,offeringId,assessmentId,studentUid,state:'graded',pointsEarned:8,expectedRevision:0,publication:'draft'}` → save/update grade. `state:'pending'/'missing'/'excused'` requires `pointsEarned:null`. Explicit `missing` should not be inferred from empty record.

### `publishAssessmentGrades`
`{requestId,offeringId,assessmentId,expectedRevision}` → gate and publish reviewed grades, create dirty summary jobs for changed student IDs; ungraded stay pending. Publishing does not mark absent grades as zero.

### `correctPublishedRecord`
`{requestId,offeringId,recordType:'attendance'|'grade',recordId,expectedRevision,patch,reason}` → explicit versioned correction with mandatory reason and audit. Reject arbitrary keys, role escalation, writes to other offerings.

## 4. Student reads (Firestore SDK)
- Summary list: `onSnapshot(collection(db,'students',uid,'courseSummaries'))`, UI filters or sorts by local ordering and active term after loading own docs.
- Details: query own `attendanceItems`, `taskItems` and `gradeItems` with `where('offeringId','==',id)` and ordered pagination. Add indexes from actual generated query requirements.
- `updatedAt`, `freshness`, `sourceRevision`: render “Последнее обновление”, refresh spinner, offline/stale state; no local mutation of canonical marks.
- No individual student's exact performance is shared with another student.

## 5. Command transaction template
```text
cmd(actor,requestId,payload):
  validate schema and request size; authenticate actor
  authorize role + staff permission + offering active
  authorize each target's active enrollment
  tx: check receipt; if same hash return prior result; if different hash fail
      read current source revision; validate expectedRevision
      apply canonical change(s), append audit, set dirty marker(s), receipt
  return committed response (projection may still be recalculating)
```
For `publishAssessmentGrades`, chunk work with a top-level publish barrier; avoid Firestore transaction limits on huge rosters. Recompute job reads latest canonical truth and uses monotonically increasing `sourceRevision` to prevent stale overwrites.

## 6. No API connection to real AITU LMS in MVP
The LMS screenshot describes attendance columns, not provider endpoints. Future `MoodleAdapter` requires documented API credentials from the institution, explicit read scopes, external ID map and ingestion source-provenance. Never scrape usernames/passwords or claim official grades from local mock data.
