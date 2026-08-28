import {
  AlbumType,
  AuditAction,
  EventType,
  GameSessionStatus,
  IssueSeverity,
  IssueStatus,
  MediaType,
  MemberStatus,
  OrganizationType,
  SongType,
  SourceType,
  UserRole,
} from '@/generated/prisma/enums'

/**
 * Display labels for enum values.
 *
 * Enums are SCREAMING_SNAKE in the database because they are identifiers; the UI
 * needs prose. Keeping the translation in one file means no component invents
 * its own casing, and the archive reads consistently.
 */

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  [MemberStatus.TRAINEE]: 'Trainee',
  [MemberStatus.ACTIVE]: 'Active',
  [MemberStatus.GRADUATED]: 'Graduated',
  [MemberStatus.ON_HIATUS]: 'On hiatus',
  [MemberStatus.TRANSFERRED]: 'Transferred',
}

export const SONG_TYPE_LABELS: Record<SongType, string> = {
  [SongType.SINGLE_A_SIDE]: 'Single A-side',
  [SongType.SINGLE_B_SIDE]: 'Single B-side',
  [SongType.ALBUM_TRACK]: 'Album track',
  [SongType.SETLIST_SONG]: 'Setlist song',
  [SongType.UNIT_SONG]: 'Unit song',
  [SongType.SOLO]: 'Solo',
  [SongType.OTHER]: 'Other',
}

export const ALBUM_TYPE_LABELS: Record<AlbumType, string> = {
  [AlbumType.SINGLE]: 'Single',
  [AlbumType.STUDIO_ALBUM]: 'Studio album',
  [AlbumType.MINI_ALBUM]: 'Mini album',
  [AlbumType.COMPILATION]: 'Compilation',
  [AlbumType.BEST_OF]: 'Best-of',
  [AlbumType.OTHER]: 'Other',
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  [EventType.ELECTION]: 'Election',
  [EventType.AUDITION]: 'Audition',
  [EventType.GRADUATION]: 'Graduation',
  [EventType.FORMATION]: 'Formation',
  [EventType.TEAM_SHUFFLE]: 'Team shuffle',
  [EventType.ANNIVERSARY]: 'Anniversary',
  [EventType.HANDSHAKE]: 'Handshake event',
  [EventType.FESTIVAL]: 'Festival',
  [EventType.OTHER]: 'Other',
}

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  [MediaType.TV_SHOW]: 'TV show',
  [MediaType.RADIO_SHOW]: 'Radio show',
  [MediaType.MOVIE]: 'Movie',
  [MediaType.DRAMA]: 'Drama',
  [MediaType.PHOTOBOOK]: 'Photobook',
  [MediaType.MUSIC_VIDEO]: 'Music video',
  [MediaType.DOCUMENTARY]: 'Documentary',
  [MediaType.OTHER]: 'Other',
}

export const ORGANIZATION_TYPE_LABELS: Record<OrganizationType, string> = {
  [OrganizationType.IDOL_GROUP]: 'Idol group',
  [OrganizationType.SISTER_GROUP]: 'Sister group',
  [OrganizationType.MANAGEMENT]: 'Management',
  [OrganizationType.LABEL]: 'Label',
  [OrganizationType.PRODUCTION]: 'Production',
  [OrganizationType.OTHER]: 'Other',
}

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  [SourceType.FANDOM]: 'Fandom wiki',
  [SourceType.WIKIPEDIA]: 'Wikipedia',
  [SourceType.OFFICIAL_SITE]: 'Official site',
  [SourceType.OFFICIAL_SOCIAL]: 'Official social',
  [SourceType.NEWS_ARTICLE]: 'News article',
  [SourceType.INTERVIEW]: 'Interview',
  [SourceType.VIDEO]: 'Video',
  [SourceType.BOOK]: 'Book',
  [SourceType.FAN_ARCHIVE]: 'Fan archive',
  [SourceType.PERSONAL_KNOWLEDGE]: 'Personal knowledge',
  [SourceType.OTHER]: 'Other',
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.USER]: 'User',
  [UserRole.ADMIN]: 'Administrator',
}

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  [AuditAction.CREATE]: 'Created',
  [AuditAction.UPDATE]: 'Updated',
  [AuditAction.DELETE]: 'Deleted',
  [AuditAction.RESTORE]: 'Restored',
  [AuditAction.BULK_IMPORT]: 'Bulk import',
  [AuditAction.CONFIG_CHANGE]: 'Configuration change',
  [AuditAction.DATA_HEALTH_RUN]: 'Data health run',
}

export const ISSUE_SEVERITY_LABELS: Record<IssueSeverity, string> = {
  [IssueSeverity.INFO]: 'Info',
  [IssueSeverity.WARNING]: 'Warning',
  [IssueSeverity.ERROR]: 'Error',
}

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  [IssueStatus.OPEN]: 'Open',
  [IssueStatus.IGNORED]: 'Ignored',
  [IssueStatus.RESOLVED]: 'Resolved',
}

export const SESSION_STATUS_LABELS: Record<GameSessionStatus, string> = {
  [GameSessionStatus.IN_PROGRESS]: 'In progress',
  [GameSessionStatus.COMPLETED]: 'Completed',
  [GameSessionStatus.ABANDONED]: 'Abandoned',
}

/** Fallback for any enum value without an explicit label. */
export function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ')
}
