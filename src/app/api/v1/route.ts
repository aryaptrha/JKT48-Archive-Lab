import type { NextRequest } from 'next/server'
import { jsonResponse } from './_lib/respond'

export const dynamic = 'force-dynamic'

/**
 * `/api/v1` — Discovery document (PRD §21).
 */
export async function GET(_request: NextRequest) {
  const discovery = {
    name: 'JKT48 Archive Lab API',
    version: '1.0',
    description:
      'A living interactive knowledge graph archive of JKT48. Explore members, generations, teams, songs, albums, and temporal historical relationships.',
    endpoints: {
      entities: '/api/v1/entities',
      entityDetail: '/api/v1/entities/{id}',
      members: '/api/v1/members',
      songs: '/api/v1/songs',
      albums: '/api/v1/albums',
      teams: '/api/v1/teams',
      generations: '/api/v1/generations',
      events: '/api/v1/events',
      relationships: '/api/v1/relationships',
      relationshipTypes: '/api/v1/relationship-types',
      timeline: '/api/v1/timeline',
      timeMachineSnapshot: '/api/v1/timeline/{date}',
      games: '/api/v1/games',
      gameType: '/api/v1/games/{gameType}',
      mastery: '/api/v1/mastery',
      masteryStatuses: '/api/v1/mastery/statuses',
    },
    documentation: 'https://github.com/your-org/JKT48-Archive-Lab',
  }

  return jsonResponse(discovery)
}
