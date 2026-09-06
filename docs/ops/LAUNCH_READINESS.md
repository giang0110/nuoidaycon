# Launch Readiness — gates between deployed and ready for real families

**Status:** deployed; core Phase 11 live machine checks verified, final PR/merge verification pending.
**Updated:** 2026-09-06
**Companion to:** [DEPLOYMENT.md](./DEPLOYMENT.md), which is the live infrastructure/runbook document.

The product is deployed, but deployment and machine verification are not launch approval.
This document separates what engineering can prove read-only from what still requires a
person, a real mailbox, a real device, a physical print, or a legal/product decision.

## 1. Readiness states

Phase 11 uses these explicit states:

- `pass` — a machine-verifiable fact was checked and satisfied the requirement;
- `fail` — a machine-verifiable fact was checked and violated the requirement;
- `machine-verified` — documentation shorthand for a check that actually returned `pass`;
- `pending_human` — automation cannot truthfully close the gate;
- `insufficient_data` — the metric is valid, but there is not yet a denominator;
- `not_applicable` — intentionally outside the current launch configuration.

`pending_human` and `insufficient_data` are never converted to `pass`.

## 2. Catalogue depth

The curated Vietnamese launch catalogue contains **60 original approved seed
activities**, exactly 15 per age band:

| Band | Activities | Types | Days of supply at one/day |
|---|---:|---:|---:|
| early (4–6) | 15 | 6/6 | ~15 |
| lower_primary (7–8) | 15 | 6/6 | ~15 |
| upper_primary (9–10) | 15 | 6/6 | ~15 |
| preteen (11–12) | 15 | 6/6 | ~15 |

Every band covers handwriting, drawing prompt, reflection, situation judgment, story
comprehension and story summary. `pnpm validate:content:launch` enforces the 15-per-band
launch floor in CI. Fifteen remains a product judgement; real retention/catalog-pressure
data should decide the next expansion.

The live Supabase catalogue was also compared read-only with the repository. A sorted
canonical projection of `slug`, type, status, source, age range and response mode produced
count `60` and MD5 `b8e39cea27ae52b9870ec43aa715f585` on both sides.

## 3. Product measurement

Product-wide measurement stays first-party and outside the web request path:

```bash
METRICS_DATABASE_URL=<connection-string> pnpm metrics
METRICS_DATABASE_URL=<connection-string> pnpm metrics --json
```

The script reads identifiers, timestamps and assignment statuses needed for aggregation;
it does not read names, email addresses, birth months or child answer content.
`METRICS_DATABASE_URL` is operator-only and must never be configured in Vercel.

### Empty-data semantics

A production state of **0 families** is a factual count, not poor performance. When no
assignment/family cohort exists, completion and week-one-return rates are `null` and the
readiness state is `insufficient_data` — never `0%`.

The live read-only baseline on 2026-09-06 is 0 families, 0 active children, 0 assignments,
0 completed assignments and 0 active families in both 7d and 28d windows. Completion
rate and week-one-return rate are therefore `null` / `insufficient_data`.

### Metrics reported

| Metric | Interpretation |
|---|---|
| Returned after week one | Whether an eligible family came back at any point after its first week |
| Active families (7d / 28d) | Recent first-party activity counts |
| Completion rate | Submitted/reviewed assignments divided by assignments, or `null` without a denominator |
| Children at ≥80% of their band | Catalogue-pressure early warning; report only aggregate count |

### Proposed success criteria — still a human product decision

These remain proposals until a person explicitly accepts/replaces them:

- 20 families with at least one child and one completed activity;
- ≥60% returned after week one;
- ≥50% completion rate;
- zero children reaching ≥80% of their band in the first fortnight.

Phase 11 reports measured values but deliberately does not turn these unconfirmed
thresholds into automated pass/fail gates.

## 4. Phase 11 machine checks

Operator commands:

```bash
PRODUCTION_BASE_URL=https://nuoidaycon.vercel.app pnpm smoke:production --json
PRODUCTION_DATABASE_URL=<connection-string> pnpm readiness:db --json
METRICS_DATABASE_URL=<connection-string> pnpm metrics --json
```

The HTTP smoke checks only unauthenticated GET requests and redirects. The database
readiness tool opens a read-only transaction and uses SELECT-only probes. Ordinary CI
uses fixtures/disposable Postgres and receives no production credentials.

The former `nuoidaycon-eight` Vercel hostname is retired and returned
`404 DEPLOYMENT_NOT_FOUND`; it is not a valid production target. Vercel preview URLs are
protected by Vercel SSO, so anonymous HTTP-policy smoke belongs on the canonical public
production URL above.

### Pre-merge machine-verification record

| Check | State | Evidence |
|---|---|---|
| Production HTTP smoke | machine-verified / pass | Exact `pnpm smoke:production --json` against `https://nuoidaycon.vercel.app` at 2026-09-06T00:17:56.796Z: 5 pass, 0 fail, `machineReady: true` |
| Live Supabase schema/RLS/grants/catalog/Storage metadata | machine-verified / pass | Project `lpqhxznwdsbvjwglsssr` is `ACTIVE_HEALTHY`; six expected migrations, RLS/grants/security-definer posture and private 15 MiB JPEG/PNG/WebP `submissions` bucket verified with connected read-only queries |
| Live seed catalogue | machine-verified / pass | Repo and live canonical projection both count 60 and MD5 `b8e39cea27ae52b9870ec43aa715f585` |
| Product metrics baseline | machine-verified; rates insufficient_data | Live aggregate counts are all zero; completion/week-one-return rates have no denominator and remain `null`, not `0%` |
| Supabase Security Advisor | machine-verified / pass | Hosted project returned 0 security lints on 2026-09-06 |

No row, Auth user, Storage object or production configuration was created merely to make
these checks pass.

## 5. Human-only gates

These are `pending_human`. Their unchecked state is intentional.

- [ ] Email deliverability — real signup confirmation and password reset on Gmail and at least one non-Gmail mailbox; the previous Gmail 550 5.7.1 issue must be genuinely resolved, not inferred from DNS settings.
- [ ] Real Auth round-trip — confirmation/recovery link returns through `/auth/callback` and establishes the expected session.
- [ ] Two-real-parent isolation smoke — each signed-in parent sees only their own children in the live UX.
- [ ] Real phone photo/EXIF — upload a phone photo in an appropriate test environment and inspect the stored object after server-side sanitisation.
- [ ] Signed Storage URL TTL — verify an actual signed URL stops working after expiry.
- [ ] Real A4 print — print a handwriting worksheet and inspect `vở ô ly` ruling, Vietnamese diacritics and pagination.
- [ ] Data export/account deletion — verify end to end with an appropriate test family outside production unless explicitly approved otherwise.
- [ ] data residency — decide Vietnam PDPD vs Singapore before collecting real child data at scale.
- [ ] legal review — schedule/complete COPPA-style and Vietnam PDPD review of the child-safety/data-handling model.

## 6. AI launch state

AI is **disabled** for launch: `AI_GENERATION_ENABLED=false`.

Parent-only generation code may exist behind mandatory parent review/approval, but Phase
11 does not make a provider call, enable a flag, relax the content rules, or declare the
AI activation preconditions complete. AI remains outside the launch-readiness pass set.

## 7. Content playbook

Content remains a long-term bottleneck. To add curated activities:

1. Use `pnpm validate:content` to identify the shallowest band/type.
2. Add original content under `content/seeds/vi/<type>/` using the existing shared envelope/provenance helpers.
3. Do not copy commercial book/textbook/in-copyright story text.
4. Run `pnpm validate:content` and fix L1 schema, L2 semantic and L3 safety failures at the content level.
5. Run `pnpm test:unit` for uniqueness/coverage regressions.
6. Run `pnpm validate:content:launch` before any release that changes curated launch content.
7. Use the aggregate ≥80%-catalog-pressure metric to decide when another expansion is needed.

## 8. Gates before opening to real families

- [x] Launch catalogue depth: 60 activities, 15 per band, all six types represented.
- [x] Phase 11 production HTTP smoke machine-verified.
- [x] Phase 11 live Supabase DB/catalog/security readiness machine-verified.
- [x] Product metrics baseline recorded with correct `null` / `insufficient_data` semantics.
- [ ] MVP success criteria in §3 explicitly confirmed or replaced by a person.
- [ ] Email deliverability human gate completed.
- [ ] data residency human decision completed.
- [ ] legal review human gate completed.

The final four lines must remain unchecked until a person actually completes them.
