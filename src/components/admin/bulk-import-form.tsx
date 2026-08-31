'use client'

import Link from 'next/link'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileCheck,
  FileSpreadsheet,
  Info,
  Layers,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { useActionState, useId, useMemo, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field'
import { Panel, PanelBody, PanelFooter, PanelHeader, PanelTitle } from '@/components/ui/panel'
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
  MAX_IMPORT_ROWS,
  POPULAR_TEMPLATES,
  generateCsvTemplate,
  generateJsonTemplate,
  getTemplateFilename,
  importColumnSpecs,
  importTemplateHeader,
} from '@/domain/bulk-import'
import {
  ENTITY_CATEGORY_LABELS,
  categoryForEntityType,
} from '@/domain/entity-taxonomy'
import { EntityCategory } from '@/generated/prisma/enums'
import { IDLE_IMPORT_STATE } from '@/lib/import-state'
import { cn } from '@/lib/utils'

import type { BadgeProps } from '@/components/ui/badge'
import type { ImportFormat, ImportMode, TemplatePreset } from '@/domain/bulk-import'
import type { EntityType } from '@/generated/prisma/enums'
import type { ImportState } from '@/lib/import-state'
import type { BulkImportReport, RowOutcome } from '@/server/services/bulk-import'

/**
 * The enhanced bulk import console (PRD §14, §26).
 *
 * Provides a structured, editorial-grade interface for bulk creating and updating
 * archive records and graph relationships with downloadable CSV/JSON templates,
 * interactive column dictionaries, drag-and-drop file upload, and report filtering.
 */

const OUTCOME_TONE: Record<RowOutcome, NonNullable<BadgeProps['tone']>> = {
  created: 'sage',
  updated: 'indigo',
  skipped: 'neutral',
  failed: 'accent',
  deferred: 'ochre',
}

const OUTCOME_LABEL: Record<RowOutcome, string> = {
  created: 'Create',
  updated: 'Update',
  skipped: 'Skip',
  failed: 'Error',
  deferred: 'Deferred',
}

const COUNT_ORDER: RowOutcome[] = ['created', 'updated', 'skipped', 'deferred', 'failed']

const GROUP_LABELS = {
  record: 'Identity & Base Columns',
  details: 'Type-Specific Details',
  edge: 'Relationship Edge Columns',
} as const

function downloadTextFile(filename: string, content: string, mimeType = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

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
  const [showDictionary, setShowDictionary] = useState(false)
  const [columnSearch, setColumnSearch] = useState('')
  const [columnGroupFilter, setColumnGroupFilter] = useState<'all' | 'required' | 'optional'>('all')
  const [showPresetsMenu, setShowPresetsMenu] = useState(false)

  // Drag & drop and textarea management
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [pastedText, setPastedText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropzoneId = useId()

  /*
   * Staleness detection: editing the payload marks the report stale
   * and disables commit until a fresh preview is executed.
   */
  const [invalidated, setInvalidated] = useState<BulkImportReport | null>(null)

  const specs = importColumnSpecs(mode, entityType)
  const templateHeader = importTemplateHeader(mode, entityType)
  const report = state.report
  const stale = report !== null && invalidated === report
  const hasFailures = report ? report.counts.failed > 0 : false

  // Group entity types by category for structured optgroups
  const categorizedEntityTypes = useMemo(() => {
    const categories = Object.values(EntityCategory)
    return categories
      .map((cat) => ({
        category: cat,
        label: ENTITY_CATEGORY_LABELS[cat] ?? cat,
        items: entityTypes.filter((et) => categoryForEntityType(et.value) === cat),
      }))
      .filter((group) => group.items.length > 0)
  }, [entityTypes])

  // Filter column specs based on search and requirement
  const filteredSpecs = useMemo(() => {
    return specs.filter((spec) => {
      if (columnGroupFilter === 'required' && !spec.required) return false
      if (columnGroupFilter === 'optional' && spec.required) return false
      if (!columnSearch.trim()) return true
      const q = columnSearch.toLowerCase()
      return (
        spec.key.toLowerCase().includes(q) ||
        spec.label.toLowerCase().includes(q) ||
        (spec.hint && spec.hint.toLowerCase().includes(q))
      )
    })
  }, [specs, columnSearch, columnGroupFilter])

  const filteredGroups = useMemo(() => {
    return (['record', 'details', 'edge'] as const)
      .map((group) => ({ group, columns: filteredSpecs.filter((spec) => spec.group === group) }))
      .filter((entry) => entry.columns.length > 0)
  }, [filteredSpecs])

  // Download template handlers
  const handleDownloadCsv = (includeSample = true) => {
    const content = generateCsvTemplate(mode, entityType, { includeSampleRows: includeSample })
    const filename = getTemplateFilename(mode, entityType, 'csv')
    downloadTextFile(filename, content, 'text/csv;charset=utf-8;')
  }

  const handleDownloadJson = () => {
    const content = generateJsonTemplate(mode, entityType)
    const filename = getTemplateFilename(mode, entityType, 'json')
    downloadTextFile(filename, content, 'application/json;charset=utf-8;')
  }

  const handleDownloadPreset = (preset: TemplatePreset) => {
    const content = generateCsvTemplate(preset.mode, preset.entityType, { includeSampleRows: true })
    const filename = getTemplateFilename(preset.mode, preset.entityType, 'csv')
    downloadTextFile(filename, content, 'text/csv;charset=utf-8;')
  }

  const handleApplyPreset = (preset: TemplatePreset) => {
    setMode(preset.mode)
    setEntityType(preset.entityType)
    const sample =
      format === 'json'
        ? generateJsonTemplate(preset.mode, preset.entityType)
        : generateCsvTemplate(preset.mode, preset.entityType, { includeSampleRows: true })
    setPastedText(sample)
    if (textareaRef.current) {
      textareaRef.current.value = sample
    }
    setInvalidated(report)
    setShowPresetsMenu(false)
  }

  const handleCopyHeader = async () => {
    try {
      await navigator.clipboard.writeText(templateHeader)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Ignore clipboard failure
    }
  }

  const handleLoadSampleToEditor = () => {
    const sample =
      format === 'json'
        ? generateJsonTemplate(mode, entityType)
        : generateCsvTemplate(mode, entityType, { includeSampleRows: true })
    setPastedText(sample)
    if (textareaRef.current) {
      textareaRef.current.value = sample
    }
    setInvalidated(report)
  }

  const handleClearEditor = () => {
    setPastedText('')
    if (textareaRef.current) {
      textareaRef.current.value = ''
    }
    setInvalidated(report)
  }

  const processSelectedFile = async (file: File) => {
    try {
      const text = await file.text()
      setSelectedFile({ name: file.name, size: file.size })
      setPastedText(text)
      if (textareaRef.current) {
        textareaRef.current.value = text
      }
      if (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json') {
        setFormat('json')
      } else {
        setFormat('csv')
      }
      setInvalidated(report)
    } catch {
      setSelectedFile({ name: file.name, size: file.size })
      setInvalidated(report)
    }
  }

  // File dropzone handlers
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      await processSelectedFile(file)
    } else {
      setSelectedFile(null)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      if (fileInputRef.current) {
        try {
          const dt = new DataTransfer()
          dt.items.add(file)
          fileInputRef.current.files = dt.files
        } catch {
          // Fallback if DataTransfer fails
        }
      }
      await processSelectedFile(file)
    }
  }

  const handleRemoveFile = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    setSelectedFile(null)
    setInvalidated(report)
  }

  const estimatedRowCount = useMemo(() => {
    if (!pastedText.trim()) return 0
    if (format === 'json') {
      try {
        const parsed = JSON.parse(pastedText)
        if (Array.isArray(parsed)) return parsed.length
        if (typeof parsed === 'object' && parsed !== null) {
          const arr = (parsed as { entities?: unknown[]; rows?: unknown[] }).entities || (parsed as { rows?: unknown[] }).rows || []
          return Array.isArray(arr) ? arr.length : 1
        }
      } catch {
        return 0
      }
    }
    const lines = pastedText.split(/\r?\n/).filter((l) => l.trim().length > 0)
    return Math.max(0, lines.length - 1)
  }, [pastedText, format])

  const hasPayload = Boolean(selectedFile) || pastedText.trim().length > 0

  return (
    <div className="space-y-10">
      {/* ----------------------------------------------------------- Quick Templates Toolbar */}
      <Panel className="border-rule bg-ground-sunk">
        <PanelBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="size-4 text-accent" />
                <h2 className="text-sm font-semibold text-ink-strong">Downloadable Templates</h2>
                <Badge tone="sage">Ready for Excel & Sheets</Badge>
              </div>
              <p className="text-xs text-ink-muted">
                Download pre-formatted .CSV or .JSON templates with headers and sample data, or pick a preset.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={() => (format === 'json' ? handleDownloadJson() : handleDownloadCsv(true))}
                className="shadow-xs"
              >
                <Download className="size-3.5" />
                <span>Download {format === 'json' ? '.JSON' : '.CSV'} Template</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyHeader}
                title="Copy standard CSV column headers to clipboard"
              >
                {copied ? <Check className="size-3.5 text-sage" /> : <Copy className="size-3.5" />}
                <span>{copied ? 'Headers Copied!' : 'Copy Headers'}</span>
              </Button>

              <div className="relative">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPresetsMenu((prev) => !prev)}
                  className="border border-rule-strong bg-surface"
                >
                  <Layers className="size-3.5" />
                  <span>Preset Templates</span>
                  <ChevronDown className="size-3 text-ink-faint" />
                </Button>

                {showPresetsMenu ? (
                  <div
                    className="absolute right-0 z-30 mt-1.5 w-72 origin-top-right rounded-sm border border-rule-strong bg-surface-raised p-2 shadow-overlay"
                    role="menu"
                  >
                    <div className="border-b border-rule px-2 pb-1.5 pt-1">
                      <p className="eyebrow text-ink-faint">Popular Presets</p>
                    </div>
                    <ul className="divide-y divide-rule/60 py-1 text-xs">
                      {POPULAR_TEMPLATES.map((preset) => (
                        <li key={preset.id} className="group flex items-center justify-between p-2 hover:bg-ground-sunk">
                          <div className="min-w-0 pr-2">
                            <p className="font-medium text-ink-strong">{preset.label}</p>
                            <p className="truncate text-catalog text-ink-faint">{preset.description}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDownloadPreset(preset)}
                              title="Download .CSV file"
                              className="rounded-xs p-1 text-ink-muted hover:bg-surface hover:text-accent"
                            >
                              <Download className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplyPreset(preset)}
                              title="Load into workbench"
                              className="rounded-xs p-1 text-ink-muted hover:bg-surface hover:text-ink-strong"
                            >
                              <ArrowRight className="size-3.5" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Quick Header Bar */}
          <div className="flex flex-wrap items-center gap-2 rounded-sm border border-rule bg-surface px-3 py-2">
            <span className="font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
              Header ({specs.length} cols):
            </span>
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-xs text-ink">
              {templateHeader}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowDictionary((prev) => !prev)}
              className="h-6 px-2 text-xs"
            >
              {showDictionary ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              <span>{showDictionary ? 'Hide Dictionary' : 'View Dictionary'}</span>
            </Button>
          </div>
        </PanelBody>
      </Panel>

      {/* ----------------------------------------------------------- Main Form */}
      <form
        action={formAction}
        encType="multipart/form-data"
        className="space-y-8"
        onChange={() => setInvalidated(report)}
      >
        {/* Step 1: Configuration */}
        <Panel>
          <PanelHeader>
            <div>
              <p className="eyebrow">Step 1</p>
              <PanelTitle>Scope & Configuration</PanelTitle>
            </div>
            <Badge tone="neutral">
              {mode === 'entities' ? `${entityTypes.find((e) => e.value === entityType)?.label ?? 'Record'} Type` : 'Relationship Edges'}
            </Badge>
          </PanelHeader>

          <PanelBody className="space-y-6">
            {/* Mode Selector Pill Buttons */}
            <div className="space-y-2">
              <label className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted">
                Import Mode
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('entities')
                    setInvalidated(report)
                  }}
                  className={cn(
                    'flex items-start gap-3 rounded-sm border p-3.5 text-left transition-all',
                    mode === 'entities'
                      ? 'border-accent bg-accent-soft/40 shadow-xs'
                      : 'border-rule bg-surface hover:border-rule-strong hover:bg-ground-sunk',
                  )}
                >
                  <div
                    className={cn(
                      'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
                      mode === 'entities' ? 'border-accent bg-accent text-accent-ink' : 'border-rule-strong bg-ground',
                    )}
                  >
                    {mode === 'entities' ? <Check className="size-3" /> : null}
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-ink-strong">Archive Records (Nodes)</p>
                    <p className="text-xs text-ink-muted">
                      Import members, songs, releases, theater setlists, concerts, and other entities.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('relationships')
                    setInvalidated(report)
                  }}
                  className={cn(
                    'flex items-start gap-3 rounded-sm border p-3.5 text-left transition-all',
                    mode === 'relationships'
                      ? 'border-accent bg-accent-soft/40 shadow-xs'
                      : 'border-rule bg-surface hover:border-rule-strong hover:bg-ground-sunk',
                  )}
                >
                  <div
                    className={cn(
                      'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
                      mode === 'relationships' ? 'border-accent bg-accent text-accent-ink' : 'border-rule-strong bg-ground',
                    )}
                  >
                    {mode === 'relationships' ? <Check className="size-3" /> : null}
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-ink-strong">Relationships (Edges)</p>
                    <p className="text-xs text-ink-muted">
                      Connect entities together: team rosters, generation cohorts, song centers, and graduations.
                    </p>
                  </div>
                </button>
              </div>
              <input type="hidden" name="mode" value={mode} />
            </div>

            {/* Config Selectors Grid */}
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
              {mode === 'entities' ? (
                <Field
                  htmlFor="entityType"
                  label="Target Record Type"
                  hint="Assumed for all rows unless overridden per row."
                >
                  <Select
                    id="entityType"
                    name="entityType"
                    value={entityType}
                    onChange={(event) => {
                      setEntityType(event.target.value as EntityType)
                      setInvalidated(report)
                    }}
                  >
                    {categorizedEntityTypes.map((group) => (
                      <optgroup key={group.category} label={group.label}>
                        {group.items.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </Field>
              ) : (
                <input type="hidden" name="entityType" value={entityType} />
              )}

              <Field
                htmlFor="format"
                label="File / Text Format"
                hint="CSV, TSV, or structured JSON array."
              >
                <Select
                  id="format"
                  name="format"
                  value={format}
                  onChange={(event) => {
                    setFormat(event.target.value as ImportFormat)
                    setInvalidated(report)
                  }}
                >
                  {IMPORT_FORMATS.map((value) => (
                    <option key={value} value={value}>
                      {IMPORT_FORMAT_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                htmlFor="conflictPolicy"
                label="Conflict Policy"
                hint={
                  mode === 'entities'
                    ? 'Matched on slug (derived from name or provided).'
                    : 'Matched on source, type, target & start date.'
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
          </PanelBody>
        </Panel>

        {/* Step 2: Interactive Column Dictionary (Toggleable / Searchable) */}
        {showDictionary ? (
          <Panel className="border-rule">
            <PanelHeader className="bg-ground-sunk">
              <div>
                <p className="eyebrow">Column Dictionary</p>
                <PanelTitle>Schema Definition for {mode === 'entities' ? entityTypes.find((e) => e.value === entityType)?.label : 'Relationships'}</PanelTitle>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownloadCsv(false)}
                  title="Download empty .CSV with only header columns"
                >
                  <Download className="size-3" />
                  <span>Download Blank CSV</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDictionary(false)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </PanelHeader>

            <PanelBody className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
                <div className="relative w-72">
                  <Search className="absolute left-2.5 top-2.5 size-3.5 text-ink-faint" />
                  <Input
                    placeholder="Search column names, labels or hints…"
                    value={columnSearch}
                    onChange={(e) => setColumnSearch(e.target.value)}
                    className="h-8 pl-8 text-xs"
                  />
                  {columnSearch ? (
                    <button
                      type="button"
                      onClick={() => setColumnSearch('')}
                      className="absolute right-2.5 top-2 text-ink-faint hover:text-ink"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </div>

                <div className="flex items-center gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setColumnGroupFilter('all')}
                    className={cn(
                      'rounded-xs px-2 py-1 font-mono text-catalog uppercase tracking-[0.08em]',
                      columnGroupFilter === 'all'
                        ? 'bg-ink-strong text-ground'
                        : 'bg-ground-sunk text-ink-muted hover:text-ink',
                    )}
                  >
                    All ({specs.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setColumnGroupFilter('required')}
                    className={cn(
                      'rounded-xs px-2 py-1 font-mono text-catalog uppercase tracking-[0.08em]',
                      columnGroupFilter === 'required'
                        ? 'bg-ink-strong text-ground'
                        : 'bg-ground-sunk text-ink-muted hover:text-ink',
                    )}
                  >
                    Required ({specs.filter((s) => s.required).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setColumnGroupFilter('optional')}
                    className={cn(
                      'rounded-xs px-2 py-1 font-mono text-catalog uppercase tracking-[0.08em]',
                      columnGroupFilter === 'optional'
                        ? 'bg-ink-strong text-ground'
                        : 'bg-ground-sunk text-ink-muted hover:text-ink',
                    )}
                  >
                    Optional ({specs.filter((s) => !s.required).length})
                  </button>
                </div>
              </div>

              {filteredGroups.length === 0 ? (
                <p className="py-6 text-center text-xs text-ink-muted">
                  No columns match “{columnSearch}”.
                </p>
              ) : (
                filteredGroups.map(({ group, columns }) => (
                  <div key={group} className="space-y-1">
                    <p className="eyebrow text-ink-faint">{GROUP_LABELS[group]}</p>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableHeader className="w-56">Column Key</TableHeader>
                          <TableHeader className="w-40">Label</TableHeader>
                          <TableHeader>Description & Guidance</TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {columns.map((spec) => (
                          <TableRow key={spec.key}>
                            <TableCell className="align-top font-mono text-xs text-ink-strong">
                              <code>{spec.key}</code>
                              {spec.required ? (
                                <Badge tone="accent" className="ml-2">
                                  required
                                </Badge>
                              ) : (
                                <Badge tone="neutral" className="ml-2">
                                  optional
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="align-top text-xs font-medium text-ink">
                              {spec.label}
                            </TableCell>
                            <TableCell className="align-top text-xs text-ink-muted">
                              {spec.hint ? <span>{spec.hint}</span> : <span className="text-ink-faint">—</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))
              )}

              {/* Provenance guidance callout */}
              {sources.length > 0 ? (
                <div className="rounded-sm border border-rule bg-ground-sunk p-3 text-xs leading-relaxed text-ink-muted">
                  <span className="font-semibold text-ink">Citing Sources:</span> The{' '}
                  <code className="font-mono text-xs">provenance</code> column matches registered sources by name:
                  <div className="mt-1 flex flex-wrap gap-1">
                    {sources.map((s) => (
                      <span key={s.id} className="rounded-xs border border-rule bg-surface px-1.5 py-0.5 font-mono text-catalog text-ink">
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </PanelBody>
          </Panel>
        ) : null}

        {/* Step 3: Payload Input Workbench */}
        <Panel>
          <PanelHeader>
            <div>
              <p className="eyebrow">Step 2</p>
              <PanelTitle>Data Payload</PanelTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleLoadSampleToEditor}
                className="text-xs"
                title="Fill editor with ready-to-test sample rows"
              >
                <Sparkles className="size-3.5 text-accent" />
                <span>Load Sample Data</span>
              </Button>
              {pastedText ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearEditor}
                  className="text-xs text-ink-faint hover:text-accent"
                >
                  <Trash2 className="size-3.5" />
                  <span>Clear</span>
                </Button>
              ) : null}
            </div>
          </PanelHeader>

          <PanelBody className="space-y-6">
            {/* File Upload Dropzone */}
            <div className="space-y-2">
              <label htmlFor={dropzoneId} className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted">
                Upload File (.csv, .tsv, .json)
              </label>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  'relative flex flex-col items-center justify-center rounded-sm border-2 border-dashed p-6 text-center transition-colors',
                  isDragging ? 'border-accent bg-accent-soft/30' : 'border-rule hover:border-rule-strong bg-ground-sunk/50',
                )}
              >
                <input
                  ref={fileInputRef}
                  id={dropzoneId}
                  name="file"
                  type="file"
                  accept=".csv,.tsv,.txt,.json,text/csv,application/json"
                  onChange={handleFileChange}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />

                {selectedFile ? (
                  <div className="z-10 flex flex-wrap items-center gap-3 rounded-sm border border-rule bg-surface px-4 py-2.5 shadow-xs">
                    <FileCheck className="size-5 text-sage shrink-0" />
                    <div className="text-left">
                      <p className="text-xs font-semibold text-ink-strong">{selectedFile.name}</p>
                      <p className="font-mono text-catalog text-ink-faint">
                        {formatFileSize(selectedFile.size)} · Loaded into workbench ({estimatedRowCount} data {estimatedRowCount === 1 ? 'row' : 'rows'})
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          fileInputRef.current?.click()
                        }}
                        className="h-7 px-2 text-xs"
                      >
                        Change File
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveFile()
                        }}
                        className="h-7 px-2 text-xs text-accent hover:bg-accent-soft"
                      >
                        <X className="size-3.5" />
                        <span>Remove</span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-surface text-ink-muted shadow-xs">
                      <UploadCloud className="size-5 text-accent" />
                    </div>
                    <p className="text-sm font-medium text-ink">
                      Drag & drop your <span className="font-mono text-xs">.csv</span>, <span className="font-mono text-xs">.tsv</span>, or <span className="font-mono text-xs">.json</span> file here
                    </p>
                    <p className="text-xs text-ink-faint">
                      or click to browse from your computer (up to {MAX_IMPORT_ROWS} rows). File content will be loaded into the workbench.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Textarea Workbench */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="text" className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted">
                  Or Paste / Edit Raw Payload
                </label>
                {pastedText ? (
                  <div className="flex items-center gap-3 font-mono text-catalog text-ink-faint">
                    <span>{estimatedRowCount} data {estimatedRowCount === 1 ? 'row' : 'rows'} detected</span>
                    <span>·</span>
                    <span>{pastedText.length.toLocaleString()} chars</span>
                  </div>
                ) : null}
              </div>

              <Textarea
                ref={textareaRef}
                id="text"
                name="text"
                rows={12}
                value={pastedText}
                onChange={(e) => {
                  setPastedText(e.target.value)
                  setInvalidated(report)
                }}
                spellCheck={false}
                className="font-mono text-xs leading-relaxed"
                placeholder={
                  format === 'csv'
                    ? `${templateHeader}\n\n(Paste spreadsheet rows here, or click 'Load Sample Data' above)`
                    : '[\n  {\n    "canonicalName": "Shani Indira Natio",\n    "entityType": "MEMBER",\n    "stageName": "Shani"\n  }\n]'
                }
              />
            </div>

            {/* Partial import setting */}
            <div className="rounded-sm border border-rule bg-ground-sunk p-3.5">
              <div className="flex items-start gap-3">
                <Checkbox id="allowPartial" name="allowPartial" className="mt-0.5" />
                <div className="space-y-0.5">
                  <label htmlFor="allowPartial" className="block text-sm font-semibold text-ink-strong cursor-pointer">
                    Allow Partial Import
                  </label>
                  <p className="text-xs text-ink-muted leading-relaxed">
                    Import valid rows even if some rows fail validation. Off by default: an invalid batch writes nothing, preventing half-imported data.
                  </p>
                </div>
              </div>
            </div>
          </PanelBody>

          {/* Action Bar Footer */}
          <PanelFooter className="bg-ground-sunk">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                name="intent"
                value="preview"
                variant="default"
                disabled={pending || !hasPayload}
                className="shadow-xs"
              >
                <Search className="size-3.5" />
                <span>{pending ? 'Validating Batch…' : 'Check without importing (Dry Run)'}</span>
              </Button>

              <Button
                type="submit"
                name="intent"
                value="commit"
                variant="accent"
                disabled={pending || !hasPayload || (report !== null && report.committed)}
                className="shadow-xs"
              >
                <Download className="size-3.5 rotate-180" />
                <span>{pending ? 'Importing…' : 'Commit & Import'}</span>
              </Button>
            </div>

            <p className="text-xs text-ink-muted">
              {!hasPayload ? (
                <span>Upload a .csv file or paste data above to enable validation and import.</span>
              ) : report === null ? (
                <span>Ready to validate or import. Dry run is recommended first.</span>
              ) : stale ? (
                <span className="text-ochre font-medium">Payload changed. Re-run check to refresh preview.</span>
              ) : report.committed ? (
                <span className="text-sage font-medium">Batch successfully imported to the archive.</span>
              ) : hasFailures && report.counts.created + report.counts.updated === 0 ? (
                <span className="text-accent font-medium">Validation failed for all rows. Fix errors below before importing.</span>
              ) : (
                <span className="text-sage font-medium">Dry run passed ({report.counts.created} to create, {report.counts.updated} to update). Ready to commit.</span>
              )}
            </p>
          </PanelFooter>
        </Panel>
      </form>

      {/* State Notification Banner */}
      {state.message ? (
        <div
          role="status"
          className={cn(
            'flex items-start gap-3 rounded-sm border-l-4 p-4 text-sm leading-relaxed text-ink shadow-xs',
            state.status === 'error'
              ? 'border-accent bg-accent-soft/80'
              : state.status === 'committed'
                ? 'border-sage bg-sage-soft/80'
                : 'border-rule-strong bg-surface',
          )}
        >
          {state.status === 'error' ? (
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-accent" />
          ) : state.status === 'committed' ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-sage" />
          ) : (
            <Info className="mt-0.5 size-5 shrink-0 text-ink-muted" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink-strong">
              {state.status === 'error'
                ? 'Validation Error'
                : state.status === 'committed'
                  ? 'Import Completed'
                  : 'Check Results'}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">{state.message}</p>
          </div>
        </div>
      ) : null}

      {/* ----------------------------------------------------------- Results Report */}
      {report ? <EnhancedImportReport report={report} stale={stale} /> : null}
    </div>
  )
}

function EnhancedImportReport({
  report,
  stale,
}: {
  report: NonNullable<ImportState['report']>
  stale: boolean
}) {
  const [filterOutcome, setFilterOutcome] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const filteredRows = useMemo(() => {
    return report.rows.filter((row) => {
      if (filterOutcome !== 'all' && row.outcome !== filterOutcome) return false
      if (!searchTerm.trim()) return true
      const q = searchTerm.toLowerCase()
      return (
        row.label.toLowerCase().includes(q) ||
        (row.detail && row.detail.toLowerCase().includes(q)) ||
        (row.message && row.message.toLowerCase().includes(q)) ||
        row.errors.some((err) => err.toLowerCase().includes(q)) ||
        String(row.line).includes(q)
      )
    })
  }, [report.rows, filterOutcome, searchTerm])

  return (
    <Panel className="border-rule">
      <PanelHeader className="bg-ground-sunk">
        <div>
          <p className="eyebrow">{report.committed ? 'Committed Batch' : 'Dry Run Preview'}</p>
          <PanelTitle>
            Import Report · {IMPORT_MODE_LABELS[report.mode]} ({report.rows.length} {report.rows.length === 1 ? 'row' : 'rows'})
          </PanelTitle>
        </div>

        {stale ? (
          <Badge tone="ochre">Payload edited since this check</Badge>
        ) : report.committed ? (
          <Badge tone="sage">Imported</Badge>
        ) : (
          <Badge tone="indigo">Dry Run Only</Badge>
        )}
      </PanelHeader>

      <PanelBody className="space-y-6">
        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {COUNT_ORDER.map((outcome) => {
            const count = report.counts[outcome] ?? 0
            const tone = OUTCOME_TONE[outcome]
            return (
              <button
                key={outcome}
                type="button"
                onClick={() => setFilterOutcome((prev) => (prev === outcome ? 'all' : outcome))}
                className={cn(
                  'flex flex-col justify-between rounded-sm border p-3 text-left transition-all',
                  filterOutcome === outcome
                    ? 'border-ink-strong bg-surface-raised shadow-xs'
                    : 'border-rule bg-ground-sunk hover:border-rule-strong hover:bg-surface',
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
                    {OUTCOME_LABEL[outcome]}
                  </span>
                  <Badge tone={tone} className="text-[10px] uppercase">
                    {outcome}
                  </Badge>
                </div>
                <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-ink-strong">
                  {count}
                </p>
              </button>
            )
          })}
        </div>

        {/* Ignored Columns Warning */}
        {report.ignoredColumns.length > 0 ? (
          <div className="flex items-start gap-3 rounded-sm border-l-4 border-ochre bg-ochre-soft/80 p-3.5 text-xs leading-relaxed text-ink">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-ochre" />
            <div className="space-y-1">
              <p className="font-semibold text-ink-strong">
                Unrecognized columns ignored ({report.ignoredColumns.length}):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {report.ignoredColumns.map((col) => (
                  <code key={col} className="rounded-xs border border-ochre/30 bg-surface px-1.5 py-0.5 font-mono text-catalog text-ink">
                    {col}
                  </code>
                ))}
              </div>
              <p className="text-ink-muted">
                These columns matched no known field and were omitted. Edge properties (like team or generation) belong in relationship mode.
              </p>
            </div>
          </div>
        ) : null}

        {/* Table Search & Filter Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-ink-faint" />
            <Input
              placeholder="Filter report rows, lines, or error text…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2 text-ink-faint hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-mono text-catalog text-ink-faint">Outcome:</span>
            <button
              type="button"
              onClick={() => setFilterOutcome('all')}
              className={cn(
                'rounded-xs px-2 py-0.5 font-mono text-catalog uppercase tracking-[0.08em]',
                filterOutcome === 'all' ? 'bg-ink-strong text-ground' : 'bg-ground-sunk text-ink-muted hover:text-ink',
              )}
            >
              All ({report.rows.length})
            </button>
            {COUNT_ORDER.filter((o) => (report.counts[o] ?? 0) > 0).map((outcome) => (
              <button
                key={outcome}
                type="button"
                onClick={() => setFilterOutcome(outcome)}
                className={cn(
                  'rounded-xs px-2 py-0.5 font-mono text-catalog uppercase tracking-[0.08em]',
                  filterOutcome === outcome
                    ? 'bg-ink-strong text-ground'
                    : 'bg-ground-sunk text-ink-muted hover:text-ink',
                )}
              >
                {OUTCOME_LABEL[outcome]} ({report.counts[outcome]})
              </button>
            ))}
          </div>
        </div>

        {/* Rows Report Table */}
        {filteredRows.length === 0 ? (
          <div className="py-8 text-center text-xs text-ink-muted">
            No rows match the selected filters.
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader className="w-16 text-right">Line</TableHeader>
                <TableHeader className="w-28">Outcome</TableHeader>
                <TableHeader className="w-64">Record / Edge</TableHeader>
                <TableHeader>Validation Notes & Errors</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRows.map((row, idx) => (
                <TableRow key={`${row.kind}-${row.line}-${idx}`} className={row.outcome === 'failed' ? 'bg-accent-soft/20' : undefined}>
                  <TableNumber>{row.line}</TableNumber>
                  <TableCell className="align-top">
                    <Badge tone={OUTCOME_TONE[row.outcome]}>{OUTCOME_LABEL[row.outcome]}</Badge>
                  </TableCell>
                  <TableCell className="align-top">
                    {row.href ? (
                      <Link
                        href={row.href}
                        className="font-medium text-ink-strong underline decoration-rule-strong underline-offset-2 transition-colors hover:text-accent"
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
                  <TableCell className="align-top text-xs text-ink-muted">
                    {row.message ? <span className="block text-ink">{row.message}</span> : null}
                    {row.errors.length > 0 ? (
                      <ul className="mt-1 space-y-1">
                        {row.errors.map((error) => (
                          <li key={error} className="flex items-start gap-1.5 font-medium text-accent">
                            <span aria-hidden>•</span>
                            <span>{error}</span>
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
      </PanelBody>
    </Panel>
  )
}
