# 09 — Architecture Decision Records

## ADR-001: Two apps, one backend — Accepted
**Decision:** Separate `apps/student` and `apps/teacher`, shared domain/data contracts, one Firebase backing service per environment. **Why:** different UX contexts, avoid duplicate truths. **Rejected:** two separate DBs and manual syncing. **Revisit:** only for organizational separation requirements.

## ADR-002: Firebase for MVP — Accepted
**Decision:** Firebase Auth + Firestore + Cloud Functions + local Emulator. **Why:** startup speed and serverless operations. **Tradeoff:** provider lock-in, indexes/rules/quotas and non-relational constraints. **Mitigation:** canonical normalized model, pure domain module, repository interfaces.

## ADR-003: Server-only canonical writes — Accepted
**Decision:** teacher operations only through guarded callable; student direct reads owner-only projections. **Why:** no client-side privilege escalation; security rules cannot enforce arbitrary cross-entity invariants conveniently.

## ADR-004: Published data barrier — Accepted
**Decision:** drafts and published results differ; student views created exclusively from published records. **Why:** prevent a saved-but-unreviewed grade from triggering a warning.

## ADR-005: Risk DEMO v1 and `unknown` — Accepted provisionally
**Decision:** Explainable independent signals, explicit insufficiency state, no final-score prediction. **Why:** reliable testability and avoids treating absent evidence as failure. **Revisit:** after validating policy with teaching staff.

## ADR-006: Firestore projections — Accepted
**Decision:** maintain canonical records and separate student materialized views. **Why:** student read permissions simple, responsive UI, no broad gradebook queries. **Cost:** eventual consistency and recompute worker complexity.

## ADR-007: Immutable audit + idempotent commands — Accepted
**Decision:** every mutation records actor/revision/reason, request IDs, payload hashes and operations receipt. **Why:** corrections and retries without ambiguity. **Risk:** write amplification; monitor quotas.

## ADR-008: Official LMS adapter remains future — Accepted
**Decision:** Teacher Portal is LMS **simulator**; integration only with explicit consent and real documented API. **Why:** screenshots don't establish teacher UI/API access. **Benefit:** self-contained ICT demo.

## ADR-009: JavaScript domain module now, TS adoption later — Accepted
**Decision:** first runnable pure JS code with Node tests; migrate/maintain typed API contracts as TypeScript is introduced in apps/functions. **Why:** user goal is fast reliable foundation, not cosmetic rewrite. **Gate:** TypeScript signatures / runtime validation before production.

## ADR-010: No real student data in prototype — Accepted
**Decision:** synthetic fixtures and test accounts. **Why:** minimize privacy and access risk until university approves integration and handling of educational records.
