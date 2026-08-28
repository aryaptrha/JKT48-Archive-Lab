# Conventions

The rules a change to this codebase has to hold to, and the traps it has already
been caught by. Read this before writing a file; `TODO.md` says what is left to
write, and this says how.

Section references (§) are to `JKT48_Archive_Lab_PRD_v1.md`.

---

## 1. The nine invariants

These are not style preferences. Each one is a PRD requirement that a plausible,
well-intentioned change would break.

**1. Relationship-first (§10).** There is no `member.team_id`, no `generation_id`,
no `center_song_id`, anywhere — and there must never be. A member's generation,
team, captaincy or centre credit is a `Relationship` row with a validity window.
The easiest place for such a foreign key to creep back in is an admin form, which
is why `src/domain/attribute-fields.ts` carries a note about what is deliberately
absent from every field list.

**2. Temporal validity (§11).** Historical truth is `valid_from` / `valid_to`,
queried with:

```sql
WHERE valid_from <= :selected_date
  AND (valid_to IS NULL OR valid_to >= :selected_date)
```

No snapshot tables, no per-year columns. `valid_to IS NULL` means *open*, which is
not the same as *unknown*.

**3. Mastery status names are configuration, not code (§8.3).** Never compare a
band name to a literal, and never hard-code one in a status position. The names,
thresholds and colours are admin-editable rows; `/admin/mastery` is the entire
reason this holds.

**4. Difficulty is cognitive complexity (§6.3).** EASY is a direct fact, MEDIUM
combines facts, HARD needs a relationship, EXPERT an indirect one, NIGHTMARE a
multi-hop inference. A harder tier asks a harder *question*. It does **not**
shorten the clock — shrinking `timeLimitSec` for a higher tier is a misuse of the
field.

**5. Admin is a role column, never an allowlist (§19).** No comparison of an email
address against a constant, anywhere, in any file. No environment variable that
grants admin at runtime. The first administrator comes from the seed via
`SEED_ADMIN_EMAIL` *and only if that account already exists*; every one after that
is granted at `/admin/settings/users` by an existing admin, and audited.

**6. Authorization repeats at every boundary (§35).** Every admin page and **every
Server Action** calls `await requireAdmin()` itself. A layout does not protect an
action: a Server Action is an independently addressable POST endpoint, reachable
without ever rendering the page it appears on. Middleware cannot do this check
either — Prisma does not run on the Edge, so middleware can only see *whether* a
session cookie exists, not what role it carries.

**7. Every administrative mutation is audited (§17, §35).** The services in
`src/server/services/` do this when handed an `Actor` built by
`actorFromProfile(profile)`. Never write an audit row by hand. The log is
append-only and there is no delete path anywhere in the codebase — a log a curator
can edit answers no question worth asking of it.

**8. Never widen a service.** Pages, actions and route handlers call the existing
functions in `src/server/services/*` and `src/server/queries/*`, which already
validate, authorize and audit. **Do not import `prisma` in a page, an action or a
route handler.**

**9. No secret reaches the browser (§28, §35).** The Supabase service-role key is
server-only. Secrets are not committed; `.env` is gitignored.

---

## 2. TypeScript

`strict`, plus `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`,
`verbatimModuleSyntax`, `isolatedModules`, `moduleResolution: "bundler"`. Alias
`@/*` → `./src/*`.

- **`verbatimModuleSyntax`** — a type-only import must be its own statement:
  `import type { Foo } from '…'`. Importing a type as a value is a compile error.
- **`lib` is `["dom", "dom.iterable", "ES2022"]`** — ES2023 array helpers are
  **not available**. No `toSorted`, `toReversed`, `findLast`, `Object.groupBy`.
  Use `.slice().sort()`.
- **`noUncheckedIndexedAccess`** — `arr[0]` is `T | undefined` and `rec[key]` is
  `V | undefined`. Guard or default before use. This is the single most common
  cause of a failing typecheck here.
- **`noUnusedLocals` / `noUnusedParameters`** — an unused import or parameter fails
  the build, not just the lint.
- **Next 16: `params` and `searchParams` are Promises.** Type them as
  `Promise<…>` and `await` them.
- **Server Action files** start with the `'use server'` directive and may export
  only async functions. Types must be imported from elsewhere.
- **`redirect()` throws to unwind**, so it must be called *outside* any `try`/`catch`
  that would swallow it. The pattern used throughout — see
  `src/app/login/actions.ts`, which is the canonical example — is to assign an
  `outcome` URL inside the try/catch and call `redirect(outcome)` after the block.
  `redirect` returns `never`, so it narrows types after an `if`.

## 3. ESLint

Flat config, ESLint 9. Rules this project has actually tripped over:

- **`react/no-unescaped-entities`** — a raw apostrophe in JSX *text* is an error.
  Use `&rsquo;`.
- **`react-hooks/purity`** — no `Date.now()`, no argless `new Date()`, no
  `Math.random()` in a render path. When a page needs today's date, use `today()`
  from `@/lib/date`.
- **`react-hooks/set-state-in-effect`**.
- Import grouping follows the neighbouring files: external packages, blank line,
  `@/` value imports, blank line, `import type` lines last.

Note: `FlatCompat.extends('next/core-web-vitals')` throws
`Converting circular structure to JSON` in this setup — do not reintroduce it.

## 4. Environment

- **Write files with the Write tool.** Large quoted Bash heredocs crash the msys
  layer in this environment; it has happened twice. Use `Write` for new files and
  `Edit` for surgical changes.
- Nested command substitution inside `sed -n "$(grep …)"` also crashes Git Bash
  here. Split it into two commands.

---

## 5. Design language (§P5, §22)

Editorial, archival, precise, cinematic, motion-aware. The PRD explicitly rules
out: purple gradient heroes, the generic AI-dashboard aesthetic, excessive rounded
cards, frosted glass everywhere, emoji as primary UI icons, generic SaaS styling.
Do not default to Inter.

Compose from the existing primitives in `src/components/ui/` and
`src/components/archive/`. **Never write a raw hex colour or an arbitrary Tailwind
colour utility in markup.** The semantic tokens, all defined in
`src/app/globals.css` under `@theme`:

```
ground  ground-sunk  surface  surface-raised
ink  ink-strong  ink-muted  ink-faint
rule  rule-strong
accent  accent-hover  accent-soft  accent-ink
ochre  ochre-soft   sage  sage-soft   indigo  indigo-soft
```

Utility classes: `.eyebrow`, `.ruled`, `.prose-archive`, and the `text-catalog`
size (0.6875rem / 0.09em tracking).

Tailwind v4 via `@tailwindcss/postcss`: `@import 'tailwindcss'`, tokens in
`@theme`, dark mode through
`@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *))`.
Arbitrary values use the `duration-(--duration-fast)` form. Prefer
`has-[:checked]:` over `has-checked:`. Respect reduced-motion.

Rules and type hierarchy do the work that borders and cards do elsewhere. Figures
are `tabular-nums`, often `font-mono`. No lucide icon unless a neighbouring file
already uses one for the same purpose.

**Every screen states its purpose in one lead sentence, and every empty state says
something true and specific.** An empty state reading "No data" is a defect: say
what is missing, why it matters, and what to do next. Distinguish "nothing
catalogued yet" from "this filter matched nothing", and — as `/admin` already does
— distinguish "no open issues" from "no scan has been run", because an absence of
evidence is not a clean bill of health.

Comments explain the decision and cite the PRD section. They do not narrate the
code. Every file gets a header docblock.

---

## 6. Forms and mutations

Two shapes of admin mutation exist, and they report differently on purpose. The
reasoning lives in `src/lib/form-state.ts`; the split is **display only** — both
paths run identical server-side validation and authorization (§35).

**Short submits** — publish/unpublish, retire a term, save a one-line config row,
resolve an issue, change a role. A plain action typed
`(formData: FormData) => Promise<void>` that ends in `redirect()` back to the same
screen carrying `?notice=` or `?error=` (built with `URLSearchParams`). The page
reads them from `searchParams` and renders `<FormBanner>`. The redirect means a
refresh is a GET, not a second write, and a failed save survives a reload and can
be linked to a colleague.

**The two long editors** — a record and a relationship — use `useActionState` with
`AdminFormState` in a `'use client'` component, so a rejected save comes back with
every typed value still in the inputs and each message under the field that caused
it. "Please correct the highlighted fields" is useless if the fields are blank and
the highlights are gone. Their success path never returns: it redirects.

Other conventions:

- After a mutation, `revalidatePath()` the screens whose data changed, plus the
  public path when a publish state changed.
- A destructive submit is wrapped in `DangerZone`, and **the form inside it must
  include its own `required` checkbox** — `DangerZone` deliberately does not render
  one, it only renders the stated consequence and the screen-reader hint. The
  browser then refuses the submit until it is ticked: a real confirmation needing
  no JavaScript. `window.confirm` is none of those things.
- A consequence states what will actually be lost, with numbers. "Are you sure?"
  is not a warning; "this also deletes 14 relationships" is.
- Filter and search forms are **GET** forms whose inputs are named exactly like the
  query parameters they set, so list state lives in the URL and every view is
  linkable. Dropping the `page` parameter is how a changed filter returns to page 1.
- Prefer a native `<select>` over a JS combobox, and a URL parameter over client
  state. `Select` in `src/components/ui/field.tsx` is a real `<select>` for exactly
  this reason: it posts with the form and works before hydration.

---

## 7. Component gotchas

Behaviour that has surprised a caller before:

- `SearchField` **requires** an `action` prop and hard-codes `id="q"` / `name="q"`.
  There is no `autoFocus`.
- `NavLink` needs `exact` for a parent path, or it matches every child route.
- `CheckboxField` has **no `error` prop** — render the message yourself alongside it.
- `Field` renders its `hint` only when there is no `error`.
- `ScoreBar` takes `color?: string | null`.
- `ProfileSummary.role` is typed `string`, not the enum — use an `in` guard plus
  `humanizeEnum`.
- `entityHref` takes a single object argument.
- `attributeTableFor()` returns `AttributeTable | null`.
- `EntityRef` has no `isPublished`; `AdminEntityRow` and `EntityPickerOption` add it.
- `IssueSeverity` is `INFO | WARNING | ERROR` — there is no `CRITICAL`.
- `countRelationshipsByType()` returns a map keyed by **`relationshipTypeId`, not
  `code`**. Two call sites were silently always-missing because of this.
- `AdminDashboard.recentActivity` is a plain `AuditEntryView[]`, not `{items}`.
- `getHealthIssues` filters on `status` / `checkCode` / `page` / `pageSize` — **not
  on severity**, despite `/admin/data-health?severity=…` being a link the dashboard
  emits. Filter severity in the page and say so.
- There is no `DIFFICULTY_LABELS` and no `ANSWER_MODE_LABELS` in `@/domain/labels`.
  Check `src/domain/difficulty.ts` first, then fall back to `humanizeEnum`.
- `Paginated<T>` is `{items, total, page, pageSize, pageCount}`; `emptyPage<T>()`
  builds a blank one.

---

## 8. Database workflow (§24 — Code First)

- The Prisma schema is the **single source of truth**.
- Tables are **never** created or altered in the Supabase dashboard.
- Every schema change produces a migration committed to Git.
- Production runs `prisma migrate deploy`. `prisma db push` is not a production
  migration mechanism.
- The production database is not modified by hand as a development workflow.
- The seed is idempotent and upserts on natural keys. It is not a migration tool.

---

## 9. Before you call it done

```
npm run verify      # prisma validate → tsc --noEmit → eslint
npm run build       # prisma generate && next build
```

`npm run verify` passing is necessary and not sufficient — it does not compile a
single route. `next build` is what enforces the App Router constraints, so a change
that touches `src/app/` is not verified until that has run.
