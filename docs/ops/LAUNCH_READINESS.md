# Launch Readiness — content depth, metrics, and the gates between here and real families

**Status:** the product and launch-depth catalogue are built; measurement and operational gates remain.
**Companion to:** [DEPLOYMENT.md](./DEPLOYMENT.md), which covers infrastructure.

This document tracks the non-feature gates between a technically complete product and use by real families. The original review identified two gaps that ordinary test coverage could not close: insufficient content depth for one child, and no way to measure whether families return. The first is now closed; the second remains an operational launch requirement.

---

## 1. Catalogue depth

The four age bands in [ACTIVITY_MODEL.md](../product/ACTIVITY_MODEL.md) do not overlap — early is 4–6, lower_primary 7–8, upper_primary 9–10, preteen 11–12. A child never draws from more than one of them, so launch depth is measured per band rather than by headline total.

The curated Vietnamese seed catalogue now contains **60 original activities**, exactly 15 per age band:

| Band | Activities | Types | Days of supply |
|---|---:|---:|---:|
| early (4–6) | 15 | 6/6 | ~15 |
| lower_primary (7–8) | 15 | 6/6 | ~15 |
| upper_primary (9–10) | 15 | 6/6 | ~15 |
| preteen (11–12) | 15 | 6/6 | ~15 |

Every band covers all six existing activity types: handwriting, drawing prompt, reflection, situation judgment, story comprehension, and story summary. `pnpm validate:content` prints this matrix on every run, and CI now also runs `pnpm validate:content:launch` as a mandatory gate.

### The floors

| Floor | Value | Enforced by | Meaning |
|---|---|---|---|
| Development | 3 per band | `pnpm validate:content` | Below this the engine's cooldown and novelty scoring have too little material to work with |
| **Launch** | **15 per band** | `pnpm validate:content:launch` | ~2 weeks at one activity a day before the initial curated library is exhausted |

Fifteen remains a product judgement rather than a retention measurement. Revisit it once real usage data exists.

**Current gap to the launch floor: 0 activities.**

The launch-depth gate is therefore closed for all four bands. This does not mean content work stops: the `children at ≥80% of their band` metric remains the early warning that the catalogue needs another expansion.

## 2. Measurement

[CHILD_SAFETY.md](../product/CHILD_SAFETY.md) §S5 bans third-party behavioural-analytics SDKs. That rule stays. Product-wide measurement is computed from first-party rows the product already writes:

```
METRICS_DATABASE_URL=<connection string> pnpm metrics
METRICS_DATABASE_URL=<connection string> pnpm metrics --json
```

A **script, not a page** — RLS confines a parent to their own rows, so an in-app screen could only show one family their own numbers; product-wide aggregates need administrative credentials, and decision A3 bars those from every request path. `METRICS_DATABASE_URL` must never be set in Vercel.

It reads ids, timestamps and statuses. Never a name, an email, a birth month, or a child's answer. The output is safe to paste into a planning document.

### The numbers it reports

| Metric | Why it is the one that matters |
|---|---|
| **Returned after week one** | The product's whole thesis. A family that comes back has found it useful; one that does not, has not. |
| Active families (7d / 28d) | Denominator for everything else |
| Completion rate | Assigned → actually finished. A low rate means the activities need investigation rather than assumptions about parents |
| **Children at ≥80% of their band** | Leading indicator of catalogue pressure — a parent notices repeats long before any retention number moves |

`null` is reported rather than `0` where there is no data yet, so "too early to tell" cannot be misread as "everybody left".

### MVP success criteria — decide these before opening up

The review found no success criteria anywhere in the documentation. Proposed, to be confirmed or replaced by a person:

- **20 families** with at least one child and one completed activity
- **≥60%** returned after week one
- **≥50%** completion rate
- **Zero** children reaching 80% of their band inside the first fortnight

The last one is the catalogue risk stated as a number. If it trips, the answer is more content, not more features.

## 3. Content playbook

Content remains a long-term bottleneck, so the process for producing it must survive one person being unavailable.

**Authoring a new activity**

1. Pick the band and type with the lowest remaining depth — `pnpm validate:content` shows the current matrix.
2. Add content under `content/seeds/vi/<type>/`, reusing `envelope()` from `_shared.ts`, which fills in the audience, policy version and provenance. Keep larger expansions in a dedicated module and export them through `content/seeds/index.ts`.
3. All content is **original**. No commercial book text, no textbook extract, no in-copyright story (CHILD_SAFETY.md §5.4).
4. Run `pnpm validate:content`. L1 (schema), L2 (semantics) and L3 (safety) all have to pass; reading-level bands are caps, not suggestions — if a sentence is too long for the band, shorten the sentence rather than raising the cap.
5. Run `pnpm test:unit`. Catalogue tests assert depth, uniqueness and all-six-type coverage, not just individual validity.
6. Run `pnpm validate:content:launch` before any release that changes curated seed content.

**Reviewing**

A second person reads it as the parent would, and asks: is the instruction something a child can follow at the intended age? Is the parent note actually useful? Would I be comfortable if this were the first thing a family saw?

**Cadence**

Use retention and catalogue-pressure metrics to set the next authoring cadence once staging/real-family data exists. An undocumented cadence is how a content bottleneck becomes a content stall.

## 4. Gates before real families

- [x] `pnpm validate:content:launch` passes for all four age bands (60 activities; 15 per band; all six types represented)
- [ ] MVP success criteria in §2 confirmed by a person
- [ ] `pnpm metrics` run once against staging, so the baseline is not zero
- [ ] Email deliverability resolved — see DEPLOYMENT.md §3.1. Currently blocked on Gmail 550 5.7.1, which is an SPF/DKIM problem on the sending domain, not a code problem
- [ ] Q5 (data residency, Vietnam PDPD vs Singapore) decided **before** real data exists — moving it afterwards is far harder
- [ ] COPPA-style and PDPD legal review of CHILD_SAFETY.md §8 scheduled
