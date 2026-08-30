'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckboxField, Field, Select, Textarea } from '@/components/ui/field'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableNumber,
  TableRow,
} from '@/components/ui/table'
import {
  CONFLICT_POLICIES,
  CONFLICT_POLICY_LABELS,
  IMPORT_FORMAT_LABELS,
  IMPORT_FORMATS,
  IMPORT_MODE_LABELS,
  IMPORT_MODES,
  MAX_IMPORT_ROWS,
  importColumnSpecs,
  importTemplateHeader,
} from '@/domain/bulk-import'
import { IDLE_IMPORT_STATE } from '@/lib/import-state'
import { cn } from '@/lib/utils'

import type { ImportState } from '@/lib/import-state'
import type { ImportFormat, ImportMode } from '@/domain/bulk-import'
import type { EntityType } from '@/generated/prisma/enums'
import type { BadgeProps } from '@/components/ui/badge'
import type { BulkImportReport, RowOutcome } from '@/server/services/bulk-import'

/**
 * The bulk import console (PRD §14, §26).
 *
 * A Client Component for two reasons beyond `useActionState`. First, the column
 * reference has to follow the mode and record-type pickers immediately — an
 * operator picking "Songs" needs to see that `releasedAt` is now a column, and a
 * server round trip to learn that would make the pickers feel like navigation.
 * `importColumnSpecs` is pure domain code with no database behind it, so the
 * browser can answer that itself.
 *
 * Second, the commit is gated on a *fresh* check. Editing the payload marks the
 * report stale and disables the import button until the check is re-run. The
 * server re-plans from scratch either way, so a stale preview could never cause a
 * wrong write — but it could cause a surprising one, and being surprised by five
 * hundred rows is a bad afternoon.
 */

const OUTCOME_TONE: Record<RowOutcome, NonNullable<BadgeProps['tone']>> = {
  created: 'sage',
  updated: 'indigo',
  skipped: 'neutral',
  failed: 'accent',
  deferred: 'ochre',
}

const OUTCOME_LABEL: Record<RowOutcome, string> = {
  created: 'create',
  updated: 'update',
  skipped: 'skip',
  failed: 'error',
  deferred: 'deferred',
}

const COUNT_ORDER: RowOutcome[] = ['created', 'updated', 'skipped', 'deferred', 'failed']

const GROUP_LABELS = {
  record: 'Identity',
  details: 'Type-specific columns',
  edge: 'Edge',
} as const

type BulkImportFormProps = {
  entityTypes: { value: EntityType; label: string }[]
  defaultEntityType: EntityType
  /** Registered sources, so provenance can be cited by name rather than by id. */
  sources: { id: string; name: string }[]
  action: (state: ImportState, formData: FormData) => Promise<ImportState>
}

export function BulkImportForm({
  entityTypes,
  defaultEntityType,
  sources,
  action,
}: BulkImportFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE_IMPORT_STATE)

  const [mode, setMode] = useState<ImportMode>('entities')
  const [format, setFormat] = useState<ImportFormat>('csv')
  const [entityType, setEntityType] = useState<EntityType>(defaultEntityType)
  const [copied, setCopied] = useState(false)

  /*
   * Which report the operator has since edited past.
   *
   * Staleness is derived rather than stored: an edit records the report it
   * invalidated, and the next result is a different object, so it is fresh by
   * identity. Tracking a boolean instead would need an effect to clear it on every
   * new result — cascading renders to compute something already knowable.
   */
  const [invalidated, setInvalidated] = useState<BulkImportReport | null>(null)

  const specs = importColumnSpecs(mode, entityType)
  const template = importTemplateHeader(mode, entityType)
  const report = state.report
  const stale = report !== null && invalidated === report
  const hasFailures = report ? report.counts.failed > 0 : false
  const canCommit = report !== null && !stale && !report.committed

  async function copyTemplate() {
    try {
      await navigator.clipboard.writeText(template)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused outright; the header is selectable text
      // either way, so there is nothing to recover from and nothing to report.
    }
  }

  const groups = (['record', 'details', 'edge'] as const)
    .map((group) => ({ group, columns: specs.filter((spec) => spec.group === group) }))
    .filter((entry) => entry.columns.length > 0)

  return (
    <div className="space-y-10">
      <form action={formAction} className="space-y-8" onChange={() => setInvalidated(report)}>
        {/* ------------------------------------------------------------- shape */}
        <fieldset className="space-y-4">
          <legend className="eyebrow border-b border-rule pb-2">What is being imported</legend>

          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Field
              htmlFor="mode"
              label="Payload"
              hint="Records are the nodes; relationships are the edges between them."
            >
              <Select
                id="mode"
                name="mode"
                value={mode}
                onChange={(event) => setMode(event.target.value as ImportMode)}
              >
                {IMPORT_MODES.map((value) => (
                  <option key={value} value={value}>
                    {IMPORT_MODE_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              htmlFor="format"
              label="Format"
              hint="CSV, tab-separated and semicolon-separated are all read; the delimiter is detected."
            >
              <Select
                id="format"
                name="format"
                value={format}
                onChange={(event) => setFormat(event.target.value as ImportFormat)}
              >
                {IMPORT_FORMATS.map((value) => (
                  <option key={value} value={value}>
                    {IMPORT_FORMAT_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>

            {mode === 'entities' ? (
              <Field
                htmlFor="entityType"
                label="Record type"
                hint="Assumed for every row. A row may override it with its own type column."
              >
                <Select
                  id="entityType"
                  name="entityType"
                  value={entityType}
                  onChange={(event) => setEntityType(event.target.value as EntityType)}
                >
                  {entityTypes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <input type="hidden" name="entityType" value={entityType} />
            )}

            <Field
              htmlFor="conflictPolicy"
              label="When a row already exists"
              hint={
                mode === 'entities'
                  ? 'Matched on slug — the one in the sheet, or the one derived from the name.'
                  : 'Matched on source, type, target and start date together.'
              }
            >
              <Select id="conflictPolicy" name="conflictPolicy" defaultValue="skip">
                {CONFLICT_POLICIES.map((value) => (
                  <option key={value} value={value}>
                    {CONFLICT_POLICY_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </fieldset>

        {/* ----------------------------------------------------------- columns */}
        <fieldset className="space-y-4">
          <legend className="eyebrow border-b border-rule pb-2">Columns</legend>

          <div className="space-y-2">
            <p className="text-sm leading-relaxed text-ink-muted">
              Header names are matched loosely — case, spaces, underscores and common synonyms all
              resolve, so <code className="font-mono text-xs">Stage Name</code>,{' '}
              <code className="font-mono text-xs">stage_name</code> and{' '}
              <code className="font-mono text-xs">stageName</code> are the same column. Anything
              unrecognised is reported back rather than silently dropped. An empty cell means “not
              provided”, never “clear this field”.
            </p>

            <div className="flex flex-wrap items-center gap-2 border border-rule bg-ground-sunk px-3 py-2">
              <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-xs text-ink">
                {template}
              </code>
              <Button type="button" variant="ghost" size="sm" onClick={copyTemplate}>
                {copied ? 'Copied' : 'Copy header'}
              </Button>
            </div>
          </div>

          {groups.map(({ group, columns }) => (
            <div key={group} className="space-y-1">
              <p className="eyebrow text-ink-faint">{GROUP_LABELS[group]}</p>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader className="w-52">Column</TableHeader>
                    <TableHeader>Meaning</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {columns.map((spec) => (
                    <TableRow key={spec.key}>
                      <TableCell className="align-top">
                        <code className="font-mono text-xs text-ink">{spec.key}</code>
                        {spec.required ? (
                          <Badge tone="accent" className="ml-2">
                            required
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top text-sm text-ink-muted">
                        {spec.label}
                        {spec.hint ? (
                          <span className="block text-xs text-ink-faint">{spec.hint}</span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}

          {sources.length > 0 ? (
            <p className="text-xs leading-relaxed text-ink-faint">
              <span className="font-medium text-ink-muted">Citing a source:</span> the{' '}
              <code className="font-mono">provenance</code> column takes a registered source by
              name — {sources.slice(0, 4).map((source) => source.name).join(', ')}
              {sources.length > 4 ? `, and ${sources.length - 4} more` : ''}. An unrecognised name
              fails its row rather than importing the record uncited.
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-ink-faint">
              No sources are registered yet, so leave the{' '}
              <code className="font-mono">provenance</code> column out. Register them under Sources
              first if these rows should carry a citation.
            </p>
          )}
        </fieldset>

        {/* ----------------------------------------------------------- payload */}
        <fieldset className="space-y-4">
          <legend className="eyebrow border-b border-rule pb-2">Payload</legend>

          <Field
            htmlFor="file"
            label="File"
            hint={`Optional. A .csv, .tsv or .json file, up to ${MAX_IMPORT_ROWS} rows. Chosen file wins over pasted text.`}
          >
            <input
              id="file"
              name="file"
              type="file"
              accept=".csv,.tsv,.txt,.json,text/csv,application/json"
              className="block w-full text-sm text-ink-muted file:mr-3 file:cursor-pointer file:border file:border-rule file:bg-ground-sunk file:px-3 file:py-1.5 file:font-mono file:text-xs file:text-ink hover:file:bg-ground"
            />
          </Field>

          <Field
            htmlFor="text"
            label="Or paste the rows"
            hint={
              format === 'csv'
                ? 'First line is the header. Quoted cells may contain the delimiter and line breaks.'
                : 'An array of objects, or { "entities": [...], "relationships": [...] } to import both at once.'
            }
          >
            <Textarea
              id="text"
              name="text"
              rows={12}
              spellCheck={false}
              className="font-mono text-xs"
              placeholder={format === 'csv' ? template : '[\n  { }\n]'}
            />
          </Field>

          <CheckboxField
            id="allowPartial"
            name="allowPartial"
            label="Import the valid rows even if some rows fail"
            hint="Off by default: a batch that does not fully validate writes nothing, so there is no half-imported sheet to unpick."
          />
        </fieldset>

        <div className="flex flex-wrap items-center gap-2 border-t border-rule-strong pt-5">
          <Button type="submit" name="intent" value="preview" variant="default" disabled={pending}>
            {pending ? 'Working…' : 'Check without importing'}
          </Button>
          <Button
            type="submit"
            name="intent"
            value="commit"
            variant="accent"
            disabled={pending || !canCommit}
          >
            Import
          </Button>

          <p className="text-xs text-ink-faint">
            {report === null
              ? 'Check the payload first — importing is enabled once it has been read.'
              : stale
                ? 'The payload changed. Check it again to import.'
                : report.committed
                  ? 'This batch has been imported.'
                  : hasFailures && report.counts.created + report.counts.updated === 0
                    ? 'Nothing in this batch would be written.'
                    : 'Ready to import.'}
          </p>
        </div>
      </form>

      {state.message ? (
        <p
          role="status"
          className={cn(
            'border-l-2 px-4 py-2.5 text-sm leading-relaxed text-ink',
            state.status === 'error'
              ? 'border-accent bg-accent-soft'
              : state.status === 'committed'
                ? 'border-sage bg-sage-soft'
                : 'border-rule-strong bg-ground-sunk',
          )}
        >
          {state.message}
        </p>
      ) : null}

      {report ? <ImportReport report={report} stale={stale} /> : null}
    </div>
  )
}

function ImportReport({
  report,
  stale,
}: {
  report: NonNullable<ImportState['report']>
  stale: boolean
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule-strong pb-2">
        <h2 className="eyebrow">
          {report.committed ? 'Imported' : 'Dry run'} · {IMPORT_MODE_LABELS[report.mode]}
        </h2>
        <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {COUNT_ORDER.filter((outcome) => report.counts[outcome] > 0).map((outcome) => (
            <div key={outcome} className="flex items-baseline gap-1.5">
              <dt className="font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
                {OUTCOME_LABEL[outcome]}
              </dt>
              <dd className="font-mono text-sm tabular-nums text-ink">{report.counts[outcome]}</dd>
            </div>
          ))}
        </dl>
      </div>

      {stale ? (
        <p className="text-xs text-ink-faint">
          The payload has changed since this report was produced.
        </p>
      ) : null}

      {report.ignoredColumns.length > 0 ? (
        <p className="border-l-2 border-ochre bg-ochre-soft px-4 py-2.5 text-sm leading-relaxed text-ink">
          <span className="font-medium">Columns not recognised, and therefore ignored:</span>{' '}
          {report.ignoredColumns.map((column) => (
            <code key={column} className="mr-2 font-mono text-xs">
              {column}
            </code>
          ))}
          <span className="mt-1 block text-xs text-ink-muted">
            Usually a spelling to fix. A team or generation column belongs in a relationships
            payload instead — those are edges, not fields on a record.
          </span>
        </p>
      ) : null}

      {report.rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No rows were found in the payload.</p>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader className="w-14 text-right">Line</TableHeader>
              <TableHeader className="w-24">Outcome</TableHeader>
              <TableHeader>Row</TableHeader>
              <TableHeader>Notes</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {report.rows.map((row, index) => (
              <TableRow key={`${row.kind}-${row.line}-${index}`}>
                <TableNumber>{row.line}</TableNumber>
                <TableCell className="align-top">
                  <Badge tone={OUTCOME_TONE[row.outcome]}>{OUTCOME_LABEL[row.outcome]}</Badge>
                </TableCell>
                <TableCell className="align-top">
                  {row.href ? (
                    <Link
                      href={row.href}
                      className="font-medium text-ink-strong transition-colors hover:text-accent"
                    >
                      {row.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-ink">{row.label}</span>
                  )}
                  {row.detail ? (
                    <span className="block font-mono text-catalog text-ink-faint">
                      {row.detail}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="align-top text-sm text-ink-muted">
                  {row.message ? <span className="block">{row.message}</span> : null}
                  {row.errors.length > 0 ? (
                    <ul className="mt-0.5 space-y-0.5">
                      {row.errors.map((error) => (
                        <li key={error} className="text-xs text-accent">
                          {error}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {!row.message && row.errors.length === 0 ? (
                    <span className="text-ink-faint">—</span>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
