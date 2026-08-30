# Architecture Reference — JKT48 Archive Lab

> **The Knowledge Graph is the core product. Encyclopedia, Game Engine, Time Machine, and Mastery are consumers.** (PRD §28)

---

## 1. Application Layering & Import Boundaries

The architecture maintains strict separation between rendering, application service logic, and database persistence (PRD §26):

```
┌───────────────────────────────────────────────────────────┐
│                    Next.js App Router                     │
│  (RSC Pages, Client Components, Server Actions, Handlers)  │
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────┐
│                 Application Service Layer                 │
│       src/server/queries/*   |   src/server/services/*    │
│  (Validation, Authorization, Auditing, Temporal Joins)    │
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────┐
│                     Repository Layer                      │
│                src/server/repositories/*                  │
│               (Type-safe Prisma DB Access)                │
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────┐
│                   Supabase PostgreSQL                     │
└───────────────────────────────────────────────────────────┘
```

### Import Rules:
1. **Never import `prisma` in a page, Server Action, or Route Handler.** All database access goes through `src/server/queries/*` (for read models) or `src/server/services/*` (for audited mutations).
2. **Authorization is enforced at every boundary.** Layouts do not protect Server Actions: every action and page calls `await requireAdmin()` directly (PRD §35).
3. **Domain definitions (`src/domain/*`) contain pure types and validation schemas.** They have zero side effects and no database dependencies.

---

## 2. Core Domain Model & The Invariants

### 1. Relationship-First (§10)
There is no `member.team_id`, `member.generation_id`, or `member.center_song_id` anywhere in the schema. Cohort memberships, team tenures, captaincies, and music credits are represented as first-class `Relationship` rows:

```
[Entity: Devi Kinal Putri]
    │
    ├── BELONGS_TO_GENERATION ──> [Entity: Generasi 1]
    ├── MEMBER_OF (2012–2015) ───> [Entity: Team J]
    ├── CAPTAIN_OF (2012–2015) ──> [Entity: Team J]
    ├── MEMBER_OF (2015–2018) ───> [Entity: Team KIII]
    ├── CAPTAIN_OF (2015–2016) ──> [Entity: Team KIII]
    └── CENTER_OF ───────────────> [Entity: RIVER]
```

### 2. Temporal Validity (§11)
Historical states are not stored in snapshot tables. The archive evaluates temporal truth at query time using the canonical predicate:

```sql
WHERE (valid_from IS NULL OR valid_from <= :selected_date)
  AND (valid_to IS NULL OR valid_to >= :selected_date)
```

**Worked Example:**
To find the active roster of Team J on **2014-06-01**:
1. Query `Relationship` where `targetEntityId = TeamJ.id` and `relationshipType = 'MEMBER_OF'`.
2. Apply `valid_from <= 2014-06-01` (Kinal's `2012-12-23 <= 2014-06-01` is TRUE).
3. Apply `valid_to IS NULL OR valid_to >= 2014-06-01` (Kinal's `2015-07-31 >= 2014-06-01` is TRUE).
4. Result: Kinal is included in the 2014 Team J roster.

On **2016-06-01**, the same query returns FALSE for Team J (`valid_to = 2015-07-31 < 2016-06-01`), and TRUE for Team KIII (`valid_from = 2015-08-01 <= 2016-06-01` and `valid_to = 2018-06-30 >= 2016-06-01`).

---

## 3. The 5-Part Game Engine

Games are data-driven engines rather than hard-coded quiz pages (PRD §6):

```
┌─────────────────┐
│ Game Definition │ (Difficulty, Hops, Clues, Scoring, Allowed Edge Types)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Candidate Pool  │ (Finds subjects matching required relationship edges)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Generator       │ (Extracts clues, graph hops & generates distractors)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Evaluator       │ (Evaluates user answer: exact or graph path match)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Mastery Engine  │ (Updates user dimension counters and recomputes score)
└─────────────────┘
```

### Cognitive Difficulty Ladder (§P4, §6.3):
- **EASY:** Direct Fact (e.g. "What generation did Melody debut in?").
- **MEDIUM:** Intersecting Multiple Facts (e.g. "Generasi 2 member who was in Team KIII").
- **HARD:** Direct Relationship Chain (e.g. "Member who was Center of RIVER and Captain of Team J").
- **EXPERT:** Indirect Relationship with Pivot (e.g. "Member who shared a team with the Center of Heavy Rotation").
- **NIGHTMARE:** Multi-Hop Historical Inference (e.g. "Who was in Team KIII in 2016 after transferring from Team J?").

---

## 4. Mastery System (§8)

- **Scoping (V1):** Mastery is scoped per **Generation** (e.g. Generasi 1 Mastery, Generasi 2 Mastery).
- **Five Knowledge Dimensions:**
  1. `MEMBERS`: Cohort recognition and identity facts.
  2. `TEAMS`: Team rosters and movement history over time.
  3. `SONGS`: Song lineups, centers, and senbatsu credits.
  4. `HISTORY`: Dates, eras, and chronological events.
  5. `RELATIONSHIPS`: Graph multi-hop and indirect connections.
- **Configurable Status Bands (§8.3):**
  Status names (e.g. *Unknown*, *Familiar*, *Recognized*, *Knowledgeable*, *Mastered*, *Expert*) and score boundaries are database rows editable at `/admin/mastery`, **never string literals in code**.

---

## 5. Security & Authentication (§19, §35)

- **Identity:** Managed by Supabase Auth (`auth.users`).
- **Authorization:** Determined solely by `UserProfile.role` (`USER` | `ADMIN`).
- **No Email Allowlist:** No constant or environment variable grants admin access at runtime.
- **Edge Middleware Limitation:** Prisma cannot run in edge middleware. Therefore, middleware only checks whether a session cookie exists. Every admin page and Server Action enforces authorization on the server via `await requireAdmin()`.
- **Auditing (§17):** Every administrative mutation creates an append-only `AuditEntry` with before/after state diffs.

---

## 6. Bulk Import (§14, §26)

`/admin/import` is a faster route to the existing mutation services, **not a second
write path into the database.** It is worth understanding as a layering example,
because it is the one feature with an obvious temptation to bypass the stack.

```
┌──────────────────────────────────────────────────────────────┐
│ src/domain/bulk-import.ts                       (pure)       │
│ text → candidate rows; loose header matching; ignored-column │
│ reporting. Decides nothing about validity, touches no DB.    │
└─────────────────────────────┬────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ src/server/services/bulk-import.ts                           │
│ plan → (dry run | commit). One implementation, one flag.     │
└─────────────────────────────┬────────────────────────────────┘
                              │  row by row
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ services/entity-admin.ts                                     │
│ createEntity · updateEntity · createRelationship ·           │
│ updateRelationship — validation, guardrails, audit           │
└──────────────────────────────────────────────────────────────┘
```

Three decisions carry the design:

1. **The parser is pure and decides nothing.** The rules for a valid record already
   exist once, in `src/domain/validation.ts`, and are enforced once, in
   `entity-admin`. An importer that re-implemented them would be a second, quietly
   diverging definition of what the archive accepts.
2. **Preview and commit are the same code path with a flag.** `previewBulkImport`
   and `commitBulkImport` both call `runImport`; the only difference is whether an
   `Actor` is passed. A dry run that diverged from the write would be worse than
   offering no dry run, because an operator would trust it. This is also why
   `checkEntityInput` and `checkEdgeCompatibility` are *named exports* of
   `entity-admin` rather than inline code at the top of each mutation — the preview
   calls exactly what the commit will.
3. **Rows are written one at a time through the audited services**, never through
   `createMany`. Those services own slug resolution, the relationship guardrails and
   the `AuditEntry`, so an imported record is indistinguishable from a hand-curated
   one and each row keeps its own history (§17).

**Consequence — there is no batch transaction.** Composing independent audited
services means there is nothing to roll back across. So the default is to refuse the
entire commit unless every row validates, and partial application is an explicit
operator opt-in that reports which lines were dropped. The batch also writes one
`AuditAction.BULK_IMPORT` entry with the counts and a capped manifest, so a batch can
be identified later without storing a second copy of the sheet in the log.

**What it will not do**, and these are invariants rather than gaps: no delete or
unpublish; no changing an existing record's type between specialized tables; no
inventing a `Source`. And record sheets have no `team` / `generation` / `centerSong`
column — such a header is *reported as ignored*, because accepting one would
re-introduce the foreign key §10 forbids.

---

## 7. How to Extend the Archive

### Adding a New Entity Type:
1. Add type to `EntityType` enum in `prisma/schema.prisma`.
2. Add category and label mapping in `src/domain/entity-taxonomy.ts`.
3. If type requires specialized attributes, add 1:1 table in `schema.prisma` and fields in `src/domain/attribute-fields.ts`.
4. Run `npm run db:migrate`.

> The bulk importer needs no change for a new type. `importColumnSpecs()` builds its
> columns from `attributeFieldsFor(table)`, so the record editor and the import
> template stay in step by construction — a field added in one appears in the other.
> Only a *base* column change (`ENTITY_COLUMNS`) touches `src/domain/bulk-import.ts`.

### Adding a New Relationship Type:
1. Add constant to `REL` in `src/domain/relationship-types.ts`.
2. Add seed entry in `RELATIONSHIP_TYPE_SEEDS`.
3. Seed or create via `/admin/settings/relationship-types`.

### Adding a New Game Mode:
1. Add game type to `GameType` enum in `prisma/schema.prisma`.
2. Register slug and copy in `src/domain/game-definitions.ts`.
3. Implement question generator in `src/server/services/game-engine/`.
4. Create game definitions via `/admin/games` or `prisma/seed.ts`.
