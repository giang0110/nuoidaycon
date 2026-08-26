# Contributing

## Non-negotiables

These come from [CHILD_SAFETY.md](docs/product/CHILD_SAFETY.md) and are not waivable by a
reviewer, a flag, or a parent setting. A change that violates one does not merge.

1. **No free-form conversational interface between a child and a language model.** Ever.
2. **No child accounts, credentials, or sessions.** Children are profiles under a parent.
3. **No child-to-child or child-to-stranger communication** — no chat, comments, feeds, sharing.
4. **No unreviewed content reaches a child.**
5. **No third-party advertising or behavioural-analytics SDKs.**
6. **No answer keys sent to the child client.** Strip them server-side.
7. **The service-role key never appears in a request path.** ESLint enforces this.
8. **No LLM dependency in `package.json` through Phase 7.** CI enforces this.

## Workflow

TDD. Write the failing test, watch it fail *for the right reason*, make it pass, refactor.
Pure domain logic in `lib/domain` targets ≥ 90% branch coverage once Phase 4 lands.

```bash
pnpm verify        # before every push
```

Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`). One logical change per
commit.

## Architectural rules the linter enforces

- **`lib/domain` is pure** (decision A1). No Supabase, Next.js, React or UI imports. Take
  an interface; let `lib/data` implement it. This is what makes the engine testable
  without a database or a browser.
- **`process.env` is off-limits in app code** (decision A3). Read configuration through
  `lib/env.ts`. Only `scripts/` and `supabase/` may touch the environment directly, and
  only they may use the service-role key.

If a lint rule blocks you, the rule is probably right. Ask before disabling it.

## TypeScript is a safety layer, not a security boundary

Types are erased at runtime. A value from `JSON.parse`, a raw SQL row, or an `as` cast is
not checked by anything. Every rule that matters is also enforced at runtime and, where
the data model allows, in the database — see
[PRODUCT_SPEC.md §11.3](docs/product/PRODUCT_SPEC.md). Never justify a missing runtime
check by pointing at a type.

## Writing content

All MVP activities are **original work authored for this product**. Do not copy
commercial books, textbook text, or in-copyright stories. Public-domain or properly
licensed material requires an `attribution` field and documented rights.

Every activity must:

- pass L1–L3 validation (`pnpm validate:content`) — structure, references, and safety;
- sit inside its declared age band's difficulty range and permitted response modes;
- avoid every prohibited topic in [CHILD_SAFETY.md §5.1](docs/product/CHILD_SAFETY.md);
- address the child warmly in the second person, praising effort over ability;
- never shame a wrong answer — feedback explains, it does not scold.

`situation_judgment` carries the strictest rules: scenarios must be everyday and
child-solvable, never depict danger whose correct resolution is adult intervention, and
always keep "tell a trusted adult" as a valid answer.

## Database changes

Every new table needs, in the same pull request:

1. RLS **enabled**, deny-by-default, nothing granted to `anon`;
2. a decision on `FORCE ROW LEVEL SECURITY` with a SQL comment stating the reason
   ([§11.2](docs/product/PRODUCT_SPEC.md));
3. coverage in the **cross-tenant test matrix** for SELECT / INSERT / UPDATE / DELETE
   ([§11.4](docs/product/PRODUCT_SPEC.md)) — a meta-test fails the build if you skip this.

## Pull requests

Say what changed and why, name the phase, and link the spec section you are implementing.
If you found a spec problem, fix the spec in the same PR rather than coding around it.
