import { attributeFieldsFor, ATTRIBUTE_FIELDS } from './attribute-fields'
import { attributeTableFor, ENTITY_TYPE_LABELS } from './entity-taxonomy'

import type { AttributeTable } from './entity-taxonomy'
import type { EntityType } from '@/generated/prisma/enums'

/**
 * Bulk import: reading a pasted sheet into rows (PRD §14, §26 V1.1).
 *
 * This module is pure. It turns text into candidate rows and says which columns
 * it could not place; it decides nothing about validity and touches no database.
 * That split matters because the rules for a valid record already exist once, in
 * `validation.ts`, and are enforced once, in `services/entity-admin` — an importer
 * that re-implemented them would be a second, quietly diverging definition of
 * what the archive accepts, which is exactly the failure mode `validation.ts`'s
 * own header warns about.
 *
 * Two things this file is deliberately generous about, because a curator's real
 * spreadsheet is never shaped the way an API is:
 *
 *   - Headers are matched loosely. `Canonical Name`, `canonical_name` and
 *     `canonicalName` are the same column, and so are a field's schema name and
 *     the label the record editor shows for it. Anything still unmatched is
 *     *reported*, never silently dropped.
 *   - Both modes accept CSV, TSV and JSON, because "export from Sheets" and
 *     "paste what the API would take" are both how this feature gets used.
 *
 * And one thing it is deliberately strict about: an empty cell means "not
 * provided", never "clear this field". A half-filled sheet is the normal case,
 * and a merge that blanked every column the operator left out would quietly
 * destroy curated data on the first update run.
 */

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

export type ImportMode = 'entities' | 'relationships'
export type ImportFormat = 'csv' | 'json'

/**
 * What to do with a row that names something already in the archive — a taken
 * slug, or an edge that already exists with the same identity.
 */
export type ConflictPolicy = 'skip' | 'update' | 'fail'

/** A batch stays small enough to read a per-row report of it in one sitting. */
export const MAX_IMPORT_ROWS = 500
/** Roughly a megabyte of pasted text; a bound on the parse, not a quality bar. */
export const MAX_IMPORT_BYTES = 1_000_000

export const IMPORT_MODE_LABELS: Record<ImportMode, string> = {
  entities: 'Records',
  relationships: 'Relationships',
}

export const CONFLICT_POLICY_LABELS: Record<ConflictPolicy, string> = {
  skip: 'Skip it, keep the existing row',
  update: 'Update the existing row',
  fail: 'Reject the row as an error',
}

/*
 * The accepted values, as lists.
 *
 * A `<select>` renders from these and the Server Action validates against the
 * same lists, so a hand-crafted POST cannot smuggle in a fourth conflict policy —
 * the markup is a convenience, never the constraint (PRD §35).
 */
export const IMPORT_MODES: readonly ImportMode[] = ['entities', 'relationships']
export const IMPORT_FORMATS: readonly ImportFormat[] = ['csv', 'json']
export const CONFLICT_POLICIES: readonly ConflictPolicy[] = ['skip', 'update', 'fail']

export const IMPORT_FORMAT_LABELS: Record<ImportFormat, string> = {
  csv: 'CSV / TSV',
  json: 'JSON',
}

export type ImportIssue = { line: number; message: string }

/**
 * One candidate record.
 *
 * `base` and `attributes` hold only the keys the sheet actually carried, which is
 * what lets an update merge over the stored row instead of overwriting it with
 * blanks. `line` is the source line for CSV and the 1-based item index for JSON.
 */
export type ParsedEntityRow = {
  line: number
  base: Record<string, unknown>
  attributes: Record<string, unknown>
  /** A `Source` name or id, resolved server-side; never a foreign key yet. */
  provenanceRef: string | null
}

export type ParsedRelationshipRow = {
  line: number
  sourceRef: string
  typeCode: string
  targetRef: string
  fields: Record<string, unknown>
  provenanceRef: string | null
}

export type ParseOutput = {
  entities: ParsedEntityRow[]
  relationships: ParsedRelationshipRow[]
  /** Header cells (or JSON keys) that matched no known column. */
  ignoredColumns: string[]
  /** Rows that could not be read at all, as opposed to rows that failed validation. */
  issues: ImportIssue[]
}

export type ParseResult = ({ ok: true } & ParseOutput) | { ok: false; message: string }

/* -------------------------------------------------------------------------- */
/* Column vocabulary                                                          */
/* -------------------------------------------------------------------------- */

export type ImportColumn = {
  /** The key the validation schema expects. */
  name: string
  label: string
  required?: boolean
  hint?: string
  aliases?: readonly string[]
}

/**
 * The base record columns — the same fields the entity editor's first half shows.
 *
 * Note what is not here, and cannot be: `team`, `generation`, `centerSong`. A
 * member's generation is an edge with a validity window (PRD §10), so it is
 * imported in relationship mode. A `generation` column on a members sheet would
 * be re-introducing the foreign key the schema deliberately omits, and quietly
 * accepting one would be worse than rejecting it — hence it lands in the ignored
 * columns list, where the operator sees it.
 */
export const ENTITY_COLUMNS: readonly ImportColumn[] = [
  {
    name: 'entityType',
    label: 'Record type',
    hint: 'Optional. Overrides the selected type row by row, so one sheet can mix types.',
    aliases: ['type', 'recordtype', 'kind'],
  },
  {
    name: 'canonicalName',
    label: 'Canonical name',
    required: true,
    hint: 'The archive’s name for the record. Also fills the type-specific title when that is blank.',
    aliases: ['name', 'canonical', 'record', 'recordname'],
  },
  {
    name: 'slug',
    label: 'Slug',
    hint: 'Leave blank to derive it from the name. A taken slug follows the conflict rule below.',
    aliases: ['urlslug', 'permalink'],
  },
  {
    name: 'aliases',
    label: 'Aliases',
    hint: 'Comma-separated. Quote the whole cell so the commas survive the CSV, or pass a JSON array.',
    aliases: ['alias', 'aka', 'alsoknownas', 'othernames'],
  },
  { name: 'summary', label: 'Summary', hint: 'One line, 320 characters.', aliases: ['blurb', 'tagline'] },
  { name: 'description', label: 'Description', aliases: ['body', 'longdescription', 'about'] },
  { name: 'imageUrl', label: 'Image URL', aliases: ['image', 'photo', 'picture'] },
  {
    name: 'activeFrom',
    label: 'Active from',
    hint: 'YYYY-MM-DD.',
    aliases: ['active', 'activesince', 'since'],
  },
  { name: 'activeTo', label: 'Active to', hint: 'YYYY-MM-DD. Blank while current.', aliases: ['until', 'inactivefrom'] },
  {
    name: 'prominence',
    label: 'Prominence',
    hint: '0–100, default 50. Orders rails and weights game subject picking.',
    aliases: ['weight', 'rank', 'priority'],
  },
  {
    name: 'isPublished',
    label: 'Published',
    hint: 'Default true on import. Write false, no or 0 to bring rows in as drafts.',
    aliases: ['published', 'publish', 'live', 'visible'],
  },
  { name: 'notes', label: 'Curator notes', hint: 'Internal. Never shown to readers.', aliases: ['curatornotes', 'internalnotes'] },
  {
    name: 'provenance',
    label: 'Provenance',
    hint: 'A source’s exact name or id, matched against the sources register.',
    aliases: ['provenanceid', 'sourcename', 'citation', 'reference'],
  },
]

/**
 * The relationship columns (PRD §10, §11).
 *
 * Endpoints are references, not ids: a slug, a record id, or a name that
 * slugifies to one. Asking a curator for cuids would make the feature unusable
 * from a spreadsheet, which is the only place bulk edges come from.
 */
export const RELATIONSHIP_COLUMNS: readonly ImportColumn[] = [
  {
    name: 'sourceRef',
    label: 'Source record',
    required: true,
    hint: 'Slug, id, or a name that slugifies to one — e.g. shani-indira-natio.',
    aliases: ['source', 'sourceslug', 'sourceentity', 'sourcerecord', 'from', 'subject'],
  },
  {
    name: 'typeCode',
    label: 'Relationship type',
    required: true,
    hint: 'The type code, e.g. MEMBER_OF. Spaces and hyphens are read as underscores.',
    aliases: ['type', 'code', 'relationship', 'relationshiptype', 'predicate', 'verb'],
  },
  {
    name: 'targetRef',
    label: 'Target record',
    required: true,
    hint: 'Slug, id, or a name that slugifies to one.',
    aliases: ['target', 'targetslug', 'targetentity', 'targetrecord', 'to', 'object'],
  },
  {
    name: 'validFrom',
    label: 'Valid from',
    hint: 'YYYY-MM-DD. Only for temporal types; a date on a non-temporal type is refused.',
    aliases: ['start', 'startdate', 'validsince', 'joined'],
  },
  {
    name: 'validTo',
    label: 'Valid to',
    hint: 'YYYY-MM-DD. Blank means still current — that is what makes this a history.',
    aliases: ['end', 'enddate', 'validuntil', 'left'],
  },
  { name: 'weight', label: 'Weight', hint: '1–100, default 1.', aliases: ['strength', 'rank'] },
  { name: 'notes', label: 'Notes', aliases: ['curatornotes', 'internalnotes'] },
  {
    name: 'provenance',
    label: 'Provenance',
    hint: 'A source’s exact name or id.',
    aliases: ['provenanceid', 'sourcename', 'citation', 'reference'],
  },
]

/* -------------------------------------------------------------------------- */
/* Header matching                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `Canonical Name`, `canonical_name` and `canonicalName` are one column.
 *
 * Stripping every non-alphanumeric character is blunt on purpose: it collapses
 * the whole space of separators a spreadsheet might use, so the matcher never has
 * to enumerate them.
 */
export function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function buildColumnIndex(columns: readonly ImportColumn[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const column of columns) {
    const keys = [column.name, column.label, ...(column.aliases ?? [])]
    for (const key of keys) {
      const normalized = normalizeKey(key)
      if (normalized.length > 0 && !index.has(normalized)) index.set(normalized, column.name)
    }
  }
  return index
}

const ENTITY_INDEX = buildColumnIndex(ENTITY_COLUMNS)
const RELATIONSHIP_INDEX = buildColumnIndex(RELATIONSHIP_COLUMNS)

const ATTRIBUTE_TABLE_ORDER = Object.keys(ATTRIBUTE_FIELDS) as AttributeTable[]

/**
 * Attribute headers, matched by schema name or editor label.
 *
 * The selected type's own table is registered first so its fields win, then every
 * other table is folded in — which is what lets one sheet carry mixed types
 * (`entityType` per row) without the operator having to split it. Attribute keys
 * that do not belong to the type a given row turns out to be are dropped by that
 * type's Zod schema, so the extra breadth cannot write anything.
 */
function buildAttributeIndex(entityType: EntityType): Map<string, string> {
  const index = new Map<string, string>()
  const preferred = attributeTableFor(entityType)
  const tables = preferred
    ? [preferred, ...ATTRIBUTE_TABLE_ORDER.filter((table) => table !== preferred)]
    : ATTRIBUTE_TABLE_ORDER

  for (const table of tables) {
    for (const field of attributeFieldsFor(table)) {
      for (const key of [field.name, field.label]) {
        const normalized = normalizeKey(key)
        if (normalized.length > 0 && !index.has(normalized)) index.set(normalized, field.name)
      }
    }
  }

  return index
}

type ResolvedColumn =
  | { kind: 'base'; name: string }
  | { kind: 'attribute'; name: string }
  | { kind: 'unknown' }

const ATTRIBUTE_PREFIX = /^attributes?[._-]/i

function resolveEntityHeader(raw: string, attributeIndex: Map<string, string>): ResolvedColumn {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { kind: 'unknown' }

  if (ATTRIBUTE_PREFIX.test(trimmed)) {
    const attribute = attributeIndex.get(normalizeKey(trimmed.replace(ATTRIBUTE_PREFIX, '')))
    return attribute ? { kind: 'attribute', name: attribute } : { kind: 'unknown' }
  }

  const normalized = normalizeKey(trimmed)
  const base = ENTITY_INDEX.get(normalized)
  if (base) return { kind: 'base', name: base }

  const attribute = attributeIndex.get(normalized)
  if (attribute) return { kind: 'attribute', name: attribute }

  return { kind: 'unknown' }
}

function resolveRelationshipHeader(raw: string): ResolvedColumn {
  const name = RELATIONSHIP_INDEX.get(normalizeKey(raw))
  return name ? { kind: 'base', name } : { kind: 'unknown' }
}

/** `member of` and `member-of` are both `MEMBER_OF`. */
export function normalizeTypeCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * A canonical name inferred from the type-specific title, for a sheet that only
 * has one.
 *
 * `entity-admin`'s `withDerivedLabel` already fills a blank `member.stageName` or
 * `song.title` from the canonical name; this is that arrow reversed, for the
 * common sheet whose only name column is called `Title`. Without it a perfectly
 * clear songs export would fail every row on a field the operator did supply.
 */
export function deriveCanonicalName(attributes: Record<string, unknown>): string | null {
  for (const key of ['title', 'stageName', 'name']) {
    const value = attributes[key]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* Delimited text                                                             */
/* -------------------------------------------------------------------------- */

type DelimitedRow = { line: number; cells: string[] }

const DELIMITERS = ['\t', ',', ';'] as const

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * Guess the delimiter from the header line, counting only outside quotes.
 *
 * Tab first: a paste straight out of Sheets or Excel is tab-separated, and its
 * cells routinely contain commas.
 */
function detectDelimiter(text: string): string {
  const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter((l) => l.length > 0)
  const header = lines[0] ?? ''

  let best = ','
  let bestCount = 0
  for (const candidate of DELIMITERS) {
    let count = 0
    let inQuotes = false
    for (const char of header) {
      if (char === '"') inQuotes = !inQuotes
      else if (!inQuotes && char === candidate) count += 1
    }
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

/**
 * A small RFC 4180 reader: quoted cells, `""` for a literal quote, embedded
 * newlines, CRLF, and a line number per row so a report can point at the sheet.
 *
 * Written out rather than pulled from a dependency because the whole surface is
 * one pass over a string, and a parser is a poor place to inherit surprises.
 */
function parseDelimited(text: string, delimiter: string): DelimitedRow[] {
  const rows: DelimitedRow[] = []
  let cells: string[] = []
  let field = ''
  let inQuotes = false
  let touched = false
  let line = 1
  let rowStart = 1

  const endRow = () => {
    if (touched || field.length > 0 || cells.length > 0) {
      cells.push(field)
      rows.push({ line: rowStart, cells })
    }
    cells = []
    field = ''
    touched = false
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index)

    if (inQuotes) {
      if (char === '"') {
        if (text.charAt(index + 1) === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
        continue
      }
      if (char === '\n') line += 1
      field += char
      continue
    }

    if (char === '"') {
      inQuotes = true
      touched = true
      continue
    }
    if (char === delimiter) {
      cells.push(field)
      field = ''
      touched = true
      continue
    }
    if (char === '\r') continue
    if (char === '\n') {
      endRow()
      line += 1
      rowStart = line
      continue
    }

    field += char
    touched = true
  }

  endRow()

  return rows.filter((row) => row.cells.some((cell) => cell.trim().length > 0))
}

/* -------------------------------------------------------------------------- */
/* Assembling rows                                                            */
/* -------------------------------------------------------------------------- */

/** An empty cell is "not provided", so it never reaches the merge as a blank. */
function isProvided(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function cellValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value
}

type Collected = {
  base: Record<string, unknown>
  attributes: Record<string, unknown>
}

function toEntityRow(line: number, collected: Collected): ParsedEntityRow {
  const { base, attributes } = collected
  const provenance = base.provenance
  delete base.provenance

  if (!isProvided(base.canonicalName)) {
    const derived = deriveCanonicalName(attributes)
    if (derived) base.canonicalName = derived
  }

  return {
    line,
    base,
    attributes,
    provenanceRef: typeof provenance === 'string' && provenance.length > 0 ? provenance : null,
  }
}

function toRelationshipRow(line: number, fields: Record<string, unknown>): ParsedRelationshipRow {
  const provenance = fields.provenance
  const sourceRef = fields.sourceRef
  const typeCode = fields.typeCode
  const targetRef = fields.targetRef
  delete fields.provenance
  delete fields.sourceRef
  delete fields.typeCode
  delete fields.targetRef

  return {
    line,
    sourceRef: typeof sourceRef === 'string' ? sourceRef : '',
    typeCode: typeof typeCode === 'string' ? normalizeTypeCode(typeCode) : '',
    targetRef: typeof targetRef === 'string' ? targetRef : '',
    fields,
    provenanceRef: typeof provenance === 'string' && provenance.length > 0 ? provenance : null,
  }
}

/* -------------------------------------------------------------------------- */
/* JSON                                                                       */
/* -------------------------------------------------------------------------- */

function asRecordArray(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value)) return null
  const rows: Record<string, unknown>[] = []
  for (const item of value) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return null
    rows.push(item as Record<string, unknown>)
  }
  return rows
}

type JsonPayload = {
  entities: Record<string, unknown>[]
  relationships: Record<string, unknown>[]
}

/**
 * Accepted JSON shapes: a bare array, `{ rows: [...] }`, or an envelope naming
 * `entities` and `relationships` together.
 *
 * The envelope is the interesting one. Fifty members are useless without the
 * edges that place them in a generation and a team, and this is a
 * relationship-first archive (PRD §10) — so one paste can carry both, with the
 * records created first so the edges can reference slugs that did not exist when
 * the file was written.
 */
function parseJsonPayload(text: string, mode: ImportMode): JsonPayload | string {
  let decoded: unknown
  try {
    decoded = JSON.parse(text)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unparseable JSON'
    return `That is not valid JSON: ${detail}`
  }

  const direct = asRecordArray(decoded)
  if (direct) {
    return mode === 'entities'
      ? { entities: direct, relationships: [] }
      : { entities: [], relationships: direct }
  }

  if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) {
    return 'Expected an array of objects, or an object with an "entities" or "relationships" array.'
  }

  const envelope = decoded as Record<string, unknown>
  const entities = asRecordArray(envelope.entities ?? envelope.records ?? []) ?? null
  const relationships = asRecordArray(envelope.relationships ?? envelope.edges ?? []) ?? null
  const rows = asRecordArray(envelope.rows ?? []) ?? null

  if (!entities || !relationships || !rows) {
    return 'Every item in "entities", "relationships" and "rows" must be an object.'
  }

  if (entities.length === 0 && relationships.length === 0 && rows.length === 0) {
    return 'Found no rows. Use an array of objects, or an object with an "entities" or "relationships" array.'
  }

  return mode === 'entities'
    ? { entities: [...entities, ...rows], relationships }
    : { entities, relationships: [...relationships, ...rows] }
}

/* -------------------------------------------------------------------------- */
/* Parse                                                                      */
/* -------------------------------------------------------------------------- */

export type ParseRequest = {
  text: string
  format: ImportFormat
  mode: ImportMode
  /** The type a row without its own `entityType` is assumed to be. */
  entityType: EntityType
}

export function parseImport(request: ParseRequest): ParseResult {
  const text = stripBom(request.text)

  if (text.trim().length === 0) {
    return { ok: false, message: 'Nothing to import — paste a sheet or a JSON payload first.' }
  }
  if (text.length > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      message: `That payload is ${Math.round(text.length / 1000)} KB, over the ${Math.round(
        MAX_IMPORT_BYTES / 1000,
      )} KB limit. Split it into smaller batches.`,
    }
  }

  const attributeIndex = buildAttributeIndex(request.entityType)
  const output: ParseOutput = { entities: [], relationships: [], ignoredColumns: [], issues: [] }
  const ignored = new Set<string>()

  if (request.format === 'json') {
    const payload = parseJsonPayload(text, request.mode)
    if (typeof payload === 'string') return { ok: false, message: payload }

    payload.entities.forEach((item, index) => {
      const collected: Collected = { base: {}, attributes: {} }
      const nested = item.attributes
      const nestedRecord =
        nested !== null && typeof nested === 'object' && !Array.isArray(nested)
          ? (nested as Record<string, unknown>)
          : null

      for (const [key, raw] of Object.entries(item)) {
        if (key === 'attributes' && nestedRecord) continue
        if (!isProvided(raw)) continue
        const resolved = resolveEntityHeader(key, attributeIndex)
        if (resolved.kind === 'unknown') ignored.add(key.trim())
        else if (resolved.kind === 'base') collected.base[resolved.name] = cellValue(raw)
        else collected.attributes[resolved.name] = cellValue(raw)
      }

      for (const [key, raw] of Object.entries(nestedRecord ?? {})) {
        if (!isProvided(raw)) continue
        const attribute = attributeIndex.get(normalizeKey(key))
        if (attribute) collected.attributes[attribute] = cellValue(raw)
        else ignored.add(`attributes.${key.trim()}`)
      }

      output.entities.push(toEntityRow(index + 1, collected))
    })

    payload.relationships.forEach((item, index) => {
      const fields: Record<string, unknown> = {}
      for (const [key, raw] of Object.entries(item)) {
        if (!isProvided(raw)) continue
        const resolved = resolveRelationshipHeader(key)
        if (resolved.kind === 'unknown') ignored.add(key.trim())
        else fields[resolved.name] = cellValue(raw)
      }
      output.relationships.push(toRelationshipRow(index + 1, fields))
    })
  } else {
    const delimiter = detectDelimiter(text)
    const rows = parseDelimited(text, delimiter)
    const headerRow = rows[0]

    if (!headerRow) {
      return { ok: false, message: 'Found no rows. The first line must be a header row.' }
    }

    const headers = headerRow.cells.map((cell) =>
      request.mode === 'entities'
        ? resolveEntityHeader(cell, attributeIndex)
        : resolveRelationshipHeader(cell),
    )

    headerRow.cells.forEach((cell, index) => {
      if (headers[index]?.kind === 'unknown' && cell.trim().length > 0) ignored.add(cell.trim())
    })

    if (headers.every((header) => header.kind === 'unknown')) {
      return {
        ok: false,
        message:
          'None of those column names are recognised. Check the header row against the column reference below — the template button gives you a header that works.',
      }
    }

    for (const row of rows.slice(1)) {
      if (row.cells.length > headers.length) {
        const extra = row.cells.slice(headers.length).filter((cell) => cell.trim().length > 0)
        if (extra.length > 0) {
          output.issues.push({
            line: row.line,
            message: `Has ${row.cells.length} cells but the header has ${headers.length}. Check for an unquoted comma.`,
          })
          continue
        }
      }

      if (request.mode === 'entities') {
        const collected: Collected = { base: {}, attributes: {} }
        headers.forEach((header, index) => {
          const raw = row.cells[index]
          if (header.kind === 'unknown' || !isProvided(raw)) return
          if (header.kind === 'base') collected.base[header.name] = cellValue(raw)
          else collected.attributes[header.name] = cellValue(raw)
        })
        output.entities.push(toEntityRow(row.line, collected))
      } else {
        const fields: Record<string, unknown> = {}
        headers.forEach((header, index) => {
          const raw = row.cells[index]
          if (header.kind !== 'base' || !isProvided(raw)) return
          fields[header.name] = cellValue(raw)
        })
        output.relationships.push(toRelationshipRow(row.line, fields))
      }
    }
  }

  const total = output.entities.length + output.relationships.length
  if (total === 0) {
    return {
      ok: false,
      message: 'Found a header but no data rows. Add at least one row beneath it.',
    }
  }
  if (total > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      message: `That is ${total} rows, over the ${MAX_IMPORT_ROWS}-row limit for one batch. Split it up — a report you cannot read is not a check.`,
    }
  }

  output.ignoredColumns = [...ignored].sort()
  return { ok: true, ...output }
}

/* -------------------------------------------------------------------------- */
/* Templates and reference                                                    */
/* -------------------------------------------------------------------------- */

export type ImportColumnSpec = {
  /** Written verbatim as a header cell. */
  key: string
  label: string
  required: boolean
  hint?: string
  group: 'record' | 'details' | 'edge'
}

/**
 * An attribute's bare name is used as its header unless a base column already
 * claims it — `organization.name` collides with `name`, the alias for the
 * canonical name, so that one is emitted prefixed.
 */
function attributeHeaderKey(name: string): string {
  return ENTITY_INDEX.has(normalizeKey(name)) ? `attributes.${name}` : name
}

export function importColumnSpecs(mode: ImportMode, entityType: EntityType): ImportColumnSpec[] {
  if (mode === 'relationships') {
    return RELATIONSHIP_COLUMNS.map((column) => ({
      key: column.name,
      label: column.label,
      required: column.required ?? false,
      ...(column.hint ? { hint: column.hint } : {}),
      group: 'edge' as const,
    }))
  }

  const specs: ImportColumnSpec[] = ENTITY_COLUMNS.map((column) => ({
    key: column.name,
    label: column.label,
    required: column.required ?? false,
    ...(column.hint ? { hint: column.hint } : {}),
    group: 'record' as const,
  }))

  const table = attributeTableFor(entityType)
  if (!table) return specs

  for (const field of attributeFieldsFor(table)) {
    const options = field.options?.map((option) => option.value).join(' | ')
    const hint = options ? `One of: ${options}` : field.hint
    specs.push({
      key: attributeHeaderKey(field.name),
      label: field.label,
      required: field.required ?? false,
      ...(hint ? { hint } : {}),
      group: 'details',
    })
  }

  return specs
}

/**
 * A header row for the chosen mode and type: required columns first, then the
 * optional ones, so a curator filling it left to right hits the mandatory
 * columns before they lose patience.
 */
export function importTemplateHeader(mode: ImportMode, entityType: EntityType): string {
  const specs = importColumnSpecs(mode, entityType)
  const required = specs.filter((spec) => spec.required)
  const optional = specs.filter((spec) => !spec.required)
  return [...required, ...optional].map((spec) => spec.key).join(',')
}

/* -------------------------------------------------------------------------- */
/* Sample data & Downloadable templates                                       */
/* -------------------------------------------------------------------------- */

export type SampleRecord = Record<string, string | number | boolean | null | undefined>

export const SAMPLE_RECORDS_BY_ENTITY_TYPE: Partial<Record<EntityType, SampleRecord[]>> = {
  MEMBER: [
    {
      canonicalName: 'Shani Indira Natio',
      stageName: 'Shani',
      status: 'GRADUATED',
      entityType: 'MEMBER',
      slug: 'shani-indira-natio',
      aliases: 'Shani, Shanju',
      summary: 'Third generation member and former captain of JKT48.',
      description: 'Shani Indira Natio joined JKT48 in 2014 and was one of the most prominent members.',
      imageUrl: 'https://example.com/photos/shani.jpg',
      activeFrom: '2014-03-15',
      activeTo: '2024-05-05',
      prominence: 85,
      isPublished: true,
      notes: 'Graduated with solo concert',
      provenance: 'Official Website',
      fullName: 'Shani Indira Natio',
      nickname: 'Shani',
      birthDate: '1998-10-05',
      birthPlace: 'Yogyakarta',
      heightCm: 166,
      bloodType: 'B',
      zodiac: 'Libra',
      debutDate: '2014-03-15',
      graduationDate: '2024-05-05',
      jikoshoukai: 'Sweet like cotton candy, warm like sunshine, I am Shani.',
    },
    {
      canonicalName: 'Fiony Alveria',
      stageName: 'Fiony',
      status: 'ACTIVE',
      entityType: 'MEMBER',
      slug: 'fiony-alveria',
      aliases: 'Fiony, Ce Fio',
      summary: 'Eighth generation member of JKT48.',
      description: 'Fiony Alveria Tantoki debuted as an 8th generation member.',
      imageUrl: 'https://example.com/photos/fiony.jpg',
      activeFrom: '2019-04-27',
      prominence: 70,
      isPublished: true,
      provenance: 'Official Website',
      fullName: 'Fiony Alveria Tantoki',
      nickname: 'Ce Fio',
      birthDate: '2002-02-04',
      birthPlace: 'Jakarta',
      heightCm: 158,
      bloodType: 'O',
      zodiac: 'Aquarius',
      debutDate: '2019-04-27',
      jikoshoukai: 'Like a sparkling snowflake, always bringing happiness.',
    },
  ],
  SONG: [
    {
      canonicalName: 'Heavy Rotation',
      title: 'Heavy Rotation',
      songType: 'SINGLE_A_SIDE',
      entityType: 'SONG',
      slug: 'heavy-rotation',
      aliases: 'Hebirote, Heavy Rotation JKT48',
      summary: 'Lead track of 1st studio album and debut single.',
      imageUrl: 'https://example.com/songs/heavy-rotation.jpg',
      activeFrom: '2013-02-16',
      prominence: 90,
      isPublished: true,
      provenance: 'Official Website',
      originalTitle: 'ヘビーローテーション',
      releasedAt: '2013-02-16',
      durationSec: 282,
      isAdaptation: true,
      originalArtist: 'AKB48',
      lyricist: 'Yasushi Akimoto',
      composer: 'You-Me',
    },
    {
      canonicalName: 'Rapsodi',
      title: 'Rapsodi',
      songType: 'SINGLE_A_SIDE',
      entityType: 'SONG',
      slug: 'rapsodi',
      aliases: 'Rapsodi, JKT48 Rapsodi',
      summary: 'JKT48 21st single and first original song.',
      imageUrl: 'https://example.com/songs/rapsodi.jpg',
      activeFrom: '2020-01-22',
      prominence: 85,
      isPublished: true,
      provenance: 'Official Website',
      releasedAt: '2020-01-22',
      durationSec: 290,
      isAdaptation: false,
      originalArtist: 'JKT48',
      lyricist: 'Laleilmanino',
      composer: 'Laleilmanino',
    },
  ],
  SINGLE: [
    {
      canonicalName: 'Rapsodi',
      title: 'Rapsodi',
      albumType: 'SINGLE',
      entityType: 'SINGLE',
      slug: 'rapsodi-single',
      aliases: '21st Single',
      summary: 'JKT48 21st single release.',
      imageUrl: 'https://example.com/singles/rapsodi.jpg',
      activeFrom: '2020-01-22',
      prominence: 80,
      isPublished: true,
      provenance: 'Official Website',
      releasedAt: '2020-01-22',
      catalogNumber: 'HITS-021',
      trackCount: 5,
      label: 'Hits Records',
    },
  ],
  ALBUM: [
    {
      canonicalName: 'Heavy Rotation',
      title: 'Heavy Rotation',
      albumType: 'STUDIO_ALBUM',
      entityType: 'ALBUM',
      slug: 'heavy-rotation-album',
      aliases: '1st Album',
      summary: '1st studio album of JKT48.',
      imageUrl: 'https://example.com/albums/heavy-rotation.jpg',
      activeFrom: '2013-02-16',
      prominence: 85,
      isPublished: true,
      provenance: 'Official Website',
      releasedAt: '2013-02-16',
      catalogNumber: 'HITS-001',
      trackCount: 10,
      label: 'Hits Records',
    },
  ],
  TEAM: [
    {
      canonicalName: 'Team J',
      code: 'J',
      entityType: 'TEAM',
      slug: 'team-j',
      aliases: 'Team J, Tim J',
      summary: 'The first team of JKT48.',
      imageUrl: 'https://example.com/teams/team-j.jpg',
      activeFrom: '2012-12-23',
      activeTo: '2021-03-14',
      prominence: 80,
      isPublished: true,
      provenance: 'Official Website',
      colorHex: '#E60012',
      formedAt: '2012-12-23',
      disbandedAt: '2021-03-14',
      catchphrase: 'Always spirited, always leading the way.',
    },
    {
      canonicalName: 'Team KIII',
      code: 'KIII',
      entityType: 'TEAM',
      slug: 'team-kiii',
      aliases: 'Team KIII, Tim K3',
      summary: 'The second team of JKT48.',
      imageUrl: 'https://example.com/teams/team-kiii.jpg',
      activeFrom: '2013-06-25',
      activeTo: '2021-03-14',
      prominence: 80,
      isPublished: true,
      provenance: 'Official Website',
      colorHex: '#FFD700',
      formedAt: '2013-06-25',
      disbandedAt: '2021-03-14',
      catchphrase: 'Full power, full energy, forever Team KIII!',
    },
  ],
  GENERATION: [
    {
      canonicalName: 'Generation 3',
      number: 3,
      entityType: 'GENERATION',
      slug: 'generation-3',
      aliases: 'Gen 3, Generasi 3',
      summary: 'Third generation intake of JKT48.',
      imageUrl: 'https://example.com/gens/gen-3.jpg',
      activeFrom: '2014-03-15',
      prominence: 80,
      isPublished: true,
      provenance: 'Official Website',
      initialMemberCount: 32,
      auditionOpenedAt: '2013-11-03',
      announcedAt: '2014-03-15',
      debutedAt: '2014-03-15',
    },
  ],
  SETLIST: [
    {
      canonicalName: 'Pajama Drive',
      stageName: 'Pajama Drive',
      entityType: 'SETLIST',
      slug: 'pajama-drive',
      aliases: 'Pajama Drive, Pajadora',
      summary: '1st Stage of Trainee and Team J.',
      imageUrl: 'https://example.com/setlists/pajama-drive.jpg',
      activeFrom: '2012-05-17',
      prominence: 80,
      isPublished: true,
      provenance: 'Official Website',
      revision: 'Original',
      premieredAt: '2012-05-17',
      songCount: 16,
      theater: 'JKT48 Theater, fX Sudirman',
    },
  ],
  CONCERT: [
    {
      canonicalName: 'JKT48 10th Anniversary Concert: HEAVEN',
      title: 'JKT48 10th Anniversary Concert: HEAVEN',
      entityType: 'CONCERT',
      slug: 'jkt48-10th-anniversary-heaven',
      aliases: '10th Anniversary Concert',
      summary: '10th Anniversary Concert and Gabriella Margareth graduation.',
      imageUrl: 'https://example.com/concerts/heaven.jpg',
      activeFrom: '2022-08-06',
      prominence: 85,
      isPublished: true,
      provenance: 'Official Website',
      tourName: '10th Anniversary Tour',
      heldAt: '2022-08-06',
      venue: 'Istora Senayan',
      city: 'Jakarta',
      attendance: 4000,
      isStreamed: true,
    },
  ],
  ELECTION: [
    {
      canonicalName: 'JKT48 6th Sousenkyo',
      title: 'JKT48 6th Sousenkyo',
      eventType: 'ELECTION',
      entityType: 'ELECTION',
      slug: 'jkt48-6th-sousenkyo',
      aliases: 'SSK 2019',
      summary: '6th Senbatsu Sousenkyo for 21st single.',
      imageUrl: 'https://example.com/events/ssk-2019.jpg',
      activeFrom: '2019-11-30',
      prominence: 80,
      isPublished: true,
      provenance: 'Official Website',
      startDate: '2019-11-30',
      venue: 'BRP Smesco Convention Hall',
      city: 'Jakarta',
      country: 'Indonesia',
    },
  ],
  TV_APPEARANCE: [
    {
      canonicalName: 'JKT48 School',
      title: 'JKT48 School',
      mediaType: 'TV_SHOW',
      entityType: 'TV_APPEARANCE',
      slug: 'jkt48-school',
      aliases: 'Variety Show',
      summary: 'Variety show featuring 1st generation members.',
      imageUrl: 'https://example.com/media/jkt48-school.jpg',
      activeFrom: '2012-04-15',
      prominence: 70,
      isPublished: true,
      provenance: 'Official Website',
      releasedAt: '2012-04-15',
      network: 'Global TV',
      publisher: 'MNC Media',
      externalUrl: 'https://example.com/watch',
    },
  ],
  ORGANIZATION: [
    {
      canonicalName: 'Dentsu Inter Admark Media Group Indonesia',
      name: 'Dentsu Inter Admark',
      orgType: 'MANAGEMENT',
      entityType: 'ORGANIZATION',
      slug: 'dentsu-indonesia',
      aliases: 'Dentsu Media',
      summary: 'Operational management of JKT48.',
      imageUrl: 'https://example.com/orgs/dentsu.jpg',
      activeFrom: '2011-10-01',
      prominence: 60,
      isPublished: true,
      provenance: 'Official Website',
      country: 'Indonesia',
      foundedAt: '2011-10-01',
      website: 'https://example.com',
    },
  ],
}

export const SAMPLE_RELATIONSHIPS: SampleRecord[] = [
  {
    sourceRef: 'shani-indira-natio',
    typeCode: 'MEMBER_OF',
    targetRef: 'team-kiii',
    validFrom: '2015-08-01',
    validTo: '2024-05-05',
    weight: 1,
    notes: 'Promoted to Team KIII',
    provenance: 'Official Website',
  },
  {
    sourceRef: 'shani-indira-natio',
    typeCode: 'BELONGS_TO_GENERATION',
    targetRef: 'generation-3',
    validFrom: '2014-03-15',
    weight: 1,
    provenance: 'Official Website',
  },
  {
    sourceRef: 'shani-indira-natio',
    typeCode: 'CENTER_OF',
    targetRef: 'rapsodi',
    validFrom: '2020-01-22',
    weight: 1,
    notes: 'Center position for 21st single Rapsodi',
    provenance: 'Official Website',
  },
  {
    sourceRef: 'shani-indira-natio',
    typeCode: 'GRADUATED_AT',
    targetRef: 'jkt48-10th-anniversary-heaven',
    validFrom: '2024-05-05',
    weight: 1,
    notes: 'Graduation announcement and stage',
    provenance: 'Official Website',
  },
]

function formatCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Generates a complete RFC 4180 CSV string with header row and realistic sample data.
 */
export function generateCsvTemplate(
  mode: ImportMode,
  entityType: EntityType,
  options?: { includeSampleRows?: boolean },
): string {
  const specs = importColumnSpecs(mode, entityType)
  const required = specs.filter((spec) => spec.required)
  const optional = specs.filter((spec) => !spec.required)
  const orderedSpecs = [...required, ...optional]
  const headerLine = orderedSpecs.map((spec) => spec.key).join(',')

  if (options?.includeSampleRows === false) {
    return headerLine
  }

  const sampleRows: Record<string, unknown>[] =
    mode === 'relationships'
      ? SAMPLE_RELATIONSHIPS
      : SAMPLE_RECORDS_BY_ENTITY_TYPE[entityType] ?? [
          {
            canonicalName: `Sample ${ENTITY_TYPE_LABELS[entityType] ?? entityType}`,
            entityType,
            slug: `sample-${entityType.toLowerCase().replace(/_/g, '-')}`,
            summary: `A sample ${ENTITY_TYPE_LABELS[entityType] ?? entityType} record for the archive.`,
            isPublished: true,
            prominence: 50,
            provenance: 'Official Website',
          },
        ]

  const dataLines = sampleRows.map((row) =>
    orderedSpecs
      .map((spec) => {
        const direct = row[spec.key]
        if (direct !== undefined) return formatCsvCell(direct)
        const bare = spec.key.replace(/^attributes\./, '')
        const fromBare = row[bare]
        if (fromBare !== undefined) return formatCsvCell(fromBare)
        return ''
      })
      .join(','),
  )

  return [headerLine, ...dataLines].join('\r\n')
}

/**
 * Generates a formatted JSON template string with sample data.
 */
export function generateJsonTemplate(mode: ImportMode, entityType: EntityType): string {
  if (mode === 'relationships') {
    return JSON.stringify(SAMPLE_RELATIONSHIPS, null, 2)
  }

  const samples = SAMPLE_RECORDS_BY_ENTITY_TYPE[entityType] ?? [
    {
      canonicalName: `Sample ${ENTITY_TYPE_LABELS[entityType] ?? entityType}`,
      entityType,
      slug: `sample-${entityType.toLowerCase().replace(/_/g, '-')}`,
      summary: `A sample ${ENTITY_TYPE_LABELS[entityType] ?? entityType} record.`,
      isPublished: true,
      prominence: 50,
      provenance: 'Official Website',
    },
  ]

  return JSON.stringify(samples, null, 2)
}

/**
 * Returns a human-friendly filename for downloaded templates.
 */
export function getTemplateFilename(
  mode: ImportMode,
  entityType: EntityType,
  format: ImportFormat = 'csv',
): string {
  const ext = format === 'json' ? 'json' : 'csv'
  if (mode === 'relationships') {
    return `jkt48-relationships-template.${ext}`
  }
  const typeSlug = entityType.toLowerCase().replace(/_/g, '-')
  return `jkt48-${typeSlug}-template.${ext}`
}

export type TemplatePreset = {
  id: string
  label: string
  description: string
  mode: ImportMode
  entityType: EntityType
  category: 'records' | 'relationships'
}

export const POPULAR_TEMPLATES: TemplatePreset[] = [
  {
    id: 'members',
    label: 'Members',
    description: 'Stage name, birth date, blood type, status, jikoshoukai',
    mode: 'entities',
    entityType: 'MEMBER' as EntityType,
    category: 'records',
  },
  {
    id: 'songs',
    label: 'Songs',
    description: 'Title, song type, original title, duration, lyricist, composer',
    mode: 'entities',
    entityType: 'SONG' as EntityType,
    category: 'records',
  },
  {
    id: 'singles-albums',
    label: 'Singles & Albums',
    description: 'Release type, catalogue number, track count, label',
    mode: 'entities',
    entityType: 'ALBUM' as EntityType,
    category: 'records',
  },
  {
    id: 'teams',
    label: 'Teams & Sub-units',
    description: 'Team code, color hex, formed date, catchphrase',
    mode: 'entities',
    entityType: 'TEAM' as EntityType,
    category: 'records',
  },
  {
    id: 'generations',
    label: 'Generations',
    description: 'Generation number, member count, debut date',
    mode: 'entities',
    entityType: 'GENERATION' as EntityType,
    category: 'records',
  },
  {
    id: 'setlists',
    label: 'Theater Setlists',
    description: 'Stage name, revision, song count, theater venue',
    mode: 'entities',
    entityType: 'SETLIST' as EntityType,
    category: 'records',
  },
  {
    id: 'concerts',
    label: 'Concerts',
    description: 'Tour name, held date, venue, city, attendance',
    mode: 'entities',
    entityType: 'CONCERT' as EntityType,
    category: 'records',
  },
  {
    id: 'relationships',
    label: 'Relationships & Graph Edges',
    description: 'MEMBER_OF, BELONGS_TO_GENERATION, CENTER_OF, GRADUATED_AT',
    mode: 'relationships',
    entityType: 'MEMBER' as EntityType,
    category: 'relationships',
  },
]

