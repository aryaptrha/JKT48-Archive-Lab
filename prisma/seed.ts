import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import {
  AlbumType,
  EntityCategory,
  EntityType,
  EventType,
  GameType,
  MemberStatus,
  SongType,
  SourceType,
  UserRole,
} from '../src/generated/prisma/enums'

import { ERA_SEEDS } from '../src/domain/eras'
import { GAME_DEFINITION_SEEDS } from '../src/domain/game-definitions'
import {
  MASTERY_DIMENSION_WEIGHT_SEEDS,
  MASTERY_STATUS_SEEDS,
} from '../src/domain/mastery'
import { REL, RELATIONSHIP_TYPE_SEEDS } from '../src/domain/relationship-types'

/**
 * JKT48 Archive Lab — Seed Database Script (PRD §24, §28, §33).
 *
 * Seed is idempotent throughout — upserts on natural keys (`code`, `slug`, `key`).
 * Demonstrates a real historical subgraph with multiple generations, teams, songs,
 * temporal team transitions, and graduations.
 *
 * Promotes `SEED_ADMIN_EMAIL` to ADMIN if that account already exists (§19).
 */

const connectionUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL
if (!connectionUrl) {
  throw new Error('DIRECT_URL or DATABASE_URL is required to run seed.')
}

const adapter = new PrismaPg({ connectionString: connectionUrl, max: 1 })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Starting JKT48 Archive Lab database seed...\n')

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Sources (Data Provenance §13)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('📖 Seeding Sources...')
  const sourcesData = [
    {
      name: 'JKT48 Official Website',
      url: 'https://jkt48.com',
      sourceType: SourceType.OFFICIAL_SITE,
      notes: 'Primary official portal and announcements.',
    },
    {
      name: 'Stage48 Wiki',
      url: 'http://stage48.net/wiki/index.php/JKT48',
      sourceType: SourceType.FANDOM,
      notes: 'Historical 48Group encyclopedia and setlist records.',
    },
    {
      name: 'JKT48 Fandom Wiki',
      url: 'https://jkt48.fandom.com',
      sourceType: SourceType.FANDOM,
      notes: 'Community-maintained member timelines and discography.',
    },
    {
      name: 'Wikipedia Indonesia — JKT48',
      url: 'https://id.wikipedia.org/wiki/JKT48',
      sourceType: SourceType.WIKIPEDIA,
      notes: 'General overview and discography summaries.',
    },
  ]

  const sources: Record<string, string> = {}
  for (const src of sourcesData) {
    const existing = await prisma.source.findFirst({ where: { name: src.name } })
    if (existing) {
      sources[src.name] = existing.id
    } else {
      const created = await prisma.source.create({ data: src })
      sources[src.name] = created.id
    }
  }
  const defaultSourceId = sources['JKT48 Official Website']

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Relationship Types (Vocabulary §10)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('🔗 Seeding Relationship Types...')
  const relationshipTypes: Record<string, string> = {}
  for (const seed of RELATIONSHIP_TYPE_SEEDS) {
    const row = await prisma.relationshipType.upsert({
      where: { code: seed.code },
      update: {
        name: seed.name,
        inverseName: seed.inverseName,
        description: seed.description,
        isDirectional: seed.isDirectional,
        isTemporal: seed.isTemporal,
        allowedSourceTypes: seed.allowedSourceTypes,
        allowedTargetTypes: seed.allowedTargetTypes,
        isQuizzable: seed.isQuizzable,
        displayOrder: seed.displayOrder,
      },
      create: {
        code: seed.code,
        name: seed.name,
        inverseName: seed.inverseName,
        description: seed.description,
        isDirectional: seed.isDirectional,
        isTemporal: seed.isTemporal,
        allowedSourceTypes: seed.allowedSourceTypes,
        allowedTargetTypes: seed.allowedTargetTypes,
        isQuizzable: seed.isQuizzable,
        displayOrder: seed.displayOrder,
      },
    })
    relationshipTypes[seed.code] = row.id
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Eras (Timeline & Time Machine Chapters §4.3)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('⏳ Seeding Historical Eras...')
  for (const seed of ERA_SEEDS) {
    await prisma.era.upsert({
      where: { slug: seed.slug },
      update: {
        name: seed.name,
        startDate: new Date(seed.startDate),
        endDate: seed.endDate ? new Date(seed.endDate) : null,
        description: seed.description,
        displayOrder: seed.displayOrder,
      },
      create: {
        name: seed.name,
        slug: seed.slug,
        startDate: new Date(seed.startDate),
        endDate: seed.endDate ? new Date(seed.endDate) : null,
        description: seed.description,
        displayOrder: seed.displayOrder,
      },
    })
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Mastery Statuses & Dimension Weights (§8)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('🏆 Seeding Mastery Status Bands & Dimension Weights...')
  for (const seed of MASTERY_STATUS_SEEDS) {
    await prisma.masteryStatus.upsert({
      where: { slug: seed.slug },
      update: {
        name: seed.name,
        minScore: seed.minScore,
        maxScore: seed.maxScore,
        colorHex: seed.colorHex,
        description: seed.description,
        displayOrder: seed.displayOrder,
        isActive: true,
      },
      create: {
        name: seed.name,
        slug: seed.slug,
        minScore: seed.minScore,
        maxScore: seed.maxScore,
        colorHex: seed.colorHex,
        description: seed.description,
        displayOrder: seed.displayOrder,
        isActive: true,
      },
    })
  }

  for (const seed of MASTERY_DIMENSION_WEIGHT_SEEDS) {
    await prisma.masteryDimensionWeight.upsert({
      where: {
        scope_dimension: {
          scope: seed.scope,
          dimension: seed.dimension,
        },
      },
      update: {
        weight: seed.weight,
      },
      create: {
        scope: seed.scope,
        dimension: seed.dimension,
        weight: seed.weight,
      },
    })
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Game Definitions (§6, §26)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('🎮 Seeding Game Definitions...')
  for (const seed of GAME_DEFINITION_SEEDS) {
    const requiredTypeIds = seed.requiredRelationshipCodes
      .map((code) => relationshipTypes[code])
      .filter((id): id is string => typeof id === 'string')

    const optionalTypeIds = seed.optionalRelationshipCodes
      .map((code) => relationshipTypes[code])
      .filter((id): id is string => typeof id === 'string' && !requiredTypeIds.includes(id))

    const links = [
      ...requiredTypeIds.map((id) => ({ relationshipTypeId: id, isRequired: true })),
      ...optionalTypeIds.map((id) => ({ relationshipTypeId: id, isRequired: false })),
    ]

    const isDailyChallenge = seed.gameType === GameType.DAILY_CHALLENGE
    const isActive = isDailyChallenge ? false : seed.isActive

    const row = await prisma.gameDefinition.upsert({
      where: { code: seed.code },
      update: {
        name: seed.name,
        description: seed.description,
        gameType: seed.gameType,
        difficulty: seed.difficulty,
        targetEntityType: seed.targetEntityType,
        questionStrategy: seed.questionStrategy,
        answerMode: seed.answerMode,
        clueCount: seed.clueCount,
        optionCount: seed.optionCount,
        hopCount: seed.hopCount,
        roundCount: seed.roundCount,
        timeLimitSec: seed.timeLimitSec,
        pointsCorrect: seed.pointsCorrect,
        pointsRelationshipCorrect: seed.pointsRelationshipCorrect,
        pointsIncorrect: seed.pointsIncorrect,
        isActive,
        displayOrder: seed.displayOrder,
      },
      create: {
        code: seed.code,
        name: seed.name,
        description: seed.description,
        gameType: seed.gameType,
        difficulty: seed.difficulty,
        targetEntityType: seed.targetEntityType,
        questionStrategy: seed.questionStrategy,
        answerMode: seed.answerMode,
        clueCount: seed.clueCount,
        optionCount: seed.optionCount,
        hopCount: seed.hopCount,
        roundCount: seed.roundCount,
        timeLimitSec: seed.timeLimitSec,
        pointsCorrect: seed.pointsCorrect,
        pointsRelationshipCorrect: seed.pointsRelationshipCorrect,
        pointsIncorrect: seed.pointsIncorrect,
        isActive,
        displayOrder: seed.displayOrder,
      },
    })

    await prisma.gameDefinitionRelationshipType.deleteMany({
      where: { gameDefinitionId: row.id },
    })

    if (links.length > 0) {
      await prisma.gameDefinitionRelationshipType.createMany({
        data: links.map((link) => ({
          gameDefinitionId: row.id,
          relationshipTypeId: link.relationshipTypeId,
          isRequired: link.isRequired,
        })),
      })
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Demonstration Knowledge Graph (§10, §11, §28)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('🏛️ Seeding Demonstration Knowledge Graph...')

  const entities: Record<string, string> = {}

  // Helper to upsert an entity and its specialized table
  async function upsertEntity(params: {
    slug: string
    canonicalName: string
    entityType: EntityType
    category: EntityCategory
    summary: string
    activeFrom?: string
    activeTo?: string
    prominence: number
    specialized: {
      generation?: { number: number; initialMemberCount?: number }
      team?: { code: string; colorHex?: string }
      member?: { stageName: string; fullName?: string; birthDate?: string; status: MemberStatus; bloodType?: string }
      song?: { title: string; songType?: SongType; singleNumber?: number }
      album?: { title: string; albumType?: AlbumType; trackCount?: number }
      event?: { title: string; eventType?: EventType; venue?: string; startDate?: string }
    }
  }) {
    const { slug, canonicalName, entityType, category, summary, activeFrom, activeTo, prominence, specialized } = params

    const entity = await prisma.entity.upsert({
      where: { slug },
      update: {
        canonicalName,
        entityType,
        category,
        summary,
        activeFrom: activeFrom ? new Date(activeFrom) : null,
        activeTo: activeTo ? new Date(activeTo) : null,
        prominence,
        isPublished: true,
        provenanceId: defaultSourceId,
      },
      create: {
        slug,
        canonicalName,
        entityType,
        category,
        summary,
        activeFrom: activeFrom ? new Date(activeFrom) : null,
        activeTo: activeTo ? new Date(activeTo) : null,
        prominence,
        isPublished: true,
        provenanceId: defaultSourceId,
      },
    })

    entities[slug] = entity.id

    if (specialized.generation) {
      await prisma.generation.upsert({
        where: { entityId: entity.id },
        update: specialized.generation,
        create: { entityId: entity.id, ...specialized.generation },
      })
    }
    if (specialized.team) {
      await prisma.team.upsert({
        where: { entityId: entity.id },
        update: specialized.team,
        create: { entityId: entity.id, ...specialized.team },
      })
    }
    if (specialized.member) {
      const birthDate = specialized.member.birthDate ? new Date(specialized.member.birthDate) : undefined
      await prisma.member.upsert({
        where: { entityId: entity.id },
        update: { ...specialized.member, birthDate },
        create: { entityId: entity.id, ...specialized.member, birthDate },
      })
    }
    if (specialized.song) {
      await prisma.song.upsert({
        where: { entityId: entity.id },
        update: specialized.song,
        create: { entityId: entity.id, ...specialized.song },
      })
    }
    if (specialized.album) {
      await prisma.album.upsert({
        where: { entityId: entity.id },
        update: specialized.album,
        create: { entityId: entity.id, ...specialized.album },
      })
    }
    if (specialized.event) {
      const startDate = specialized.event.startDate ? new Date(specialized.event.startDate) : undefined
      await prisma.event.upsert({
        where: { entityId: entity.id },
        update: { ...specialized.event, startDate },
        create: { entityId: entity.id, ...specialized.event, startDate },
      })
    }

    return entity.id
  }

  // Generations
  await upsertEntity({
    slug: 'generasi-1',
    canonicalName: 'Generasi 1',
    entityType: EntityType.GENERATION,
    category: EntityCategory.GROUP,
    summary: 'The pioneer cohort of JKT48, debuted on 2 November 2011.',
    activeFrom: '2011-11-02',
    prominence: 98,
    specialized: { generation: { number: 1, initialMemberCount: 28 } },
  })

  await upsertEntity({
    slug: 'generasi-2',
    canonicalName: 'Generasi 2',
    entityType: EntityType.GENERATION,
    category: EntityCategory.GROUP,
    summary: 'The second generation cohort, debuted on 3 November 2012.',
    activeFrom: '2012-11-03',
    prominence: 90,
    specialized: { generation: { number: 2, initialMemberCount: 31 } },
  })

  await upsertEntity({
    slug: 'generasi-3',
    canonicalName: 'Generasi 3',
    entityType: EntityType.GENERATION,
    category: EntityCategory.GROUP,
    summary: 'The third generation cohort, debuted on 15 March 2014.',
    activeFrom: '2014-03-15',
    prominence: 92,
    specialized: { generation: { number: 3, initialMemberCount: 32 } },
  })

  // Teams
  await upsertEntity({
    slug: 'team-j',
    canonicalName: 'Team J',
    entityType: EntityType.TEAM,
    category: EntityCategory.GROUP,
    summary: 'The first team of JKT48, formed on 23 December 2012.',
    activeFrom: '2012-12-23',
    activeTo: '2021-03-13',
    prominence: 95,
    specialized: { team: { code: 'J', colorHex: '#E53E3E' } },
  })

  await upsertEntity({
    slug: 'team-kiii',
    canonicalName: 'Team KIII',
    entityType: EntityType.TEAM,
    category: EntityCategory.GROUP,
    summary: 'The second team of JKT48, formed on 25 June 2013.',
    activeFrom: '2013-06-25',
    activeTo: '2021-03-13',
    prominence: 92,
    specialized: { team: { code: 'KIII', colorHex: '#DD6B20' } },
  })

  await upsertEntity({
    slug: 'team-t',
    canonicalName: 'Team T',
    entityType: EntityType.TEAM,
    category: EntityCategory.GROUP,
    summary: 'The third team of JKT48, formed on 24 January 2015.',
    activeFrom: '2015-01-24',
    activeTo: '2021-03-13',
    prominence: 88,
    specialized: { team: { code: 'T', colorHex: '#D69E2E' } },
  })

  // Members
  await upsertEntity({
    slug: 'melody-nurramdhani-laksani',
    canonicalName: 'Melody Nurramdhani Laksani',
    entityType: EntityType.MEMBER,
    category: EntityCategory.PERSON,
    summary: 'Founding center and General Manager of JKT48.',
    activeFrom: '2011-11-02',
    activeTo: '2018-03-31',
    prominence: 98,
    specialized: {
      member: {
        stageName: 'Melody',
        fullName: 'Melody Nurramdhani Laksani',
        status: MemberStatus.GRADUATED,
        birthDate: '1992-03-24',
        bloodType: 'O',
      },
    },
  })

  await upsertEntity({
    slug: 'devi-kinal-putri',
    canonicalName: 'Devi Kinal Putri',
    entityType: EntityType.MEMBER,
    category: EntityCategory.PERSON,
    summary: 'First captain of Team J and later captain of Team KIII.',
    activeFrom: '2011-11-02',
    activeTo: '2018-06-30',
    prominence: 92,
    specialized: {
      member: {
        stageName: 'Kinal',
        fullName: 'Devi Kinal Putri',
        status: MemberStatus.GRADUATED,
        birthDate: '1996-01-02',
        bloodType: 'A',
      },
    },
  })

  await upsertEntity({
    slug: 'shania-junianatha',
    canonicalName: 'Shania Junianatha',
    entityType: EntityType.MEMBER,
    category: EntityCategory.PERSON,
    summary: 'Longtime pillar of Team J and former General Captain of JKT48.',
    activeFrom: '2011-11-02',
    activeTo: '2019-04-28',
    prominence: 88,
    specialized: {
      member: {
        stageName: 'Shania',
        fullName: 'Shania Junianatha',
        status: MemberStatus.GRADUATED,
        birthDate: '1998-06-27',
        bloodType: 'B',
      },
    },
  })

  await upsertEntity({
    slug: 'nabilah-ratna-ayu-azalia',
    canonicalName: 'Nabilah Ratna Ayu Azalia',
    entityType: EntityType.MEMBER,
    category: EntityCategory.PERSON,
    summary: 'Youngest pioneer of Generasi 1 and prominent media representative.',
    activeFrom: '2011-11-02',
    activeTo: '2017-10-31',
    prominence: 94,
    specialized: {
      member: {
        stageName: 'Nabilah',
        fullName: 'Nabilah Ratna Ayu Azalia',
        status: MemberStatus.GRADUATED,
        birthDate: '1999-11-11',
        bloodType: 'B',
      },
    },
  })

  await upsertEntity({
    slug: 'cindy-yuvia',
    canonicalName: 'Cindy Yuvia',
    entityType: EntityType.MEMBER,
    category: EntityCategory.PERSON,
    summary: 'Center of Team KIII who later transferred to Team J.',
    activeFrom: '2012-11-03',
    activeTo: '2019-07-27',
    prominence: 90,
    specialized: {
      member: {
        stageName: 'Yupi',
        fullName: 'Cindy Yuvia',
        status: MemberStatus.GRADUATED,
        birthDate: '1998-01-14',
        bloodType: 'O',
      },
    },
  })

  await upsertEntity({
    slug: 'shani-indira-natio',
    canonicalName: 'Shani Indira Natio',
    entityType: EntityType.MEMBER,
    category: EntityCategory.PERSON,
    summary: 'Generasi 3 center, two-time SSK winner and former captain.',
    activeFrom: '2014-03-15',
    activeTo: '2024-05-05',
    prominence: 96,
    specialized: {
      member: {
        stageName: 'Shani',
        fullName: 'Shani Indira Natio',
        status: MemberStatus.GRADUATED,
        birthDate: '1998-10-05',
        bloodType: 'B',
      },
    },
  })

  await upsertEntity({
    slug: 'shania-gracia',
    canonicalName: 'Shania Gracia',
    entityType: EntityType.MEMBER,
    category: EntityCategory.PERSON,
    summary: 'Generasi 3 member and prominent leader of JKT48.',
    activeFrom: '2014-03-15',
    prominence: 94,
    specialized: {
      member: {
        stageName: 'Gracia',
        fullName: 'Shania Gracia',
        status: MemberStatus.ACTIVE,
        birthDate: '1999-08-31',
        bloodType: 'A',
      },
    },
  })

  // Songs & Albums
  await upsertEntity({
    slug: 'heavy-rotation',
    canonicalName: 'Heavy Rotation',
    entityType: EntityType.SONG,
    category: EntityCategory.MUSIC,
    summary: 'The signature introductory title track of JKT48.',
    activeFrom: '2013-02-16',
    prominence: 99,
    specialized: { song: { title: 'Heavy Rotation', songType: SongType.ALBUM_TRACK } },
  })

  await upsertEntity({
    slug: 'river',
    canonicalName: 'RIVER',
    entityType: EntityType.SONG,
    category: EntityCategory.MUSIC,
    summary: 'The first official physical single of JKT48.',
    activeFrom: '2013-05-11',
    prominence: 92,
    specialized: { song: { title: 'RIVER', songType: SongType.SINGLE_A_SIDE } },
  })

  await upsertEntity({
    slug: 'fortune-cookie-yang-mencinta',
    canonicalName: 'Fortune Cookie yang Mencinta',
    entityType: EntityType.SONG,
    category: EntityCategory.MUSIC,
    summary: 'The breakthrough nationwide hit single released simultaneously with AKB48.',
    activeFrom: '2013-08-21',
    prominence: 96,
    specialized: { song: { title: 'Fortune Cookie yang Mencinta', songType: SongType.SINGLE_A_SIDE } },
  })

  await upsertEntity({
    slug: 'rapsodi',
    canonicalName: 'Rapsodi',
    entityType: EntityType.SONG,
    category: EntityCategory.MUSIC,
    summary: 'The first original single composed specifically for JKT48.',
    activeFrom: '2020-01-22',
    prominence: 94,
    specialized: { song: { title: 'Rapsodi', songType: SongType.SINGLE_A_SIDE } },
  })

  await upsertEntity({
    slug: 'heavy-rotation-album',
    canonicalName: 'Heavy Rotation (Album)',
    entityType: EntityType.ALBUM,
    category: EntityCategory.MUSIC,
    summary: 'The debut studio album of JKT48.',
    activeFrom: '2013-02-16',
    prominence: 90,
    specialized: { album: { title: 'Heavy Rotation', albumType: AlbumType.STUDIO_ALBUM, trackCount: 10 } },
  })

  // Events
  await upsertEntity({
    slug: 'melody-graduation-concert',
    canonicalName: 'Konser Kelulusan Melody — Dirimu Melody',
    entityType: EntityType.CONCERT,
    category: EntityCategory.EVENT,
    summary: 'Graduation concert of Melody Nurramdhani Laksani at The Kasablanka Hall.',
    activeFrom: '2018-03-24',
    prominence: 88,
    specialized: {
      event: {
        title: 'Konser Kelulusan Melody — Dirimu Melody',
        eventType: EventType.GRADUATION,
        startDate: '2018-03-24',
        venue: 'The Kasablanka Hall',
      },
    },
  })

  // Edges (Relationships §10, §11)
  const edgesToSeed = [
    // Generation cohorts
    { s: 'melody-nurramdhani-laksani', code: REL.BELONGS_TO_GENERATION, t: 'generasi-1' },
    { s: 'devi-kinal-putri', code: REL.BELONGS_TO_GENERATION, t: 'generasi-1' },
    { s: 'shania-junianatha', code: REL.BELONGS_TO_GENERATION, t: 'generasi-1' },
    { s: 'nabilah-ratna-ayu-azalia', code: REL.BELONGS_TO_GENERATION, t: 'generasi-1' },
    { s: 'cindy-yuvia', code: REL.BELONGS_TO_GENERATION, t: 'generasi-2' },
    { s: 'shani-indira-natio', code: REL.BELONGS_TO_GENERATION, t: 'generasi-3' },
    { s: 'shania-gracia', code: REL.BELONGS_TO_GENERATION, t: 'generasi-3' },

    // Team memberships with temporal validity
    {
      s: 'melody-nurramdhani-laksani',
      code: REL.MEMBER_OF,
      t: 'team-j',
      from: '2012-12-23',
      to: '2018-03-31',
    },
    {
      s: 'melody-nurramdhani-laksani',
      code: REL.MEMBER_OF,
      t: 'team-t',
      from: '2016-12-01',
      to: '2018-03-31',
    },
    // Kinal changed teams! (Team J -> Team KIII)
    {
      s: 'devi-kinal-putri',
      code: REL.MEMBER_OF,
      t: 'team-j',
      from: '2012-12-23',
      to: '2015-07-31',
    },
    {
      s: 'devi-kinal-putri',
      code: REL.MEMBER_OF,
      t: 'team-kiii',
      from: '2015-08-01',
      to: '2018-06-30',
    },
    {
      s: 'devi-kinal-putri',
      code: REL.CAPTAIN_OF,
      t: 'team-j',
      from: '2012-12-23',
      to: '2015-07-31',
    },
    {
      s: 'devi-kinal-putri',
      code: REL.CAPTAIN_OF,
      t: 'team-kiii',
      from: '2015-08-01',
      to: '2016-12-01',
    },
    {
      s: 'shania-junianatha',
      code: REL.MEMBER_OF,
      t: 'team-j',
      from: '2012-12-23',
      to: '2019-04-28',
    },
    {
      s: 'shania-junianatha',
      code: REL.CAPTAIN_OF,
      t: 'team-j',
      from: '2015-08-01',
      to: '2018-03-31',
    },
    {
      s: 'nabilah-ratna-ayu-azalia',
      code: REL.MEMBER_OF,
      t: 'team-j',
      from: '2012-12-23',
      to: '2017-10-31',
    },
    // Yuvia changed teams! (Team KIII -> Team J)
    {
      s: 'cindy-yuvia',
      code: REL.MEMBER_OF,
      t: 'team-kiii',
      from: '2013-06-25',
      to: '2018-06-30',
    },
    {
      s: 'cindy-yuvia',
      code: REL.MEMBER_OF,
      t: 'team-j',
      from: '2018-07-01',
      to: '2019-07-27',
    },
    // Shani and Gracia
    {
      s: 'shani-indira-natio',
      code: REL.MEMBER_OF,
      t: 'team-t',
      from: '2015-01-24',
      to: '2016-11-30',
    },
    {
      s: 'shani-indira-natio',
      code: REL.MEMBER_OF,
      t: 'team-kiii',
      from: '2016-12-01',
      to: '2021-03-13',
    },
    {
      s: 'shania-gracia',
      code: REL.MEMBER_OF,
      t: 'team-t',
      from: '2015-01-24',
      to: '2016-11-30',
    },
    {
      s: 'shania-gracia',
      code: REL.MEMBER_OF,
      t: 'team-kiii',
      from: '2016-12-01',
      to: '2021-03-13',
    },
    {
      s: 'shania-gracia',
      code: REL.CAPTAIN_OF,
      t: 'team-kiii',
      from: '2020-06-06',
      to: '2021-03-13',
    },

    // Center & Senbatsu credits
    { s: 'melody-nurramdhani-laksani', code: REL.CENTER_OF, t: 'heavy-rotation' },
    { s: 'melody-nurramdhani-laksani', code: REL.CENTER_OF, t: 'fortune-cookie-yang-mencinta' },
    { s: 'melody-nurramdhani-laksani', code: REL.SENBATSU_IN, t: 'river' },
    { s: 'devi-kinal-putri', code: REL.CENTER_OF, t: 'river' },
    { s: 'devi-kinal-putri', code: REL.SENBATSU_IN, t: 'heavy-rotation' },
    { s: 'devi-kinal-putri', code: REL.SENBATSU_IN, t: 'fortune-cookie-yang-mencinta' },
    { s: 'shani-indira-natio', code: REL.CENTER_OF, t: 'rapsodi' },
    { s: 'shania-gracia', code: REL.SENBATSU_IN, t: 'rapsodi' },

    // Track on album
    { s: 'heavy-rotation', code: REL.TRACK_ON, t: 'heavy-rotation-album' },
    { s: 'heavy-rotation', code: REL.TITLE_TRACK_OF, t: 'heavy-rotation-album' },

    // Graduation event
    { s: 'melody-nurramdhani-laksani', code: REL.GRADUATED_AT, t: 'melody-graduation-concert' },
  ]

  for (const edge of edgesToSeed) {
    const sourceEntityId = entities[edge.s]
    const relationshipTypeId = relationshipTypes[edge.code]
    const targetEntityId = entities[edge.t]

    if (!sourceEntityId || !relationshipTypeId || !targetEntityId) {
      console.warn(`Skipping edge: missing reference for ${edge.s} -> ${edge.code} -> ${edge.t}`)
      continue
    }

    const existingEdge = await prisma.relationship.findFirst({
      where: {
        sourceEntityId,
        relationshipTypeId,
        targetEntityId,
        validFrom: edge.from ? new Date(edge.from) : null,
      },
    })

    if (!existingEdge) {
      await prisma.relationship.create({
        data: {
          sourceEntityId,
          relationshipTypeId,
          targetEntityId,
          validFrom: edge.from ? new Date(edge.from) : null,
          validTo: edge.to ? new Date(edge.to) : null,
          provenanceId: defaultSourceId,
          weight: 1,
        },
      })
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 7. App Settings (§19)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('⚙️ Seeding App Settings...')
  const defaultSettings = [
    {
      key: 'site.name',
      value: 'JKT48 Archive Lab',
      group: 'general',
      description: 'The primary title of the archive system.',
    },
    {
      key: 'site.tagline',
      value: 'An interactive historical knowledge system for exploring, connecting, and mastering JKT48.',
      group: 'general',
      description: 'The editorial tagline shown across the archive.',
    },
    {
      key: 'features.games_enabled',
      value: true,
      group: 'features',
      description: 'Master switch for knowledge games.',
    },
    {
      key: 'features.daily_challenge_enabled',
      value: false,
      group: 'features',
      description: 'Enable daily challenge mode (deferred to V1.1).',
    },
  ]

  for (const s of defaultSettings) {
    await prisma.appSetting.upsert({
      where: { key: s.key },
      update: {
        value: s.value,
        group: s.group,
        description: s.description,
      },
      create: {
        key: s.key,
        value: s.value,
        group: s.group,
        description: s.description,
      },
    })
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Admin Promotion (§19)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('🛡️ Checking SEED_ADMIN_EMAIL...')
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim()
  if (adminEmail) {
    const userProfile = await prisma.userProfile.findUnique({
      where: { email: adminEmail },
    })

    if (userProfile) {
      await prisma.userProfile.update({
        where: { id: userProfile.id },
        data: { role: UserRole.ADMIN },
      })
      console.log(`✅ Promoted existing account "${adminEmail}" to ADMIN.`)
    } else {
      console.log(
        `ℹ️ Account for "${adminEmail}" does not exist yet. Sign up first through the app and re-run seed to become admin (§19).`,
      )
    }
  } else {
    console.log('ℹ️ No SEED_ADMIN_EMAIL configured. Set it in .env to bootstrap your first admin account.')
  }

  console.log('\n✨ Database seeding completed successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed with error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
