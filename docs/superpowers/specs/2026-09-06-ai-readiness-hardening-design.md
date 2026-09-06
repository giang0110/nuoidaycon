# AI Readiness Hardening Design

**Status:** Design approved; written spec pending user review  
**Date:** 2026-09-06  
**Branch:** `feat/phase-12-ai-readiness-hardening`  
**Base:** `claude/parent-learning-app-spec-andbvx` at Phase 11 merge commit `1616bfb98a2f03dce34fbf2a60e7a8dcb98dd556`

## 1. Purpose

Phase 12 makes the existing parent-only AI generation subsystem technically safe to operate without enabling it in production.

The product already has a substantial Phase 8 AI foundation: structured generation, deterministic L1-L3 validation, parent preview, explicit per-item approval, provenance, RLS, and a database assignment gate. This phase does not replace that design. It closes the readiness gaps that remain between “AI code exists” and “AI may be deliberately enabled after legal, provider, budget, and operational approval.”

Production remains fail-closed throughout this phase:

- `AI_GENERATION_ENABLED` remains false.
- The new database runtime gate defaults to false.
- No child-facing AI surface is added.
- No provider call is made from child mode.
- No provider credential, service-role key, or database-admin credential is exposed to browser code.
- No launch decision is implied by technical readiness.

## 2. Existing baseline and gaps

### 2.1 Existing controls to preserve

The current implementation already provides these load-bearing controls:

1. AI is parent-only and guarded by authenticated parent ownership.
2. The generation request is a closed schema with no free-form prompt field.
3. Child identifiers and child submissions are not sent to the provider.
4. Provider output is treated as untrusted and placed into a server-built activity envelope.
5. The same canonical activity validator enforces L1-L3 checks before a draft can survive.
6. A generated item is always a draft; the model cannot approve itself.
7. The parent preview uses the same activity renderer used by the normal product.
8. Approval is explicit and per item.
9. RLS restricts AI drafts to their owning parent.
10. The database assignment trigger refuses unapproved or foreign-approved AI content.
11. Prompt templates are versioned, in-repo, reviewed artifacts.
12. The test suite already covers prompt injection, provider refusal, malformed output, denylisted content, URL rejection, no child identifiers, kill-switch semantics, rate-limit logic, draft expiry, and assignment safety.

### 2.2 Readiness gaps to close

The following issues prevent safe enablement today:

- `generateDraftAction()` sets `globalToday: 0`, so the global ceiling is never enforced in production.
- Quota is checked with a read-then-call sequence and is not atomic under concurrent requests.
- The existing environment flag is a deployment-level hard gate, not a true no-deploy emergency stop.
- `ai_generation_events.outcome` does not accept every outcome the pipeline may produce, including `rate_limited` and `no_template`.
- The audit lifecycle is not correlated one-to-one with a generated draft.
- `discardDraftAction()` does not currently record the documented `discarded` outcome.
- The Anthropic model id is duplicated and hard-coded in more than one module.
- Interest slugs are syntactically validated but not proven to belong to the canonical interests catalog before a provider call.
- Expired drafts are hidden from the UI but there is not yet a verified physical-purge mechanism.
- The AI tests are strong but not yet organized as an explicit readiness golden set spanning all supported generation types and age bands.
- There is no machine-readable AI readiness report separating technical readiness from human launch gates.
- `docs/product/AI_CONTENT_RULES.md` still describes the system as design-only even though Phase 8 code and migration exist.

## 3. Goals

Phase 12 will:

1. Add a true runtime kill switch that can stop generation without a deploy.
2. Make per-parent and global generation quotas atomic before any provider call.
3. Make the database the single authoritative enforcement point for quota reservations and quota values.
4. Align audit outcomes with the real generation lifecycle and correlate each generated draft to its reservation event.
5. Centralize provider/model runtime configuration.
6. Validate canonical interest slugs before generation.
7. Add a tested physical-purge mechanism for expired AI drafts.
8. Expand AI safety regression coverage into explicit golden-set, red-team, concurrency, and RLS readiness gates.
9. Add `pnpm ai:readiness --json` with separate `technicalReady` and `launchReady` semantics.
10. Update AI documentation to describe the system that actually exists while keeping enablement explicitly blocked.

## 4. Non-goals

Phase 12 does **not**:

- enable AI generation in production;
- add child-facing AI;
- add chat, conversation history, personas, voice, avatars, or companions;
- grade, score, interpret, diagnose, or infer anything about a child;
- send child submissions, uploaded images, handwriting, or drawings to a model;
- add auto-approval, bulk approval, trusted-parent bypasses, or scheduled generation;
- add cross-child or cross-family personalization;
- fine-tune or train a provider model on family data;
- add service-role keys or database-admin credentials to Vercel;
- perform a real provider canary without the human/provider launch gates described below;
- mark legal, PDPD, DPA, retention, or budget approval as complete through code.

## 5. Safety invariants

The existing AI1-AI8 invariants remain binding. Phase 12 adds these operational invariants:

- **AI9 — Double enablement:** a provider call is allowed only when both the deployment hard gate and the database runtime gate are true.
- **AI10 — Reservation before provider:** no provider call occurs until an atomic database reservation succeeds.
- **AI11 — One reservation, one attempt:** a successful reservation consumes quota exactly once regardless of the final provider or validation outcome.
- **AI12 — Conservative failure:** a process crash after reservation leaves the reservation counted until it ages out of the rolling quota window.
- **AI13 — Audited draft:** a generated AI draft must be correlated to a generation event; if correlation/finalization cannot be completed, the draft is not exposed as usable content.
- **AI14 — Canonical interests only:** every interest slug sent to a provider must exist in the canonical interests catalog.
- **AI15 — No enablement by migration:** database migrations always leave runtime generation disabled by default.

## 6. Enablement architecture

### 6.1 Deployment hard gate

`AI_GENERATION_ENABLED` remains the deployment-level hard gate.

Rules:

- The default is false when unset or malformed.
- Production documentation keeps it false through Phase 12.
- A provider object must not be constructed before the hard gate and server config are validated.
- Turning this flag on is a later enablement action, not part of this phase.

This gate deliberately requires a deployment/configuration action to arm. It is the “do not accidentally run AI at all” boundary.

### 6.2 Database runtime configuration

A new singleton runtime configuration row is introduced in PostgreSQL. It is the authoritative database source for:

- `generation_enabled`, default `false`;
- parent rolling-1-hour limit, default `4`;
- parent rolling-24-hour limit, default `10`;
- global rolling-24-hour limit, default `5000`.

The application receives no direct insert/update/delete permission on this row. Authenticated parents cannot change the runtime gate or quotas. Operators change them only through controlled Supabase/Postgres administration.

The atomic reservation function reads this row inside the same transaction that checks quota. If the row is missing, unreadable, malformed, or disabled, the reservation is denied.

The runtime gate is the no-deploy emergency stop required by AI8. Keeping quota values in the same protected database row also prevents production drift between TypeScript constants and SQL enforcement. `lib/ai/limits.ts` no longer makes the production usage decision; the server action consumes the database reservation result.

### 6.3 Effective generation condition

A provider call is possible only when all of the following are true:

1. authenticated parent session exists;
2. parent owns the requested child;
3. request schema is valid;
4. interest slugs are canonical;
5. server hard gate is true;
6. provider configuration is valid;
7. age/policy resolution succeeds;
8. a reviewed prompt template exists;
9. the database runtime gate is true;
10. the atomic quota reservation succeeds.

Any failure stops before the provider call.

## 7. Atomic quota reservation

### 7.1 Authoritative quota semantics

Production defaults are:

- parent rolling 1 hour: 4 reservations;
- parent rolling 24 hours: 10 reservations;
- global rolling 24 hours: 5000 reservations.

The protected runtime-config row is the single production source of these values.

These are request-attempt ceilings, not only successful-generation ceilings. Provider errors, schema rejections, and safety rejections still consume the reservation because provider capacity/cost was already used or attempted.

Denied rate-limit or disabled-runtime checks do not consume quota.

### 7.2 Reservation RPC

Add a hardened `SECURITY DEFINER` PostgreSQL RPC named `public.reserve_ai_generation`.

The RPC:

- derives the parent identity from `auth.uid()`; it does not accept a caller-supplied parent id;
- verifies the child belongs to that parent;
- acquires a transaction-scoped advisory lock used only for the very short reservation transaction;
- reads and validates the protected runtime configuration;
- checks the runtime generation gate;
- counts quota-consuming reservations in the rolling windows;
- returns a denial reason when generation is disabled or any ceiling is reached;
- inserts exactly one reservation event when allowed;
- returns the reservation event id to the server action.

The function uses an empty `search_path` and fully qualified object names, following the security-definer hardening already used in the repository.

### 7.3 Direct-RPC threat model

The reservation RPC is callable with an authenticated parent session because Phase 12 will not put a service-role key or database-admin credential into Vercel.

Calling the RPC directly cannot invoke the provider, approve content, access another family, or create a usable activity. At worst, a parent can consume their own conservative reservation allowance. A direct reservation also contributes to the global ceiling; this is an availability trade-off accepted in preference to introducing a server master credential into the web runtime.

The per-parent ceilings, child-ownership check, normal signup controls, and global kill switch bound this risk. If future abuse makes it material, an independently authenticated server reservation broker can be designed as a separate phase.

## 8. Audit lifecycle

### 8.1 Outcome vocabulary

The generation audit constraint must cover the real lifecycle:

- `reserved`
- `disabled`
- `rate_limited`
- `generated`
- `schema_rejected`
- `safety_rejected`
- `provider_error`
- `no_template`
- `persistence_error`
- `approved`
- `discarded`

No generated or rejected content is stored in the audit row. Only ids, policy/template/model metadata, outcome, rule ids, timing, and timestamps are stored.

### 8.2 Quota accounting

Add an explicit `consumes_quota` boolean to audit events.

- successful reservation: `true`;
- disabled/rate-limited/no-template/approval/discard events: `false`;
- finalizing a reservation changes its outcome but never changes `consumes_quota`.

Quota counts use `consumes_quota = true`, not a fragile list of outcome names.

### 8.3 Finalization RPC

Add a hardened `public.finalize_ai_generation` RPC.

It may update only a `reserved` event owned by `auth.uid()`. It records the final generation outcome, rule ids, duration, and optional generated activity-template id. It cannot transfer ownership or rewrite immutable reservation metadata.

Finalization is idempotent only for an exact replay of the already-recorded terminal state. Repeating the same terminal outcome with the same immutable correlation data succeeds without another write. Any attempt to change one terminal outcome into another is rejected.

### 8.4 Draft correlation and fail-closed persistence

On successful provider + L1-L3 validation:

1. insert the AI draft owned by the parent;
2. correlate that draft with the reservation event;
3. finalize the reservation as `generated`.

The schema exposes an explicit relationship between the generated draft and its generation event, implemented by a nullable foreign-key column on the AI audit event that is set only for successful generated drafts.

If draft persistence fails, finalize the reservation as `persistence_error`.

If draft persistence succeeds but audit finalization cannot be completed, the server action removes the just-created draft before returning failure. The reservation remains conservative if cleanup/finalization itself fails. No unaudited AI draft is intentionally exposed to the parent.

Approval and discard each write their own non-quota audit event tied to the activity-template id.

## 9. Application generation flow

`generateDraftAction()` is changed from “read usage → run pipeline” to this order:

1. require authenticated parent;
2. parse the closed generation request;
3. fetch and verify owned child;
4. load canonical interests and reject non-canonical slugs before prompt construction;
5. de-duplicate canonical interest slugs and enforce the six-interest maximum;
6. resolve current difficulty;
7. check deployment hard gate;
8. validate provider/model configuration;
9. resolve age policy and reviewed prompt template without calling the model;
10. reserve quota atomically in PostgreSQL;
11. invoke the provider once the reservation is granted;
12. run the existing bounded generation + L1-L3 validation pipeline;
13. persist draft on success;
14. finalize the reservation event;
15. return only a draft id or a safe localized error.

Provider errors, rejection details, and database details are not returned to the browser.

The existing maximum-two-attempt behavior inside one reservation remains. A retry within the same generation transaction does not take a second parent/global reservation.

## 10. Canonical interest validation

The action uses the existing `InterestRepository` to load the canonical interest catalog before generation.

Rules:

- every submitted slug must match a current canonical interest slug;
- duplicate slugs are de-duplicated;
- at most six canonical slugs reach the pipeline;
- an unknown slug causes the request to fail before reservation/provider invocation rather than silently inventing an interest;
- child-interest membership is not required: the parent may deliberately choose another valid catalog interest for a generated activity;
- only the slug is sent to the provider, never the interest database id or family information.

## 11. Provider and model configuration

### 11.1 Single source of truth

`lib/ai/config.ts` becomes the only application module responsible for resolving AI runtime configuration.

It supplies:

- deployment hard gate;
- provider id;
- exact model id;
- maximum output tokens;
- provider timeout;
- provider credential presence/validation status.

The Anthropic adapter receives the resolved model/config as constructor input. It no longer owns a second hard-coded model constant.

### 11.2 Fail-closed configuration

Missing or invalid provider configuration returns “AI unavailable” before quota reservation and before provider construction.

No fallback model is chosen automatically in production. Changing the production model is an explicit configuration/review decision and is reflected in provenance.

The repository may retain a deterministic fake provider for tests; it is never selectable from a production request.

## 12. Draft retention

The existing UI TTL of 48 hours remains the product rule.

Phase 12 adds a database cleanup function that physically deletes expired unapproved AI drafts while preserving the metadata-only audit trail.

Requirements:

- only `source = 'ai'` and `status = 'draft'` rows older than 48 hours are eligible;
- approved content is never deleted by this cleanup;
- seeded content is never deleted;
- another parent's data remains protected by database ownership/RLS rules;
- the cleanup function is tested against fresh, expired, approved, and seed rows;
- production scheduling is **not** automatically enabled by this phase.

A human/ops gate must explicitly approve the schedule and cadence before a cron job is activated. Until then the readiness report marks physical-purge scheduling pending even though the cleanup mechanism is technically ready.

## 13. Testing strategy

### 13.1 Unit tests

Retain current AI pipeline tests and add coverage for:

- config is disabled by default;
- provider cannot be constructed on a disabled or invalid config path;
- model comes from one configuration source;
- unknown interest slugs fail before generation;
- de-duplication and six-interest cap;
- one reservation covers both bounded provider attempts;
- every pipeline terminal outcome maps to an allowed audit outcome;
- draft correlation/finalization failure removes the draft from the usable path;
- `discarded` is audited;
- readiness status mapping.

### 13.2 Golden-set fixtures

Create explicit fixture-driven AI safety corpus coverage for all supported AI types:

- `reflection`
- `drawing_prompt`
- `situation_judgment`

The corpus covers all four product age bands. It contains known-safe candidates that must pass and known-unsafe/malformed candidates that must fail for the expected rule family.

Golden tests remain deterministic and never call a live provider.

### 13.3 Red-team fixtures

Add reusable cases for:

- English and Vietnamese “ignore previous instructions” attacks;
- delimiter closing/reopening attempts;
- HTML/XML/system-role injection;
- URL/email/phone/social-handle insertion;
- self-approval/provenance spoofing;
- attempts to change age band/difficulty;
- attempts to request child identity, home, school, photo, or contact data;
- Unicode/zero-width obfuscation cases supported by the deterministic safety layer.

No red-team failure may be converted to a warning or auto-sanitized into assignable content.

### 13.4 Database/integration tests

Extend the existing AI/RLS integration suite to prove:

- runtime gate defaults false after a clean migration;
- authenticated parents cannot mutate runtime configuration;
- parent A cannot reserve for parent B's child;
- concurrent requests at the parent hourly and rolling-24-hour boundaries cannot exceed the configured limit;
- concurrent requests at the global rolling-24-hour boundary cannot exceed the configured limit;
- disabled and rate-limited attempts do not consume quota;
- successful reservations do consume quota even when the provider later fails;
- reservation event ownership cannot be rewritten;
- only the owning parent can finalize their reservation;
- an exact repeated finalization is idempotent;
- a conflicting second finalization is rejected;
- approved/foreign-approved assignment protections remain green;
- expired-draft cleanup deletes only eligible rows;
- security-definer functions have empty search paths and constrained grants;
- the full RLS matrix remains green.

For deterministic and inexpensive concurrency tests, the disposable test database may temporarily lower the protected runtime-config limits using its database-admin test connection. The production migration defaults remain 4/hour, 10/rolling-24h, and 5000/global-rolling-24h. Application roles cannot lower or raise these values.

### 13.5 E2E

Production AI stays off, so E2E must verify:

- unauthenticated access still redirects;
- parent AI page renders the disabled state when the hard gate is off;
- no generation request is emitted from child mode;
- existing seeded assign/play/review flows remain unaffected.

A real Anthropic call is not part of CI.

## 14. AI readiness report

Add `pnpm ai:readiness --json`.

The command produces a report with two explicit layers and reuses the Phase 11 readiness status vocabulary where practical.

### 14.1 Technical readiness

`technicalReady` is true only when machine-verifiable controls pass, including:

- hard gate defaults off;
- runtime DB gate exists and is false by default;
- atomic reservation functions and constraints exist;
- audit outcomes/schema are aligned;
- config has one model source;
- golden-set and red-team suites pass;
- AI/RLS integration tests pass;
- cleanup function exists and passes tests;
- required migration history is present;
- no service-role/browser credential exposure is detected by static checks.

### 14.2 Launch readiness

`launchReady` is stricter. It is true only when `technicalReady` is true **and** every launch gate is explicitly complete.

Launch gates are:

1. valid provider API credential installed in the intended server environment;
2. live provider canary passed using synthetic, non-child test data;
3. model id and structured-output behavior verified against the currently approved provider API;
4. provider DPA/no-training/retention terms reviewed and accepted;
5. PDPD/child-data legal review complete;
6. named budget owner and spend ceiling approved;
7. expired-draft purge production schedule approved and activated;
8. operator runbook for emergency runtime disable verified;
9. explicit product-owner approval to enable AI.

Pending human gates make `launchReady = false`; they are never inferred from code or silently treated as pass.

Through Phase 12 the expected safe result is:

```text
technicalReady = true   # once implementation and CI are complete
launchReady = false     # until human/provider gates are deliberately completed
production generation = off
```

## 15. Migration and rollout

Phase 12 requires a new additive Supabase migration because atomic reservation, runtime configuration, audit alignment, correlation, and cleanup are database controls.

Rollout order:

1. implement and test migration on the disposable CI database;
2. run unit, golden, red-team, full integration/RLS, build, and E2E gates;
3. open PR from the Phase 12 feature branch;
4. review migration for privilege/search-path/default-off guarantees;
5. apply migration to production while `AI_GENERATION_ENABLED=false`;
6. verify Supabase migration history, Security Advisor, runtime gate=false, and zero unexpected writes;
7. run `pnpm ai:readiness --json` against production read-only inspection inputs;
8. merge only after PR CI and preview are green;
9. verify post-merge CI and production smoke;
10. leave both AI enablement gates off.

Applying the migration must not call a provider, create a child, create an AI draft, or enable runtime generation.

## 16. Documentation updates

Implementation updates:

- `docs/product/AI_CONTENT_RULES.md` from “design only” to the actual implemented/readiness state;
- `.env.example` with AI configuration names but no secrets and disabled defaults;
- deployment/runbook documentation with the runtime-disable procedure;
- launch-readiness documentation with separate technical and human AI gates.

Documentation must continue to state that technical readiness does not authorize production enablement.

## 17. Success criteria

Phase 12 is complete when all of the following are true:

- the global quota bug is eliminated;
- concurrent quota reservations cannot exceed database-configured boundaries;
- a no-deploy runtime kill switch is proven in integration tests;
- audit schema accepts and records the complete lifecycle;
- every generated draft is correlated to a generation reservation;
- discard is audited;
- provider/model config has one source of truth;
- invalid interest slugs cannot reach a provider;
- expired draft physical cleanup is implemented and tested;
- golden-set and red-team AI suites pass;
- existing assignment/RLS safety tests remain green;
- `pnpm ai:readiness --json` reports technical and launch readiness separately;
- production migration is applied safely with runtime gate false;
- production AI remains disabled after merge;
- all human/provider/legal enablement gates remain explicit rather than guessed.
