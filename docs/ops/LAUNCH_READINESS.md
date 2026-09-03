# Launch Readiness — content depth, metrics, and the gates between here and real families

**Status:** the product is built; the catalogue and the measurement are not.
**Companion to:** [DEPLOYMENT.md](./DEPLOYMENT.md), which covers infrastructure.

This document exists because a review found two gaps that no amount of test
coverage closes: there is not enough content for any one child, and there is no
way to tell whether anybody comes back.

---

## 1. The catalogue is thinner than the total suggests

The four age bands in [ACTIVITY_MODEL.md](../product/ACTIVITY_MODEL.md) do not
overlap — early is 4–6, lower_primary 7–8, upper_primary 9–10, preteen 11–12. A
child never draws from more than one of them.

So "22 activities, MVP target 20–25" is not 22 activities for anybody:

| Band | Activities | Types | Days of supply |
|---|---|---|---|
| early (4–6) | 4 | 2/6 | ~4 |
| lower_primary (7–8) | 10 | 6/6 | ~10 |
| upper_primary (9–10) | 5 | 4/6 | ~5 |
| preteen (11–12) | 3 | 3/6 | ~3 |

An eleven-year-old sees everything the product has for them in three days.

`pnpm validate:content` prints this table on every run. The risk register
called this "feels repetitive" and mitigated it with cooldowns and novelty
scoring — but those reorder a library, they cannot deepen one.

### The floors

| Floor | Value | Enforced by | Meaning |
|---|---|---|---|
| Development | 3 per band | `pnpm validate:content` (fails) | Below this the engine's cooldown and novelty scoring have nothing to work with, and their tests stop meaning anything |
| **Launch** | **15 per band** | `pnpm validate:content:launch` (fails) | ~2 weeks at one activity a day — long enough for a habit to form before the library runs dry |

Fifteen is a judgement, not a measurement. Revisit it once there is retention
data to argue with.

**Current gap to launch: 38 activities.**

### Two honest ways to close it

1. **Author 38 more activities.** Correct, and long-lead. Content is the
   bottleneck of this product and always will be.
2. **Narrow the first launch to one band.** `lower_primary` is closest (10 of
   15, all six types) and needs five more. Doing one age well beats doing four
   thinly, and it converts the catalogue risk from fatal to manageable.

`validate:content` reports `launch-ready` bands precisely so option 2 is
visible rather than only failure.

## 2. Measurement

[CHILD_SAFETY.md](../product/CHILD_SAFETY.md) §S5 bans third-party
behavioural-analytics SDKs. That rule stays. It is also why, until now, there
was no way to answer the questions that decide whether this product works.

`pnpm metrics` computes them from rows the product already writes:

```
METRICS_DATABASE_URL=<connection string> pnpm metrics
METRICS_DATABASE_URL=<connection string> pnpm metrics --json
```

A **script, not a page** — RLS confines a parent to their own rows, so an
in-app screen could only show one family their own numbers; product-wide
aggregates need administrative credentials, and decision A3 bars those from
every request path. `METRICS_DATABASE_URL` must never be set in Vercel.

It reads ids, timestamps and statuses. Never a name, an email, a birth month,
or a child's answer. The output is safe to paste into a planning document.

### The numbers it reports

| Metric | Why it is the one that matters |
|---|---|
| **Returned after week one** | The product's whole thesis. A family that comes back has found it useful; one that does not, has not. |
| Active families (7d / 28d) | Denominator for everything else |
| Completion rate | Assigned → actually finished. A low rate means the activities are wrong, not that parents are lazy |
| **Children at ≥80% of their band** | Leading indicator of the catalogue risk — a parent notices repeats long before any retention number moves |

`null` is reported rather than `0` where there is no data yet, so "too early to
tell" cannot be misread as "everybody left".

### MVP success criteria — decide these before opening up

The review found no success criteria anywhere in the documentation. Proposed,
to be confirmed or replaced by a person:

- **20 families** with at least one child and one completed activity
- **≥60%** returned after week one
- **≥50%** completion rate
- **Zero** children reaching 80% of their band inside the first fortnight

The last one is the catalogue risk stated as a number. If it trips, the answer
is more content, not more features.

## 3. Content playbook

Content is the bottleneck, so the process for producing it must survive one
person being unavailable.

**Authoring a new activity**

1. Pick the band and type with the biggest gap — `pnpm validate:content` names it.
2. Add it to `content/seeds/vi/<type>/index.ts` using `envelope()` from
   `_shared.ts`, which fills in the audience, policy version and provenance.
3. All content is **original**. No commercial book text, no textbook extract,
   no in-copyright story (CHILD_SAFETY.md §5.4).
4. Run `pnpm validate:content`. L1 (schema), L2 (semantics) and L3 (safety)
   all have to pass; the reading-level bands are caps, not suggestions — if a
   sentence is too long for the band, shorten the sentence rather than raising
   the cap.
5. Run `pnpm test:unit`. The catalogue is covered by tests that assert on
   coverage, not just on validity.

**Reviewing**

A second person reads it as the parent would, and asks: is the instruction
something a child can follow without an adult reading it aloud? Is the parent
note actually useful? Would I be comfortable if this were the first thing a
family saw?

**Cadence**

Whatever it is, write it down here once it exists. An undocumented cadence is
how a content bottleneck becomes a content stall.

## 4. Gates before real families

- [ ] `pnpm validate:content:launch` passes, **or** the launch is narrowed to
      the bands it names as ready
- [ ] MVP success criteria in §2 confirmed by a person
- [ ] `pnpm metrics` run once against staging, so the baseline is not zero
- [ ] Email deliverability resolved — see DEPLOYMENT.md §3.1. Currently blocked
      on Gmail 550 5.7.1, which is an SPF/DKIM problem on the sending domain,
      not a code problem
- [ ] Q5 (data residency, Vietnam PDPD vs Singapore) decided **before** real
      data exists — moving it afterwards is far harder
- [ ] COPPA-style and PDPD legal review of CHILD_SAFETY.md §8 scheduled
