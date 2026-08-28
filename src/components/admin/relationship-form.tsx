'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { fieldError, IDLE_FORM_STATE } from '@/lib/form-state'

import type { AdminFormState } from '@/lib/form-state'
import type {
  EntityPickerOption,
  RelationshipFormDefaults,
  RelationshipTypeOption,
} from '@/server/queries/admin'
import type { EntityRef } from '@/types/graph'

/**
 * The relationship editor component (PRD §10, §16, §25).
 *
 * Relationships are first-class domain objects with temporal validity (`validFrom`/`validTo`),
 * directional orientation, weight and provenance source.
 */

type RelationshipFormProps = {
  defaults: RelationshipFormDefaults
  types: RelationshipTypeOption[]
  sources: { id: string; name: string }[]
  sourceEntity: EntityRef | null
  targetEntity: EntityRef | null
  sourcePickerOptions?: EntityPickerOption[]
  targetPickerOptions?: EntityPickerOption[]
  action: (state: AdminFormState, formData: FormData) => Promise<AdminFormState>
  submitLabel: string
  cancelHref: string
}

export function RelationshipForm({
  defaults,
  types,
  sources,
  sourceEntity,
  targetEntity,
  action,
  submitLabel,
  cancelHref,
}: RelationshipFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE_FORM_STATE)
  const [selectedTypeId, setSelectedTypeId] = useState(defaults.relationshipTypeId || (types[0]?.id ?? ''))

  const selectedType = types.find((t) => t.id === selectedTypeId)
  const isTemporal = selectedType ? selectedType.isTemporal : true
  const err = (field: string) => fieldError(state, field)

  return (
    <form action={formAction} className="space-y-8">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <input
        type="hidden"
        name="sourceEntityId"
        value={defaults.sourceEntityId}
      />
      <input
        type="hidden"
        name="targetEntityId"
        value={defaults.targetEntityId}
      />

      {state.message && !state.fieldErrors ? (
        <div
          role="alert"
          className="border-l-2 border-accent bg-accent-soft px-4 py-2.5 text-sm text-ink"
        >
          {state.message}
        </div>
      ) : null}

      {/* -------------------------------------------------- Endpoints review */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2 rounded-sm border border-rule bg-surface p-4">
          <p className="eyebrow">Source record (Subject)</p>
          {sourceEntity ? (
            <div className="space-y-1">
              <p className="font-display text-base font-semibold text-ink-strong">
                {sourceEntity.canonicalName}
              </p>
              <p className="font-mono text-catalog text-ink-muted">
                {sourceEntity.slug}
              </p>
            </div>
          ) : (
            <p className="text-xs text-accent">
              No source record selected. Search above to choose one.
            </p>
          )}
          {err('sourceEntityId') ? (
            <p className="text-xs font-medium text-accent" role="alert">
              {err('sourceEntityId')}
            </p>
          ) : null}
        </div>

        <div className="space-y-2 rounded-sm border border-rule bg-surface p-4">
          <p className="eyebrow">Target record (Object)</p>
          {targetEntity ? (
            <div className="space-y-1">
              <p className="font-display text-base font-semibold text-ink-strong">
                {targetEntity.canonicalName}
              </p>
              <p className="font-mono text-catalog text-ink-muted">
                {targetEntity.slug}
              </p>
            </div>
          ) : (
            <p className="text-xs text-accent">
              No target record selected. Search above to choose one.
            </p>
          )}
          {err('targetEntityId') ? (
            <p className="text-xs font-medium text-accent" role="alert">
              {err('targetEntityId')}
            </p>
          ) : null}
        </div>
      </div>

      {/* ------------------------------------------------ Relationship Type */}
      <section className="space-y-4">
        <Field
          htmlFor="rel-type"
          label="Relationship type"
          hint="Defines the predicate linking source to target in the knowledge graph (§10)."
          error={err('relationshipTypeId')}
          required
        >
          <Select
            id="rel-type"
            name="relationshipTypeId"
            value={selectedTypeId}
            onChange={(e) => setSelectedTypeId(e.target.value)}
          >
            <option value="">Select relationship type...</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name} ({type.code})
              </option>
            ))}
          </Select>
        </Field>

        {selectedType ? (
          <div className="rounded-sm border border-rule bg-ground-sunk p-3 text-xs leading-relaxed text-ink-muted space-y-1">
            <p>
              <strong className="text-ink">Reading:</strong>{' '}
              <span className="font-mono">{sourceEntity?.canonicalName ?? '[Source]'}</span>{' '}
              <span className="font-semibold text-ink">{selectedType.name}</span>{' '}
              <span className="font-mono">{targetEntity?.canonicalName ?? '[Target]'}</span>
            </p>
            {selectedType.inverseName ? (
              <p>
                <strong className="text-ink">Inverse reading:</strong>{' '}
                <span className="font-mono">{targetEntity?.canonicalName ?? '[Target]'}</span>{' '}
                <span className="font-semibold text-ink">{selectedType.inverseName}</span>{' '}
                <span className="font-mono">{sourceEntity?.canonicalName ?? '[Source]'}</span>
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ------------------------------------------------ Temporal Validity */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-sm font-semibold text-ink-strong">
            Temporal validity (§11)
          </h2>
          <p className="text-xs text-ink-muted">
            {isTemporal
              ? 'Dates define when this relationship was historically true. Open-ended relationships leave “Valid to” empty.'
              : 'This relationship type is non-temporal (e.g. parent company, creator). Date inputs are disabled.'}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            htmlFor="rel-valid-from"
            label="Valid from"
            hint={isTemporal ? 'Start date (YYYY-MM-DD)' : 'Not applicable for non-temporal types'}
            error={err('validFrom')}
          >
            <Input
              id="rel-valid-from"
              name="validFrom"
              type="date"
              defaultValue={defaults.validFrom}
              disabled={!isTemporal}
            />
          </Field>

          <Field
            htmlFor="rel-valid-to"
            label="Valid to"
            hint={isTemporal ? 'End date (leave empty if ongoing / still true)' : 'Not applicable'}
            error={err('validTo')}
          >
            <Input
              id="rel-valid-to"
              name="validTo"
              type="date"
              defaultValue={defaults.validTo}
              disabled={!isTemporal}
            />
          </Field>
        </div>
      </section>

      {/* ------------------------------------------------ Provenance & Meta */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Field
          htmlFor="rel-provenance"
          label="Source / Provenance (§13)"
          hint="Attribution for where this fact was catalogued from."
          error={err('provenanceId')}
        >
          <Select
            id="rel-provenance"
            name="provenanceId"
            defaultValue={defaults.provenanceId}
          >
            <option value="">No source assigned</option>
            {sources.map((src) => (
              <option key={src.id} value={src.id}>
                {src.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          htmlFor="rel-weight"
          label="Graph weight"
          hint="Relative importance for pathfinding and puzzle scoring (default 1)."
          error={err('weight')}
        >
          <Input
            id="rel-weight"
            name="weight"
            type="number"
            min={1}
            max={100}
            defaultValue={defaults.weight}
          />
        </Field>
      </section>

      {/* ------------------------------------------------------------ Notes */}
      <Field
        htmlFor="rel-notes"
        label="Curator notes"
        hint="Internal research remarks or notes on uncertainty."
        error={err('notes')}
      >
        <Textarea
          id="rel-notes"
          name="notes"
          defaultValue={defaults.notes}
          placeholder="e.g. Graduated at the 6th anniversary concert, official announcement on showroom."
        />
      </Field>

      {/* --------------------------------------------------- Submit actions */}
      <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-rule">
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? 'Saving...' : submitLabel}
        </Button>
        <Button asChild variant="outline">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
