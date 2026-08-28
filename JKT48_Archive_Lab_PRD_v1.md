# JKT48 Archive Lab — PRD v1

**Status:** Draft v1  
**Product Type:** Public interactive knowledge archive + personal learning/game system  
**Primary Objective:** Membantu user membangun pemahaman JKT48 secara mendalam melalui eksplorasi, recall, dan relationship-based games.  
**Primary User:** Personal use  
**Secondary Users:** Public JKT48 fans / curious users

---

## 1. Product Vision

JKT48 Archive Lab bukan wiki yang diberi fitur quiz.

Ia adalah:

> **An interactive historical knowledge system for exploring, connecting, and mastering the history of JKT48.**

Empat layer utama:

```text
                         JKT48 KNOWLEDGE
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
           EXPLORE            RECALL           CONNECT
              │                 │                 │
         Encyclopedia       Memory Games      Graph Puzzles
              │                 │                 │
              └─────────────────┼─────────────────┘
                                │
                             MASTERY
                                │
                       Personal Progress
```

### Core Philosophy

> **Don't just show knowledge. Make the user interact with it.**

### North Star Principle

> **Every piece of knowledge should eventually become something the user can be asked to recall or connect.**

---

## 2. Product Principles

### P1 — Knowledge Must Be Interactive

Setiap entity yang masuk database harus punya potensi:

**Learn → Test**

Target entity mencakup:

- Member
- Generation
- Team
- Song
- Album
- Event
- Concert
- Theater Setlist
- Organization
- dan entity lain yang ditambahkan di masa depan

---

### P2 — Relationships Are Knowledge

Informasi tidak hanya diperlakukan sebagai field.

Contoh:

```text
Kinal
  │
  └── BELONGS_TO ──> Generation 1
```

Relationship tersebut harus dapat digunakan oleh:

- Encyclopedia
- Knowledge Graph
- Quiz
- Connect the Dots
- Time Machine
- Mastery
- Search
- Future AI features

---

### P3 — Exploration and Testing Must Be Seamless

User dapat membaca sebuah entity kemudian langsung menjalankan:

> **Test Me**

Contoh:

```text
Learn
  ↓
Entity Detail
  ↓
Explore Relationships
  ↓
Test Me
  ↓
Challenge
```

Game tidak boleh terasa seperti produk terpisah dari encyclopedia.

---

### P4 — Difficulty Determines Cognitive Complexity

Difficulty bukan hanya timer yang lebih pendek atau pilihan jawaban yang lebih sedikit.

```text
Easy
Direct fact
   ↓
Medium
Multiple facts
   ↓
Hard
Relationship
   ↓
Expert
Indirect relationship
   ↓
Nightmare
Multi-hop reasoning
```

---

### P5 — UI Should Feel Like an Archive, Not a SaaS Dashboard

Visual direction:

- Editorial
- Archival
- Precise
- Interactive
- Minimal
- Cinematic
- Historical
- Motion-aware

Avoid:

- Purple gradient hero
- Generic AI dashboard aesthetic
- Excessive rounded cards
- Frosted glass everywhere
- Emoji as primary UI icons
- Generic SaaS styling
- Generic AI-generated visual patterns

Reference sources for design exploration:

- beautifului.dev
- beui.dev
- rareui.com
- transitions.dev
- ui.shadcn.com

These are references rather than templates to copy directly.

---

# 3. Target User Experience

## 3.1 Explore

Primary experience:

```text
Discover
   ↓
Explore Entity
   ↓
Read Context
   ↓
Explore Relationships
   ↓
Discover Related Entity
   ↓
Continue Exploring
```

Contoh:

```text
Kinal
 ↓
Generation 1
 ↓
Team J
 ↓
Song X
 ↓
Center
 ↓
Event Y
 ↓
Member Z
```

Exploration harus memungkinkan user "tersesat" secara produktif di knowledge graph.

---

## 3.2 Recall

Target activity distribution:

| Activity | Target |
|---|---:|
| Explore | 50% |
| Recall | 40% |
| Reasoning / Connection | 10% |

Recall harus menyembunyikan sebagian knowledge dan meminta user mengingat kembali informasi tersebut.

---

## 3.3 Reasoning / Connection

User tidak selalu ditanya fakta secara langsung.

Contoh:

```text
Generation 3
↓
Team T
↓
Participated in Song X

Who is this member?
```

Tujuannya menguji kemampuan user memahami relationship, bukan sekadar menghafal isolated facts.

---

# 4. Encyclopedia

## 4.1 Entity Detail

Setiap entity memiliki halaman detail.

Contoh Member:

```text
KINAL
Generation 1

2011 ───────────────────────── 2018
       Career Timeline

TEAM
Team J
Team KIII

MUSIC
CENTER
Song A
Song B

SENBATSU
Song C
Song D
```

Halaman harus memiliki:

- Basic information
- Historical context
- Timeline
- Relationships
- Related entities
- Sources
- Learn → Test action

---

## 4.2 Universal Learn → Test

Setiap entity harus memiliki kemampuan:

```text
[ LEARN ]

    ↓

[ TEST ME ]
```

Contoh:

```text
Member → Test This Member
Generation → Test This Generation
Song → Test This Song
Album → Test This Album
Team → Test This Team
Event → Test This Event
```

Game engine harus dirancang agar dapat berkembang untuk entity baru tanpa perubahan besar pada database.

---

# 5. Game Modes

## 5.1 Mystery Member

Signature game untuk mengidentifikasi member berdasarkan clue.

### Easy

```text
MYSTERY MEMBER

Clue:
Generation 1

[ A ] [ B ] [ C ] [ D ]
```

### Medium

```text
Clue #1
Generation 2

Clue #2
Team KIII

Who is this?

[____________]
```

### Hard

```text
Clue:

Generation 3
↓
Team T
↓
Participated in Song X

Who is this?
```

### Expert

Menggunakan indirect relationship.

Contoh:

> She belonged to the same team as the center of Song X.

### Nightmare

Menggunakan multi-hop historical reasoning.

---

## 5.2 Connect the Dots

Signature graph-based game.

User mendapatkan node:

```text
Kinal
Generation 1
Team J
Song X
Center
```

User harus membangun graph:

```text
Generation 1
      │
      ▼
    Kinal
      │
      ├──── MEMBER_OF ────> Team J
      │
      └──── CENTER_OF ────> Song X
```

### Scoring

```text
Correct entity       +10
Correct relationship +20
Incorrect             -5
```

---

## 5.3 Connect the Dots — Difficulty Variants

### Easy

Graph relationship yang hilang sederhana.

```text
Kinal
 │
 └── [?]
```

User memilih relationship yang benar.

### Hard — Broken Graph

Sebagian graph dihancurkan:

```text
Kinal
 │
 ├── Generation 1
 │
 └── ????????
       │
       ▼
     Song X
```

User harus:

1. Identify missing entity
2. Identify missing relationship
3. Reconstruct graph

---

## 5.4 Memory Reconstruction

Profile entity sengaja dirusak.

```text
KINAL

Generation
[ ????? ]

Teams
[ ????? ]

Center
[ ????? ]

Senbatsu
[ ????? ]

Timeline
2011 ── ??????
2015 ── ??????
2018 ── ??????
```

User harus merekonstruksi informasi berdasarkan memory.

Result:

```text
Generation       ✓
Team             ✓
Center           ✕
Senbatsu         ✓
Timeline         ✕

Score
3 / 5
```

---

## 5.5 Time Machine

Time Machine adalah historical browser berbasis tanggal/era.

Contoh:

```text
2011 ─ 2012 ─ 2013 ─ 2014 ─ 2015 ─ ... ─ 2026
                    ▲
```

Untuk tanggal/era tertentu, sistem menampilkan snapshot berdasarkan temporal relationships:

- Active members
- Team roster
- Generations
- Songs
- Events
- Graduations
- Team changes
- Concerts
- Other historical facts

Time Machine juga dapat menjalankan:

> **Test Me on This Era**

---

# 6. Game Engine

Game harus bersifat **data-driven**.

Jangan membuat setiap game sepenuhnya hard-coded terhadap database.

Konsep:

```text
Game
 ├── Game Definition
 ├── Question Generator
 ├── Difficulty
 ├── Answer Evaluator
 └── Scoring
```

Contoh game definition:

```text
type:
MYSTERY_MEMBER

difficulty:
HARD

entity:
MEMBER

required_relationships:
GENERATION
MEMBER_OF
CENTER_OF

question_strategy:
INDIRECT_RELATIONSHIP
```

Knowledge graph menjadi source of truth untuk menghasilkan challenge.

---

# 7. Answer Evaluation

Untuk V1, sistem hanya membedakan:

```text
Correct
Incorrect
```

Tidak ada confidence rating untuk versi awal.

Future enhancement dapat menambahkan confidence-based learning apabila diperlukan.

---

# 8. Mastery System

## 8.1 Mastery Scope

V1 menggunakan:

> **Mastery per Generation**

Bukan mastery per member.

Contoh:

```text
GENERATION 1

Mastery
████████░░ 82%

Members
█████████░ 91%

History
███████░░░ 74%

Teams
████████░░ 83%

Songs
███████░░░ 71%

Relationships
████████░░ 84%
```

Implementasi awal dapat menggunakan weighted score.

---

## 8.2 Future Mastery Scopes

Architecture harus memungkinkan penambahan:

```text
Generation Mastery   ← V1
Member Mastery       ← Future
Song Mastery         ← Future
Album Mastery        ← Future
Team Mastery         ← Future
History Mastery      ← Future
```

Knowledge decay tidak termasuk requirement.

---

## 8.3 Mastery Status

Mastery status harus configurable melalui CRUD.

Default:

| Score | Status |
|---:|---|
| 0–19 | Unknown |
| 20–39 | Familiar |
| 40–59 | Recognized |
| 60–79 | Knowledgeable |
| 80–94 | Mastered |
| 95–100 | Expert |

Admin dapat:

- Add status
- Edit status
- Delete status
- Reorder status
- Adjust score boundaries

Status name tidak boleh hard-coded.

---

# 9. Knowledge Graph

## 9.1 Entity Taxonomy

### PERSON

- Member
- Staff / Creator — future

### GROUP

- JKT48
- Team
- Generation
- Sub-unit

### MUSIC

- Song
- Single
- Album
- Theater Setlist
- Unit

### EVENT

- Concert
- Theater Performance
- Election
- Audition
- Graduation
- Formation
- Major Event

### MEDIA

- TV Appearance
- Radio
- Movie
- Drama
- Photobook

### ORGANIZATION

- AKB48
- Sister Groups
- Management

Future entities may include:

- Location
- Venue
- Award
- Merchandise
- Social Media
- Video
- Interview

---

# 10. Relationship-First Domain Model

Relationship adalah first-class domain object.

Jangan mengandalkan model seperti:

```text
member.team_id
member.generation_id
member.center_song_id
```

Sebagai gantinya:

```text
Member
   │
   ├── BELONGS_TO ────────> Generation
   ├── MEMBER_OF ─────────> Team
   ├── CENTER_OF ─────────> Song
   ├── SENBATSU_IN ───────> Song
   ├── PARTICIPATED_IN ───> Event
   └── GRADUATED_AT ──────> Event
```

---

# 11. Temporal Validity

Historical relationships harus mendukung temporal validity.

Contoh:

```text
Kinal
 │
 ├── MEMBER_OF → Team J
 │    2011 → 2015
 │
 └── MEMBER_OF → Team KIII
      2015 → 2018
```

Conceptual query:

```sql
WHERE valid_from <= selected_date
AND (valid_to IS NULL OR valid_to >= selected_date)
```

Tidak perlu membuat database snapshot untuk setiap tahun.

Time Machine menggunakan temporal relationships untuk menghasilkan historical state.

---

# 12. Suggested Core Database Model

## Generic Entity

```text
entities
────────────
id
entity_type
canonical_name
slug
description
metadata
created_at
updated_at
```

## Specialized Entity Tables

```text
members
generations
teams
songs
albums
events
concerts
setlists
media
organizations
```

Specialized tables menyimpan attribute yang spesifik terhadap tipe entity.

---

## Relationship

```text
relationships
────────────
id
source_entity_id
relationship_type_id
target_entity_id

valid_from
valid_to

source_id
notes

created_at
updated_at
```

---

## Relationship Type

```text
relationship_types
──────────────────
id
code
name
description
is_directional
is_temporal
```

---

## Sources

```text
sources
───────
id
name
url
source_type
retrieved_at
notes
```

Setiap relationship/fact dapat menunjuk source.

---

# 13. Data Provenance

Karena data sebagian besar akan diinput manual dari sumber yang tersebar, provenance menjadi bagian penting.

Minimal data provenance:

```text
Source
Source URL
Source Type
Retrieved At
Admin Note
```

Contoh:

```text
Kinal
  │
  └── CENTER_OF ──> Song X

Source:
JKT48 Fandom

Source URL:
...

Notes:
...
```

Tidak ada approval workflow untuk V1.

Flow:

```text
Admin Input
     ↓
Save
     ↓
Production Immediately Updated
     ↓
Audit Logged
```

---

# 14. Admin Dashboard

Admin dashboard harus optimized untuk satu/few knowledgeable admins, bukan enterprise CMS.

UI boleh dense dan sedikit technical selama:

- cepat digunakan
- navigasinya jelas
- tidak membingungkan
- tidak kaku
- mendukung bulk/detail workflows secara praktis

## Main Navigation

```text
ADMIN

Dashboard
Entities
Relationships
Sources
Data Health
Games
Mastery
Audit Log
Settings
```

---

# 15. Entity Editor

```text
ENTITY
Kinal

Basic Information
────────────────────────

Name
Kinal

Type
Member

Generation
Generation 1

Birth Date
...

Description
...

[ SAVE ]
```

Relationship section:

```text
RELATIONSHIPS

MEMBER_OF
Team J
2011 → 2015

MEMBER_OF
Team KIII
2015 → 2018

CENTER_OF
Song X

SENBATSU_IN
Song Y

[ + ADD RELATIONSHIP ]
```

---

# 16. Relationship Builder

```text
SOURCE
[Kinal]

RELATIONSHIP
[MEMBER_OF]

TARGET
[Team J]

VALID FROM
[2011]

VALID TO
[2015]

SOURCE
[JKT48 Fandom]

NOTES
[...]

[CREATE]
```

Entity selection harus memiliki autocomplete/search.

---

# 17. Audit Log

Semua perubahan admin penting harus dicatat.

```text
AUDIT LOG

2026-08-28 09:14
Admin

Created relationship:
Kinal → MEMBER_OF → Team J

2026-08-28 09:18
Admin

Updated:
Song X
```

Minimal schema:

```text
actor
action
entity_type
entity_id
before
after
timestamp
```

`before` dan `after` dapat disimpan sebagai JSON snapshot.

---

# 18. Data Health

Dashboard:

```text
DATA HEALTH

ENTITIES
─────────────────
Members             320
Songs               180
Albums               20
Events               94

ISSUES
─────────────────
Missing relations     18
Incomplete entities   24
Broken references      3
Duplicate candidates   4

[VIEW ISSUES]
```

Potential checks:

- Missing required attributes
- Missing generation
- Missing team history
- Missing dates
- Orphan relationships
- Broken references
- Duplicate candidates
- Missing source/provenance where required

---

# 19. Authentication & Authorization

Public users:

```text
PUBLIC
├── Browse
├── Learn
├── Play Games
└── View Public Content
```

Authenticated users:

```text
USER
├── Login
├── Personal Mastery
├── Progress
└── Game History
```

Admin:

```text
ADMIN
├── Login
└── CMS
```

V1 authentication can use basic username/password authentication.

Authorization must use roles:

```text
USER
  └── role
       ├── USER
       └── ADMIN
```

Admin functionality must never depend on a hard-coded username.

---

# 20. Information Architecture

## Public

```text
/
├── Explore
│   ├── Members
│   ├── Generations
│   ├── Teams
│   ├── Songs
│   ├── Albums
│   ├── Events
│   └── Organizations
│
├── History
│   ├── Timeline
│   └── Time Machine
│
├── Games
│   ├── Mystery Member
│   ├── Connect the Dots
│   ├── Memory Reconstruction
│   └── Daily Challenge
│
└── Search
```

## Authenticated

```text
/me
├── Mastery
├── Progress
├── Game History
└── Achievements
```

## Admin

```text
/admin
├── Dashboard
├── Entities
├── Relationships
├── Sources
├── Data Health
├── Games
├── Mastery
├── Audit Log
└── Settings
```

---

# 21. API Concept

Backend dapat menggunakan domain-oriented API.

Contoh:

```text
/api/v1/entities
/api/v1/entities/{id}

/api/v1/members
/api/v1/songs
/api/v1/albums
/api/v1/teams
/api/v1/generations
/api/v1/events

/api/v1/relationships
/api/v1/relationship-types

/api/v1/timeline
/api/v1/timeline/{date}

/api/v1/games
/api/v1/games/{gameType}

/api/v1/mastery
/api/v1/mastery/statuses

/api/v1/sources

/api/v1/admin/entities
/api/v1/admin/relationships
/api/v1/admin/data-health
/api/v1/admin/audit-log
```

API tidak perlu menjadi 1:1 mapping terhadap database tables.

---

# 22. UI / Design Direction

## Design References

Gunakan sebagai reference untuk interaction dan component quality:

- beautifului.dev
- beui.dev
- rareui.com
- transitions.dev
- ui.shadcn.com

## Visual Keywords

```text
Editorial
Archival
Precise
Interactive
Dense when useful
Minimal
Cinematic
Historical
Motion-aware
```

## Typography

Jangan menjadikan Inter sebagai default visual identity secara otomatis.

Typography harus dipilih berdasarkan karakter archive/editorial yang ingin dibangun.

## Motion

Motion digunakan untuk:

- State transition
- Graph connection
- Timeline transition
- Learn → Test transition
- Correct / incorrect feedback
- Reveal/hide information
- Navigation transitions

Motion bukan sekadar decorative animation.

Semua interaction harus tetap memperhatikan accessibility dan reduced-motion preferences.

---

# 23. Core UX Loop

## Discovery Loop

```text
Explore
 ↓
Discover Entity
 ↓
Read
 ↓
Explore Relationship
 ↓
Discover Related Entity
 ↓
Explore Again
```

## Learning Loop

```text
Learn
 ↓
Test
 ↓
Correct / Incorrect
 ↓
Mastery Update
 ↓
Identify Weak Knowledge
 ↓
Practice
```

## Game Loop

```text
Choose Game
 ↓
Choose Difficulty
 ↓
Challenge
 ↓
Answer
 ↓
Correct / Incorrect
 ↓
Score
 ↓
Mastery Update
 ↓
Next Challenge
```

## Historical Loop

```text
Select Era / Date
 ↓
Time Machine
 ↓
Explore Historical Snapshot
 ↓
Discover Members / Songs / Events
 ↓
Test This Era
```

---

# 24. Success Criteria

Success bukan sekadar:

> Website selesai.

Produk berhasil apabila user dapat:

### Knowledge Coverage

- Explore generations
- Explore members
- Explore songs
- Explore teams
- Explore historical events
- Discover relationships

### Recall

- Identify members
- Recall generations
- Recall teams
- Recall songs
- Recall historical relationships

### Mastery

- See generation-level mastery
- Understand weak areas
- Improve mastery through repeated testing

### Historical Understanding

- Navigate JKT48 history
- Inspect historical states
- Understand changes over time
- Connect members, teams, songs, and events

---

# 25. V1 Scope

## Knowledge

- Member
- Generation
- Team
- Song
- Album
- Event
- Basic media
- Relationship system
- Temporal validity
- Sources

## Encyclopedia

- Entity browsing
- Search
- Filters
- Entity detail
- Related entities
- Learn → Test

## Games

- Mystery Member
- Connect the Dots
- Memory Reconstruction
- Difficulty levels
- Correct / incorrect
- Score

## Historical

- Timeline
- Time Machine
- Historical roster

## Personal

- Login
- Generation mastery
- Configurable mastery status
- Game history

## Admin

- Entity CRUD
- Relationship CRUD
- Source CRUD
- Mastery status CRUD
- Data Health
- Audit Log

---

# 26. V1.1 Backlog

Potential improvements after V1 stability:

```text
Daily Challenge
Achievements
Better game generation
More relationship puzzles
Advanced historical queries
Leaderboards
Improved Data Health
Bulk import
CSV/JSON import
```

---

# 27. Future / V2

Potential future capabilities:

```text
Member Mastery
Song Mastery
Album Mastery
Team Mastery

AI-generated questions
AI interviewer
Natural-language knowledge search

Voice quiz

Advanced graph exploration

Multiplayer
Battle

Public contribution

Source conflict resolution

Automated crawling
Crawler → staging → admin review

Historical event reconstruction

Personalized learning path
```

Potential advanced feature:

### Knowledge Graph Query Engine

User could ask:

> "Siapa saja member yang pernah berada di Team J dan menjadi senbatsu antara 2013–2016?"

atau:

> "Siapa yang pernah satu team dengan Melody dan kemudian menjadi center?"

System melakukan graph query terhadap knowledge base.

---

# 28. Architectural North Star

Keputusan architecture paling penting:

> **Jangan membuat game sebagai feature yang membaca database. Buat Knowledge Graph sebagai core domain, lalu Encyclopedia, Game Engine, Time Machine, dan Mastery menjadi consumer dari knowledge graph.**

```text
                    ┌──────────────┐
                    │ KNOWLEDGE    │
                    │ GRAPH        │
                    └──────┬───────┘
                           │
        ┌──────────────────┼─────────────────┐
        │                  │                 │
        ▼                  ▼                 ▼
  Encyclopedia          Game Engine      Time Machine
        │                  │                 │
        │                  ▼                 │
        │             Mastery Engine         │
        │                  │                 │
        └──────────────────┼─────────────────┘
                           ▼
                    User Experience
```

Ketika data baru masuk:

```text
Member X
   │
   └── CENTER_OF ──> Song Y
          │
        valid: Z
        source: ...
```

relationship tersebut otomatis menjadi potensial input untuk:

- Member profile
- Song profile
- Knowledge Graph
- Time Machine
- Mystery Member
- Connect the Dots
- Memory Reconstruction
- Mastery

Dengan demikian, penambahan knowledge tidak mengharuskan developer mengubah setiap feature secara manual.

---

# 29. Recommended Development Sequence

Development sebaiknya mengikuti urutan:

```text
1. Domain Model
   ↓
2. Entity + Relationship Taxonomy
   ↓
3. ERD v1
   ↓
4. Temporal Data Model
   ↓
5. Seed Data Strategy
   ↓
6. API Contract
   ↓
7. Knowledge Graph Service
   ↓
8. Encyclopedia
   ↓
9. Game Engine
   ↓
10. Games
   ↓
11. Time Machine
   ↓
12. Mastery
   ↓
13. Admin CMS
   ↓
14. Data Health + Audit
   ↓
15. UI Polish + Motion
```

Jangan memulai dengan game sebelum domain model dan relationship taxonomy cukup stabil.

---

# 30. Product Identity

**Name:** JKT48 Archive Lab

**Positioning:**

> **A living interactive archive of JKT48 — where history becomes a knowledge graph, and knowledge becomes a game.**

**Product character:**

```text
Archive
+
Encyclopedia
+
Knowledge Graph
+
Memory Trainer
+
Historical Explorer
+
Game
```

**The goal is not to make the biggest JKT48 database.**

The goal is to make the database **usable as a system for understanding and remembering JKT48.**


# 23. Technical Architecture & Technology Stack

## 23.1 Technology Stack

JKT48 Archive Lab menggunakan fullstack TypeScript architecture yang dioptimalkan untuk deployment pada Vercel.

| Layer | Technology | Role |
|---|---|---|
| Frontend | Next.js | Web application, routing, rendering, UI |
| Language | TypeScript | Primary development language |
| UI | React | Component architecture |
| UI Primitives | shadcn/ui | Customizable UI primitives |
| Backend | Next.js | Server-side application layer |
| API | Next.js Route Handlers | HTTP/API endpoints |
| Server Mutations | Next.js Server Actions | Server-side mutations where appropriate |
| Database | Supabase PostgreSQL | Managed relational database |
| ORM | Prisma ORM | Type-safe database access and migrations |
| Authentication | Supabase Auth | User/admin authentication |
| File Storage | Supabase Storage | Images and other uploaded media |
| Hosting | Vercel | Production hosting and deployment |
| Source Control | Git | Version control |
| CI/CD | Vercel + Git | Automated preview and production deployment |

### Architecture Overview

```text
                         VERCEL
                           │
                    ┌──────┴──────┐
                    │   Next.js   │
                    │ Fullstack   │
                    └──────┬──────┘
                           │
          ┌────────────────┼─────────────────┐
          │                │                 │
          ▼                ▼                 ▼
       React UI      Server Actions     Route Handlers
          │                │                 │
          └────────────────┼─────────────────┘
                           │
                           ▼
                       Prisma ORM
                           │
                           ▼
                  Supabase PostgreSQL
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
       Supabase Auth            Supabase Storage
```

---

## 23.2 Fullstack Next.js

Next.js menjadi application framework utama untuk frontend dan backend.

Architecture menggunakan:

- Next.js App Router
- React Server Components
- Client Components hanya ketika diperlukan untuk interactivity
- Server Actions untuk mutation workflows yang cocok
- Route Handlers untuk API endpoints/integrations
- TypeScript sebagai mandatory language

Tidak ada requirement untuk membuat backend application terpisah pada V1.

Contoh:

```text
app/
├── (public)/
├── games/
├── explore/
├── history/
├── me/
├── admin/
└── api/
```

Backend logic dapat berada di dalam Next.js selama boundary antara UI, application service, dan persistence tetap jelas.

---

# 24. Code First Policy

**JKT48 Archive Lab menggunakan Code First sebagai development standard.**

Database schema tidak dibuat secara manual sebagai primary development workflow.

### Source of Truth

Untuk database structure:

> **Prisma Schema adalah source of truth.**

Flow:

```text
Developer
    │
    ▼
schema.prisma
    │
    ▼
Prisma Migration
    │
    ▼
Supabase PostgreSQL
```

Bukan:

```text
Supabase Dashboard
       │
       ▼
Manual Table Creation
       │
       ▼
Prisma Introspection
```

### Rules

1. Semua perubahan schema harus dimulai dari code.
2. Prisma schema harus berada di Git.
3. Setiap schema change harus menghasilkan migration.
4. Migration harus berada di Git.
5. Production database tidak dimodifikasi secara manual sebagai development workflow.
6. `prisma db push` tidak digunakan sebagai production migration mechanism.
7. Production menggunakan `prisma migrate deploy`.
8. Prisma Client di-generate dari schema.
9. Schema review dilakukan melalui Pull Request.
10. Database migration merupakan bagian dari deployment lifecycle.

### Canonical Flow

```text
Change schema.prisma
        ↓
Review
        ↓
prisma migrate dev
        ↓
Migration generated
        ↓
Commit schema + migration
        ↓
CI/CD
        ↓
prisma migrate deploy
        ↓
Production Database
```

---

# 25. Database Architecture

Supabase digunakan sebagai managed PostgreSQL provider.

Prisma digunakan sebagai:

- ORM
- Type-safe database client
- Schema definition
- Migration system
- Relation mapping

Database tetap menggunakan relational modeling.

Knowledge Graph tidak berarti harus menggunakan graph database.

Core model:

```text
Supabase PostgreSQL
        │
        ▼
     Prisma
        │
        ├── Entity
        ├── Relationship
        ├── RelationshipType
        ├── Source
        ├── Member
        ├── Generation
        ├── Team
        ├── Song
        ├── Album
        ├── Event
        └── ...
```

Knowledge Graph direpresentasikan melalui relational entities + relationships.

---

# 26. Prisma Architecture

Prisma schema harus memodelkan:

```text
Generic Entity
        │
        ├── Specialized Entity Data
        │
        └── Relationships
                  │
                  ├── Relationship Type
                  ├── Temporal Validity
                  └── Source
```

Prisma digunakan di application/service layer, bukan dipanggil secara sembarangan dari React components.

Recommended conceptual structure:

```text
src/
├── app/
├── components/
├── features/
├── server/
│   ├── services/
│   ├── repositories/
│   └── queries/
├── lib/
│   ├── prisma/
│   ├── supabase/
│   └── auth/
└── types/
```

Tujuan struktur ini adalah menjaga:

```text
UI
 ↓
Application / Feature Logic
 ↓
Repository / Query Layer
 ↓
Prisma
 ↓
PostgreSQL
```

daripada:

```text
UI
 ↓
Prisma
```

di seluruh application.

---

# 27. Supabase Architecture

Supabase digunakan sebagai managed infrastructure layer.

## PostgreSQL

Digunakan untuk:

- Entity data
- Relationship data
- Historical data
- Game data
- Mastery
- User data/application profile
- Audit log
- Sources
- Configuration

## Supabase Auth

Digunakan untuk:

- User authentication
- Admin authentication
- Session management
- Identity management

Authorization tetap ditentukan oleh application roles.

```text
User
 │
 ▼
Supabase Auth
 │
 ▼
Application User Profile
 │
 ▼
Role
 ├── USER
 └── ADMIN
```

## Supabase Storage

Digunakan untuk:

- Member photos
- Event images
- Album artwork
- Other archive media
- Admin-uploaded assets

Binary media tidak disimpan langsung sebagai database blob kecuali ada alasan khusus.

---

# 28. Vercel Hosting Architecture

Application harus kompatibel dengan Vercel deployment model.

Primary deployment:

```text
Git Repository
      │
      ▼
    Vercel
      │
      ├── Preview Deployment
      │
      └── Production Deployment
```

### Deployment Environments

Minimal:

```text
Development
Preview
Production
```

Environment-specific configuration harus menggunakan environment variables.

Contoh:

```text
DATABASE_URL
DIRECT_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Secret values tidak boleh di-commit ke repository.

---

# 29. Serverless / Vercel Constraints

Application harus dirancang sebagai stateless web application.

Jangan bergantung pada:

- Persistent local filesystem
- In-memory state sebagai database
- Long-running Node.js process
- Persistent background process
- Self-hosted WebSocket server
- Local uploaded files sebagai permanent storage

Persistent data harus berada di external managed services:

```text
Database → Supabase PostgreSQL
Files    → Supabase Storage
Auth     → Supabase Auth
Hosting  → Vercel
```

---

# 30. Data Ingestion & Crawling Architecture

Data JKT48 dapat berasal dari:

- Manual admin input
- Fandom/wiki sources
- Wikipedia
- Other online sources
- Future automated crawler

V1 tidak mengharuskan crawler otomatis.

### V1

```text
Research
   ↓
Admin
   ↓
Entity / Relationship Editor
   ↓
Prisma
   ↓
Supabase
```

### Future Automated Ingestion

Crawler tidak boleh mengubah production database secara langsung.

Recommended future architecture:

```text
Crawler
   ↓
Raw / Staging Data
   ↓
Normalization
   ↓
Validation
   ↓
Admin Review
   ↓
Production Knowledge Graph
```

Hal ini menjaga kualitas data tanpa mengubah prinsip bahwa admin V1 dapat langsung memasukkan data.

---

# 31. Database Connection Strategy

Karena application berjalan pada Vercel/serverless environment, database connection management harus memperhatikan concurrent function execution.

Prisma production configuration harus menggunakan connection strategy yang sesuai dengan Supabase PostgreSQL dan pooling.

Conceptually:

```text
Vercel Functions
   │
   ├── Function A ──┐
   ├── Function B ──┤
   ├── Function C ──┼──> PostgreSQL Connection Pool
   └── Function D ──┘             │
                                  ▼
                         Supabase PostgreSQL
```

Application tidak boleh mengasumsikan bahwa satu process Node.js akan hidup terus dan mempertahankan satu persistent connection.

---

# 32. CI/CD

Deployment pipeline:

```text
Developer
   │
   ▼
Git Push / Pull Request
   │
   ▼
Vercel Preview
   │
   ├── Install dependencies
   ├── Type check
   ├── Lint
   ├── Prisma Generate
   ├── Tests
   └── Next.js Build
   │
   ▼
Review
   │
   ▼
Merge
   │
   ▼
Production Deployment
   │
   ├── Prisma Generate
   ├── Prisma Migrate Deploy
   └── Next.js Build
   │
   ▼
Vercel Production
```

Migration production harus dijalankan secara controlled dan idempotent menggunakan:

```bash
prisma migrate deploy
```

---

# 33. Development Environment

Developer local environment:

```text
Next.js
   │
   ├── Prisma
   │
   └── Supabase PostgreSQL
```

Development dapat menggunakan:

- Supabase hosted development project, atau
- Supabase local development stack

Pemilihan local vs hosted development environment dapat ditentukan pada implementation phase.

Yang wajib adalah:

> Development schema tetap berasal dari Prisma Code First workflow.

---

# 34. Observability & Error Handling

V1 harus memiliki basic production observability.

Minimal:

- Application error logging
- API error logging
- Database error logging
- Authentication error handling
- Game submission error handling
- Admin mutation error handling
- Deployment/build visibility

Future:

- Dedicated error tracking
- Performance monitoring
- Analytics
- Query performance monitoring
- User behavior analytics

---

# 35. Security Requirements

Minimum requirements:

- Authentication required for admin
- Role-based authorization
- Secrets stored as environment variables
- No service-role key exposed to browser
- Server-side authorization checks
- Input validation
- Server-side validation for admin mutations
- Database constraints where appropriate
- Audit logging for administrative mutations
- No direct client-side database mutation bypassing application authorization

Public encyclopedia data can be publicly readable.

Administrative write operations must never be exposed to unauthenticated users.

---

# 36. Architectural North Star

Technical stack:

```text
                 ┌──────────────────┐
                 │      VERCEL      │
                 │                  │
                 │     Next.js      │
                 │   Fullstack App  │
                 └────────┬─────────┘
                          │
                    Application
                       Layer
                          │
                     Prisma ORM
                          │
                          ▼
                ┌─────────────────────┐
                │ SUPABASE POSTGRESQL │
                │                     │
                │ Knowledge Graph     │
                │ Game Data           │
                │ Mastery             │
                │ Audit               │
                └─────────────────────┘
                          │
                ┌─────────┴─────────┐
                ▼                   ▼
          Supabase Auth       Supabase Storage
```

The architecture should remain:

> **Code First + Type Safe + Relational + Serverless-compatible + Vercel-native.**

The system should avoid premature infrastructure complexity such as a separate backend server, Kubernetes, dedicated graph database, message broker, or always-on worker service in V1.

Those components can be introduced only when an actual workload or architectural requirement justifies them.

