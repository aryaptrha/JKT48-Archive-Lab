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
| `npm run db:seed` | Runs `prisma/seed.ts` via `tsx` |
| `npm run db:studio` | Opens Prisma Studio to inspect the database |

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

## 6. V1 Scope vs V1.1 Backlog

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
