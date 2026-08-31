import type { Metadata } from 'next'

import { BulkImportForm } from '@/components/admin/bulk-import-form'
import { PageShell, SectionHeading } from '@/components/archive/section'
import { MAX_IMPORT_ROWS } from '@/domain/bulk-import'
import { ENTITY_TYPE_LABELS } from '@/domain/entity-taxonomy'
import { EntityType } from '@/generated/prisma/enums'
import { requireAdmin } from '@/lib/auth/session'
import { getSources } from '@/server/services/admin-config'

import { runImportAction } from './actions'

export const metadata: Metadata = {
  title: 'Bulk import',
}

/**
 * `/admin/import` — Bulk import (PRD §14, §26).
 *
 * The single-record editors are the right shape for curating one record
 * carefully. They are the wrong shape for a generation of sixteen members and the
 * forty-eight edges that place them, which is the actual unit of work when the
 * archive gains a season — and doing that a field at a time is how a curator ends
 * up with fifteen members and a missing one nobody notices.
 *
 * Records and relationships both, because importing the nodes without the edges
 * would leave a set of disconnected records and a graph that says nothing (§10).
 *
 * Nothing here is a second way into the database. Every row goes through the same
 * validation and the same audited services as the editors, so this page is a
 * faster way to reach them rather than a shortcut past them (§35).
 */

const ENTITY_TYPE_OPTIONS = Object.values(EntityType).map((value) => ({
  value,
  label: ENTITY_TYPE_LABELS[value],
}))

export default async function AdminImportPage() {
  await requireAdmin('/admin/import')
  const sources = await getSources()

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        as="h1"
        eyebrow={`Up to ${MAX_IMPORT_ROWS} rows per batch`}
        title="Bulk import"
        lead="Paste a sheet or upload a file, check what it would do, then commit it. Rows are validated and written through the same services as the record and relationship editors, so each import lands in the audit log row by row."
      />

      <BulkImportForm
        entityTypes={ENTITY_TYPE_OPTIONS}
        defaultEntityType={EntityType.MEMBER}
        sources={sources.map((source) => ({ id: source.id, name: source.name }))}
        action={runImportAction}
      />
    </PageShell>
  )
}
