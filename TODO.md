# TODO — JKT48 Archive Lab

Work order for finishing the V1 starter. Read `docs/CONVENTIONS.md` before writing
any file in here; it holds the invariants and the language-level traps that this
codebase has already been bitten by, and it is shorter than re-deriving them.

Section references (§) are to `JKT48_Archive_Lab_PRD_v1.md`.

---

## 0. Verification Gate Status — PASSED ✅

```
npm run verify      # prisma validate → tsc --noEmit → eslint (PASSED - 0 errors)
```

- `prisma validate` — **PASSED.** Schema syntax and relations validated.
- `tsc --noEmit` — **PASSED.** Strict TypeScript checks pass with 0 errors.
- `eslint` — **PASSED.** Next.js & TypeScript ESLint rules pass with 0 errors.

### Files awaiting their first typecheck

Written by the stopped fan-out, complete but unverified:

| File | Notes |
| --- | --- |
| `src/app/admin/entities/actions.ts` | `saveEntityAction`, `setPublishedAction`, `deleteEntityAction` |
| `src/app/admin/data-health/page.tsx` | 477 lines; check it against the real `getHealthIssues` filter set |
| `src/app/admin/data-health/actions.ts` | `runScanAction`, `setIssueStatusAction` |

Two things to check by hand in those, because they are the mistakes most likely
to have been made:

1. `getHealthIssues` filters on `status`, `checkCode`, `page`, `pageSize` — **not
   on severity.** `/admin/data-health?severity=…` is a link the dashboard already
   emits, so the page must filter severity itself, after fetching, and say so in
   a comment rather than implying the query did it.
2. `saveEntityAction` must gather every `attributes.*` FormData key into a
   **nested** `attributes` object before validation. `EntityForm` posts them
   flat and dotted; `entityInputSchema` expects `attributes` as a record.

---

## 1. Admin CMS — remaining screens

`src/app/admin/{layout,page}.tsx` exist and are done. Everything else under
`/admin` is outstanding. The dashboard already links to every path listed here,
so **the routes are fixed** — do not rename them.

Shared pieces that already exist and should not be rebuilt:
`src/components/admin/admin-chrome.tsx` (`FormBanner`, `AuditTrail`, `AuditEntry`,
`DangerZone`, `PublishBadge`, `AdminFigure`, `MetaRow`, `severityTone`,
`actionTone`, `actionLabel`), `src/components/admin/entity-form.tsx`,
`src/domain/attribute-fields.ts`, `src/lib/form-state.ts`.

### 1.1 Records — `src/app/admin/entities/`

`actions.ts` is written. Still needed:

- `page.tsx` — the work queue. `getAdminEntityList({page?, pageSize?, search?, entityType?})`
  returns `{ rows: Paginated<AdminEntityRow>, applied, typeOptions }` where
  `typeOptions` carries per-type counts. GET filter form on `q` and `type`.
  `EMPTY_ADMIN_ENTITY_PAGE` covers the degenerate case. Rows are newest-edited
  first, because the list is a queue and not a catalogue.
- `new/page.tsx` — reads `?type=` (default `MEMBER`). The type must **not** be a
  control inside the save form: it decides which specialized table the row writes
  to, so changing it mid-edit would orphan one row and leave another blank. Put a
  separate GET form at the top that reloads the page with a different `?type=`,
  with the 24 types in `<optgroup>`s from `CATEGORY_BY_ENTITY_TYPE` and
  `ENTITY_CATEGORY_LABELS` (`@/domain/entity-taxonomy`).
- `[id]/page.tsx` — `getEntityEditorPage({id})` returns `EntityEditorPage`, or
  `null` only when the id is genuinely missing → `notFound()`. Renders the editor,
  `MetaRow` facts, publish toggle, existing edges (link out to
  `/admin/relationships?entity=<id>` and `/admin/relationships/new?source=<id>`),
  `AuditTrail`, and a `DangerZone` delete carrying `expectedEdgeCount` as a hidden
  input. `deleteEntity` refuses when the live count differs — that is how the
  confirmation stays honest, so pass the number actually shown on screen.

### 1.2 Relationships — `src/app/admin/relationships/` + `src/components/admin/relationship-form.tsx`

The most important screen in the CMS: relationships *are* the domain (§10, §28).

- `getAdminRelationshipList({page?, pageSize?, search?, code?, entityId?})` →
  `{ rows: Paginated<AdminEdgeRow>, applied, typeOptions, scope }`.
- `getRelationshipEditorPage({id?, sourceEntityId?})` → `RelationshipEditorPage`
  (`defaults`, `types`, `sources`, `sourceEntity`, `targetEntity`, `history`).
- `searchEntityPicker(query, {entityTypes?, limit?})` → `EntityPickerOption[]`.
  Returns `[]` under two characters, and deliberately includes unpublished
  records — a curator has to be able to link a draft.
- Services: `createRelationship`, `updateRelationship`, `deleteRelationship`,
  `closeRelationship(id, endDate, actor)`.

**Endpoint pickers must not be a JS autocomplete.** Use the URL: the editor
accepts `?source=` and `?target=`, each endpoint gets a small GET form
(`sourceQuery` / `targetQuery`) whose results are links that set the parameter
and preserve the rest of the query string; the save form carries the chosen ids
as hidden inputs. Same URL-as-state discipline as the public browse pages, works
with scripting off, and every half-filled edit is linkable.

`closeRelationship` is the common case, not delete: setting `valid_to` is how the
archive records that something *ended*. Surface it at least as prominently.

Hide or disable the date inputs for a non-temporal type and say why in the hint —
dates on a non-temporal relationship are a category error, not a validation
nuisance. Show the type's `inverseName` so the edge can be read both ways before
saving. `validateEdge` inside the service enforces `allowedSourceTypes` /
`allowedTargetTypes` and refuses a retired type; surface those messages rather
than duplicating the rules as client-side gates.

### 1.3 Sources — `src/app/admin/sources/{page,actions}.tsx`

`getSources()` → `SourceView[]` with `usage: {entities, relationships, total}`.
`saveSource(id | null, input, actor)`, `removeSource(id, actor)` → `{id, unlinked}`.

One screen, not a list plus an editor: an add form, then each source as its own
pre-filled inline form with its usage counts. The FK is `onDelete: SetNull`, so
removal leaves records **unsourced** rather than deleting them, and
`MISSING_PROVENANCE` then reports them. Say that in the confirmation copy with the
real number — it is the honest consequence and it is not a cascade.

### 1.4 Audit log — `src/app/admin/audit/page.tsx`

`getAuditPage({page?, pageSize?, entityType?, action?, actorId?})` → `AuditPage`.
Render with `AuditEntry` / `AuditTrail`. GET filters on `entityType` and `action`.

Read-only by design: no delete, no edit, no export. A log a curator can edit
answers no question worth asking of it (§17) — put that in the docblock. Link each
entry to the record it changed where the `entityType` resolves; do not invent a
link for one that does not.

### 1.5 Data health — `src/app/admin/data-health/`

Written, unverified. See §0 above for the two specific things to check.

### 1.6 Games — `src/app/admin/games/{page,actions}.tsx`

`getGameDefinitions()` → `GameDefinitionView[]`, `saveGameDefinition(id | null, input, actor)`,
`setGameDefinitionActive(id, isActive, actor)`, and `getRelationshipTypes()` for
the required/enriching multi-selects.

Games are **deactivated, never deleted** — `GameSession.gameDefinition` points at
the row, so a delete orphans every past session. It is also how Daily Challenge
ships present but switched off (§26).

The point of the screen, and it should be visible in the copy: the scoring numbers
and the difficulty profile are **rows, not code** (§6) — Connect the Dots at
+10 / +20 / −5 is tunable without a deploy. And difficulty is *cognitive
complexity*, EASY direct fact through NIGHTMARE multi-hop; a harder tier asks a
harder question, it does **not** shorten the clock (§6.3). Put that warning next
to `timeLimitSec` in words.

There is no `DIFFICULTY_LABELS` and no `ANSWER_MODE_LABELS` in `@/domain/labels`.
Check `src/domain/difficulty.ts` first — it describes the tiers — and fall back to
`humanizeEnum` only for what it does not cover.

Print each relationship type's `usageCount` beside it: a required type with no
edges is exactly why a generator fails.

### 1.7 Mastery — `src/app/admin/mastery/{page,actions}.tsx`

`getMasteryConfig()` → `{statuses, weights, gaps, overlaps}`,
`saveMasteryStatus`, `removeMasteryStatus` (refuses removing the last active
band — that constrains the *count*, never the names or thresholds),
`saveDimensionWeight`, `masteryWeightOptions()`.

This screen is the whole reason §8.3 holds: **a status name is configuration and
is never hard-coded.** State that on the page.

`gaps` and `overlaps` are computed for a reason — a gap means a real player lands
on a score with no status at all, an overlap means the status they see depends on
row order. Render both as named problems with exact ranges. When there are none,
say the bands cover 0–100 exactly once.

Also render the weights as an editable scope × dimension matrix. A weight is why
"knows the members" and "knows the relationships" do not count equally, and why
the roll-up is weighted rather than averaged.

### 1.8 Settings — `src/app/admin/settings/`

- `page.tsx` + `actions.ts` — hub. Sub-pages get their own URLs rather than a tab
  widget, so each is linkable. Inline the key-value settings here via
  `getSettingsList()` / `saveSetting(input, actor)`, grouped by `group`. Show
  `getConfigSummary()` counts as `AdminFigure` links into each editor.
- `relationship-types/{page,actions}.tsx` — the vocabulary of the graph, and so
  the most consequential configuration screen there is. `getRelationshipTypes()`,
  `saveRelationshipType`, `retireRelationshipType`. The FK is `onDelete: Restrict`:
  a type in use is **retired**, not deleted, which keeps existing edges readable
  while stopping new ones. That is the difference between correcting a vocabulary
  and losing history. `allowedSourceTypes` / `allowedTargetTypes` are the
  constraint that stops a `MEMBER_OF` edge pointing at a song — native multiple
  selects, read back with `formData.getAll()`. `isQuizzable` is what makes a type
  available to the game engine at all. Use `RELATIONSHIP_SECTIONS` from
  `@/domain/relationship-types` as the page structure.
- `eras/{page,actions}.tsx` — `getAdminEras()` → `EraRow[]`, `saveEra`,
  `removeEra`. An era is the coarse label the Time Machine and timeline use to say
  where in the story a date falls; an era with no end is the current one.
- `users/{page,actions}.tsx` — `getUsers({page?, pageSize?, search?})`,
  `changeUserRole(input, actor)`, `roleOptions()`. This is where §19 either holds
  or does not: no email allowlist, no environment variable that grants admin at
  runtime, no hard-coded username. Authorization is the role column, read by
  `requireAdmin()`. `changeUserRole` refuses demoting the last admin and refuses
  self-demotion — mark the signed-in account so nobody wonders why. Warn when the
  admin count is 1, matching the dashboard's existing wording. Display nothing
  beyond what a role decision needs: no password material, no session tokens.

---

## 2. API v1 — `src/app/api/v1/**` (not started)

`src/app/api/` does not exist yet. Fourteen endpoints per §21:

```
/api/v1                        discovery document
/api/v1/entities               /api/v1/entities/{id}
/api/v1/members  /songs  /albums  /teams  /generations  /events
/api/v1/relationships          /api/v1/relationship-types
/api/v1/timeline               /api/v1/timeline/{date}
/api/v1/games                  /api/v1/games/{gameType}
/api/v1/mastery                /api/v1/mastery/statuses
```

Plus `src/app/api/v1/_lib/respond.ts` — the underscore keeps the folder
non-routable — holding the JSON envelope, error shapes, cache headers and query
parsing.

Keep handlers thin: parse, delegate, respond. The logic exists in
`src/server/queries/{explore,entity-detail,timeline,games,profile,home}.ts` and
`src/server/services/{knowledge-graph,mastery,search,time-machine}.ts`. Do not
import `prisma` in a route handler.

Security, and this is the reason it was scoped as its own job:

- These endpoints are **public and unauthenticated**. An unpublished record must
  never appear, and neither must a curator note or a data-health issue. Use the
  published-only query paths and state in a comment which guarantee you rely on.
- `/api/v1/mastery` is the one exception — per-user, so it needs a session via
  `getCurrentProfile()`, and 401 without one. **Never** accept a user id from the
  query string; derive it from the session only.
- `/api/v1/mastery/statuses` is public *configuration* (band names and
  thresholds), not user data. It also demonstrates §8.3.
- Every list endpoint clamps its own page size, so no caller can ask for the whole
  graph in one request.
- Validate every parameter. An unparseable date, unknown collection, unknown
  `gameType` or out-of-range page returns 400 with a message that says what was
  wrong — never a stack trace, never a database error string.

Envelopes: `{data, meta: {page, pageSize, total, pageCount}}` for lists, `{data}`
for one record, `{error: {code, message}}` for failures. Set `Cache-Control`
explicitly, `no-store` on the per-user route. A route reading cookies cannot be
statically cached — choose `dynamic` / `revalidate` deliberately and say why.

`/api/v1/timeline/{date}` is the interesting one: document that it answers
`valid_from <= date AND (valid_to IS NULL OR valid_to >= date)`, and that this is
precisely why there are no snapshot tables (§11).

---

## 3. Seed — `prisma/seed.ts` (not started)

`package.json` already has `db:seed`; check `prisma.config.ts` for the seed entry
and add it if missing. Almost all the data already exists as typed constants —
reuse them, do not retype them:

| Constant | Module |
| --- | --- |
| `RELATIONSHIP_TYPE_SEEDS`, `REL` | `src/domain/relationship-types.ts` |
| `MASTERY_STATUS_SEEDS`, `MASTERY_DIMENSION_WEIGHT_SEEDS` | `src/domain/mastery.ts` |
| `GAME_DEFINITION_SEEDS`, `gameDefinitionCode` | `src/domain/game-definitions.ts` |
| `ERA_SEEDS` | `src/domain/eras.ts` |
| difficulty profile numbers | `src/domain/difficulty.ts` |

Order: relationship types → eras, mastery statuses, dimension weights → game
definitions (difficulty numbers written into the **rows**; Daily Challenge seeded
with `isActive: false` per §26) → a demonstration graph → settings and the admin
promotion.

The demonstration graph must be small but *real* — a few generations, a few teams,
members across more than one generation, several songs, an album, an event or two,
all published, each with a summary, an `activeFrom`, a prominence and a `Source`
row it points at. Then the edges that make it a graph: `BELONGS_TO_GENERATION`,
`MEMBER_OF` with real windows, `CAPTAIN_OF` for a bounded term, `CENTER_OF`,
`SENBATSU_IN`, `PARTICIPATED_IN`, `GRADUATED_AT`. **At least one member must have
changed teams and at least one must have graduated** — otherwise the Time Machine
has nothing to show and Connect the Dots has no multi-hop path to find.

Admin promotion reads `process.env.SEED_ADMIN_EMAIL` and promotes that profile
*if the row exists*; when it is unset or unmatched, log a clear instruction to sign
up first and re-run. No fallback address, no hard-coded email anywhere in the file
(§19).

Idempotent throughout — upsert on the natural key (`code`, `slug`, `key`), never
delete-then-recreate, because a delete-first seed against a database with real
edits is data loss. Attribute writes through `recordChange` with `SYSTEM_ACTOR`
so seeded rows appear in the audit log as system-authored — the dashboard copy
already promises the operator exactly that.

Not a migration mechanism. §24: production runs `prisma migrate deploy`,
`prisma db push` is not used for production, the production database is not
edited by hand. Put that in the header docblock with the commands.

One thing to settle before writing: whether the `@/*` path alias resolves under
the `tsx` seed runner. If not certain, use relative imports — getting this wrong
makes the seed unrunnable.

---

## 4. Docs (not started)

- `README.md` — what this is (a knowledge graph of JKT48 history, with games
  generated *from* it; the graph is the product and everything else consumes it,
  §28), prerequisites, the exact setup sequence, every npm script, the
  secret-handling rules as rules, the §24 database workflow, a route map, what is
  V1 vs deferred, and Vercel deployment. State plainly that `SEED_ADMIN_EMAIL`
  only takes effect for an account that already exists, so the order is sign up →
  seed.
- `docs/ARCHITECTURE.md` — layering and what may import what; the data model with
  the two rules a future change is most likely to break (no FK from a member to a
  team or generation, §10; temporal validity filtered at query time, §11) plus the
  canonical as-of predicate and a worked example; the five-part game engine; mastery;
  auth and why middleware cannot make the admin check (Prisma does not run on the
  Edge, so middleware only sees whether a session cookie exists); data health and
  provenance; the design system and the §P5 exclusions; and a short "how to add an
  entity type / relationship type / game" with concrete file lists.

Everything claimed must be true of the code as written. A README that overstates
is worse than a short one.

---

## 5. Deferred to V1.1 (§26) — do not build now

Daily Challenge (seeded but inactive), achievements, leaderboards, richer question
generation, more relationship puzzles, advanced historical queries, improved Data
Health.

Bulk CSV/TSV/JSON import has since been built — `/admin/import`, on top of
`src/domain/bulk-import.ts` (parsing, column aliasing) and
`src/server/services/bulk-import.ts` (planning, dry run, commit). It routes every
row through the same `entity-admin` services as the single-record editors rather
than writing its own, which is why it is not the "staging pipeline" still listed
above: there is no separate ingestion path to reconcile.

What it deliberately does not do, if it is picked up again:

- **Delete or unpublish.** An import creates and updates; removing records stays a
  deliberate act in the record editor, where the cascade warning lives.
- **Wrap the batch in one transaction.** It composes independent audited services,
  so instead it refuses to write at all unless every row validates, and an operator
  who wants the good rows opts in explicitly.
- **Change a record's type.** A row naming an existing slug with a different type
  fails rather than migrating it between specialized tables.
- **Invent sources.** An unrecognised `provenance` cell fails its row rather than
  importing the record uncited.

---

## Appendix — resuming the parallel build

The fan-out that produced the files in §0 is recoverable. Its script is at:

```
~/.claude/projects/C--Users-developer-support2-source-repos-JKT48-Archive-Lab/
  ce5fec8a-abd1-4233-8381-939119fad91a/workflows/scripts/
  jkt48-archive-lab-finish-wf_c16303ba-4c2.js
```

Resume with `Workflow({scriptPath, resumeFromRunId: "wf_c16303ba-4c2"})`. Completed
agents return cached results; check `journal.jsonl` in the sibling `subagents/`
transcript directory before assuming a cached result is non-empty.

The ownership split there was one agent per bounded file group with **no shared
files**, which is what made it safe to run eleven at once. Keep that property if
you fan out again, and keep the rule that agents do not run `tsc`, `eslint` or
`npm` — eleven concurrent typechecks report each other's half-written files as
errors. Verify centrally, once, afterwards.
