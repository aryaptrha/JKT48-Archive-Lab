# JKT48 Archive Lab

> **A living interactive archive of JKT48 — where history becomes a knowledge graph, and knowledge becomes a game.**

JKT48 Archive Lab is not a wiki with a quiz attached. It is an interactive historical knowledge system where the **Knowledge Graph** is the core domain object, and the Encyclopedia, Game Engine, Time Machine, and Mastery Engine are all *consumers* of that graph (PRD §28).

---

## 1. Core Principles

- **P1 — Knowledge Must Be Interactive (§4.2):** Every entity entered into the archive has potential for *Learn → Test*.
- **P2 — Relationships Are Knowledge (§10):** There is no `member.team_id` or `generation_id`. Memberships, captaincies, center credits, and appearances are first-class `Relationship` rows with temporal validity (`valid_from` / `valid_to`).
- **P3 — Seamless Exploration & Testing (§3):** Exploration allows getting lost in the knowledge graph, with an immediate *Test Me* transition.
- **P4 — Cognitive Difficulty (§6.3):** Difficulty levels represent cognitive complexity (Easy = direct fact, Medium = intersecting multiple facts, Hard = relationship chain, Expert = indirect pivot, Nightmare = multi-hop deduction). Higher difficulty tiers **never** shorten time limits.
- **P5 — Archival Editorial Aesthetic (§22):** Editorial, archival, precise, and motion-aware UI. No SaaS dashboard tropes, generic AI cards, or purple gradient heroes.

---

## 2. Technology Stack

- **Framework:** Next.js 16 (App Router, React Server Components, Server Actions, Route Handlers)
- **Language:** TypeScript 5.9 (`strict`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`)
- **Database:** Supabase PostgreSQL
- **ORM & Migrations:** Prisma 7 (Code First workflow §24)
- **Styling:** Tailwind CSS v4 (`@tailwindcss/postcss`), custom archival semantic tokens
- **Auth:** Supabase Auth + Application Profile Roles (`USER`, `ADMIN` §19)
- **Deployment:** Vercel Native

---

## 3. Setup & Getting Started

### Prerequisites

- Node.js `>= 20.11`
- npm `>= 10`
- A Supabase project (PostgreSQL + Supabase Auth)

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/your-org/JKT48-Archive-Lab.git
cd JKT48-Archive-Lab
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Configure your credentials in `.env`:

```env
# Pooled connection (port 6543) used at runtime by the app
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"

# Direct connection (port 5432) used for migrations and seeding
DIRECT_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres"

# Supabase Auth
NEXT_PUBLIC_SUPABASE_URL="https://PROJECT_REF.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="ey..."
SUPABASE_SERVICE_ROLE_KEY="ey..."

NEXT_PUBLIC_SITE_URL="http://localhost:3000"

# Admin account bootstrap (see Admin section below)
SEED_ADMIN_EMAIL="admin@example.com"
```

### 3. Database Migration & Seeding (§24)

This project follows a strict **Code First** database workflow. Schema changes are made in `prisma/schema.prisma` and applied via Prisma Migrate:

```bash
# Generate Prisma Client
npm run db:generate

# Apply migrations to database
npm run db:migrate

# Seed initial vocabulary, eras, mastery bands, game definitions, and demo graph
npm run db:seed
```

> [!IMPORTANT]
> **Bootstrapping the first Administrator (§19):**
> `SEED_ADMIN_EMAIL` only promotes an account that **already exists**.
> 1. Start the app: `npm run dev`
> 2. Open `/login` and sign up with your email.
> 3. Set `SEED_ADMIN_EMAIL="your-email@example.com"` in `.env`.
> 4. Re-run `npm run db:seed`. Your account will be promoted to `ADMIN`.
> Subsequent admins are promoted through the UI at `/admin/settings/users`.

---

## 4. Available NPM Scripts

| Command | Action |
| --- | --- |
| `npm run dev` | Starts Next.js development server at `http://localhost:3000` |
| `npm run build` | Generates Prisma Client and creates an optimized production Next.js build |
| `npm run start` | Starts production server |
| `npm run verify` | Runs the full verification gate: `prisma validate` → `tsc --noEmit` → `eslint` |
| `npm run typecheck` | Typechecks with strict TypeScript settings |
| `npm run lint` | Runs ESLint 9 rules |
| `npm run db:validate` | Validates `prisma/schema.prisma` syntax and relations |
| `npm run db:migrate` | Runs Prisma development migrations (`prisma migrate dev`) |
| `npm run db:deploy` | Applies production migrations (`prisma migrate deploy`) |
| `npm run db:seed` | Runs `prisma db seed`, which runs `prisma/seed.ts` via `tsx` (entry point in `prisma.config.ts`) |
| `npm run db:reset` | Drops, re-migrates and re-seeds the database. **Development only** |
| `npm run db:studio` | Opens Prisma Studio to inspect the database |
| `npm run format` | Formats `ts,tsx,css,md,json` with Prettier |

---

## 5. Route Map

### Public
- `/` — Homepage & Knowledge Highlights
- `/explore` — Collection index (Members, Generations, Teams, Songs, Albums, Events, etc.)
- `/explore/[collection]` — Collection browse & search
- `/explore/[collection]/[slug]` — Entity detail with graph relationships & *Test Me* actions
- `/history/timeline` — Chronological transition timeline
- `/history/time-machine` — Historical date browser (`?date=YYYY-MM-DD`)
- `/games` — Game catalogue & lobbies
- `/games/[game]` — Game lobby & difficulty rungs
- `/games/play/[sessionId]` — Interactive round runner
- `/search` — Universal graph search

### Personal (`/me`)
- `/me` — Dashboard, recent game history & recommended practice
- `/me/mastery` — Generation mastery breakdown across 5 dimensions
- `/me/history` — Complete game session log

### Admin CMS (`/admin` — Authorized `ADMIN` Role Only)
- `/admin` — Health overview & curation dashboard
- `/admin/entities` — Entity record work queue & filters
- `/admin/entities/new` — Create record with specialized attributes
- `/admin/entities/[id]` — Edit entity, visibility toggle & danger zone
- `/admin/relationships` — Knowledge graph relationship browser
- `/admin/relationships/new` — Link entities via typed predicates
- `/admin/relationships/[id]` — Edit / close relationship validity
- `/admin/import` — Bulk CSV/TSV/JSON import, dry-run preview then commit
- `/admin/sources` — Data provenance citations
- `/admin/data-health` — 14 automated consistency & game-readiness checks
- `/admin/games` — Game definitions, difficulty & scoring rules
- `/admin/mastery` — Status bands, score ranges & dimension weights
- `/admin/audit` — Append-only mutation audit trail
- `/admin/settings` — System settings hub
- `/admin/settings/relationship-types` — Relationship vocabulary schema
- `/admin/settings/eras` — Historical chapters
- `/admin/settings/users` — User roles administration

### API v1 (`/api/v1`)
- `/api/v1` — API discovery document
- `/api/v1/entities` & `/api/v1/entities/{id}`
- `/api/v1/members`, `/songs`, `/albums`, `/teams`, `/generations`, `/events`
- `/api/v1/relationships` & `/api/v1/relationship-types`
- `/api/v1/timeline` & `/api/v1/timeline/{date}`
- `/api/v1/games` & `/api/v1/games/{gameType}`
- `/api/v1/mastery` (Session-authenticated) & `/api/v1/mastery/statuses` (Public config)

---

## 6. Bulk Import (`/admin/import`)

Curating one record at a time is the right shape for one record. It is the wrong
shape for a generation of sixteen members and the forty-odd edges that place them in
the graph — which is the actual unit of work when the archive gains a season.

`/admin/import` takes a pasted sheet or an uploaded file, shows a per-row dry run,
and only then commits. **Preview and commit run the same code path** — same parse,
same plan, same guardrails — because that is the only thing that makes a preview
worth reading.

### Two modes

| Mode | Writes | Required columns |
| --- | --- | --- |
| **Records** | `Entity` + its specialized attribute row | `canonicalName` |
| **Relationships** | `Relationship` edges with temporal validity | `sourceRef`, `typeCode`, `targetRef` |

Both accept **CSV, TSV and JSON**, up to **500 rows / ~1 MB** per batch. A downloadable
template header is generated per mode and record type.

> The ~1 MB cap sits under the Server Action body limit
> (`experimental.serverActions.bodySizeLimit: '2mb'` in `next.config.ts`). Raising
> `MAX_IMPORT_BYTES` without raising that limit turns a large upload into an opaque
> request failure rather than a readable error.

### Column handling

- Headers match loosely: `Canonical Name`, `canonical_name` and `canonicalName` are
  one column, and a field's editor label works as well as its schema name. Common
  aliases are accepted (`name`, `type`, `from`, `to`, `start`, `end`, …).
- Anything unmatched is **reported, never silently dropped**.
- An empty cell means *not provided*, never *clear this field*. A half-filled sheet
  is the normal case, so an update run cannot blank curated columns the operator
  simply left out.
- Record sheets have **no `team`, `generation` or `centerSong` column, and cannot**.
  Those are edges with validity windows (§10), imported in relationship mode. Such a
  header lands in the ignored-columns list where the operator can see it, rather than
  quietly re-introducing the foreign key the schema deliberately omits.
- Relationship endpoints are references, not cuids: a slug, a record id, or a name
  that slugifies to one.
- `provenance` matches the sources register by exact name or id. An unrecognised
  value **fails its row** rather than importing the record uncited.
- Dates are `YYYY-MM-DD`. A date on a non-temporal relationship type is refused
  rather than ignored — it is a category error, not a formatting nuisance (§11).

### Conflict policy

A row naming something already in the archive — a taken slug, or an edge with the
same identity — is resolved by the operator's explicit choice: **skip** it and keep
the existing row, **update** the existing row, or **fail** the row as an error.

### Guarantees, and the deliberate limits

Every row is written through `createEntity`, `updateEntity`, `createRelationship` or
`updateRelationship` — one row at a time, through the same audited services the
single-record editors use. That is slower than a bulk insert and it is the point:
slug resolution, the relationship guardrails and the audit entry all live in those
services, so an imported record is indistinguishable from a hand-curated one and
every row still gets its own line in its own history panel (§17). The batch itself is
additionally recorded as one `BULK_IMPORT` audit entry carrying the counts and a
capped manifest of what it applied.

Because it composes independent audited services, **the batch is not wrapped in a
single transaction.** The default is therefore to refuse the whole commit unless
every row validates, so the all-or-nothing case needs no rollback. An operator who
would rather take the good rows and fix the rest opts into partial application
explicitly, and is told exactly which lines were left behind.

Import deliberately does **not**:

- **delete or unpublish** anything — removal stays a deliberate act in the record
  editor, where the cascade warning with real numbers lives;
- **change an existing record's type** — a slug reused under a different type fails,
  rather than migrating a row between specialized attribute tables;
- **create sources** — provenance must already exist in the register.

---

## 7. V1 Scope vs V1.1 Backlog

### V1 Complete:
- Core Knowledge Graph & Generic Entity + 10 Specialized Attribute Tables
- Directional & Temporal validity model (`valid_from` / `valid_to`)
- Data provenance & citation tracking
- Encyclopedia & Collection Browsers
- 4 Data-driven Game Engines: Mystery Member, Connect the Dots, Memory Reconstruction, Time Machine Quiz
- 5 Cognitive Difficulty Rungs (Easy to Nightmare)
- Generation Mastery tracking across 5 knowledge dimensions
- Configurable mastery status bands (never hard-coded in code)
- Complete Curator Admin CMS (Entities, Relationships, Sources, Health, Audit, Settings)
- Bulk CSV/TSV/JSON import for records and relationships, with a dry-run preview
- 14 Public REST API v1 endpoints

### Deferred to V1.1 (§26):
- Daily Challenge (Seeded but inactive in V1)
- Public achievement system & leaderboards
- Automated web crawlers & staging pipeline
- Per-member mastery scoping

---

## 8. Deployment (Vercel)

No `vercel.json` is required — the defaults match this project.

- **Build command:** `npm run build` (`prisma generate && next build`). Prisma Client
  is generated at build time, so it is not committed.
- **Environment variables:** every key listed under §3 "Configure Environment Variables" must be set on the Vercel project.
  `DATABASE_URL` is the **pooled** Supabase connection (port 6543, `pgbouncer=true`)
  because serverless functions exhaust direct connections; `DIRECT_URL` is the direct
  connection (port 5432) and is used only by Migrate, which needs DDL and advisory
  locks PgBouncer's transaction mode cannot execute. See `prisma.config.ts`.
- **`SUPABASE_SERVICE_ROLE_KEY` is server-only.** It has no `NEXT_PUBLIC_` prefix for
  that reason — never add one (§28, §35).
- **`NEXT_PUBLIC_SITE_URL`** must be the deployed origin, or Supabase Auth email
  links will point at localhost.
- **Migrations:** run `npm run db:deploy` (`prisma migrate deploy`) against the
  production database as a release step. `prisma db push` is **not** a production
  migration mechanism, and the production database is not edited by hand (§24).
- **Images:** remote patterns are derived from `NEXT_PUBLIC_SUPABASE_URL` at config
  load. A malformed value is logged and leaves the pattern list empty rather than
  failing the build, so Supabase-hosted media would silently stop loading — check the
  build log for that warning if images disappear.
- **Seeding production** is not part of deploy. `npm run db:seed` is idempotent and
  upserts on natural keys, but run it deliberately.
