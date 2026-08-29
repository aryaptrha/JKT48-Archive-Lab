'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { collectionForEntityType, entityHref } from '@/domain/entity-taxonomy'
import { requireAdmin } from '@/lib/auth/session'
import { errorState } from '@/lib/form-state'
import { createEntity, deleteEntity, setEntityPublished, updateEntity } from '@/server/services/entity-admin'
import { actorFromProfile } from '@/server/services/audit'
import { revalidateArchiveGraph } from '@/server/cache/tags'

import type { EntityType } from '@/generated/prisma/enums'
import type { AdminFormState } from '@/lib/form-state'

/**
 * Server Actions for the record CMS (PRD §19, §35).
 *
 * `requireAdmin()` runs first in every export here, independently of the layout
 * above `/admin` — a Server Action is its own POST endpoint and nothing about
 * being rendered inside an authorized page protects it (§35). The write itself
 * is delegated to `server/services/entity-admin`, which is the only place that
 * validates, mutates and audits; nothing here touches Prisma directly (§26).
 *
 * `saveEntityAction` is the long editor's action and reports back through
 * `AdminFormState` so a rejected save keeps the operator's input. The other two
 * are short, single-purpose submits that redirect with `?notice=` / `?error=`
 * for `FormBanner` to render, per the convention in `admin-chrome.tsx`.
 */

function withQuery(path: string, key: 'notice' | 'error', value: string): string {
  const params = new URLSearchParams({ [key]: value })
  return `${path}?${params.toString()}`
}

/**
 * Every `attributes.<field>` key posted by `EntityForm`, nested under one
 * `attributes` object — the shape `entityInputSchema` (and `createEntity` /
 * `updateEntity` beneath it) expects. A checkbox that was left unticked posts no
 * key at all, which the attribute schemas already treat as "false" (see
 * `domain/validation.ts`'s `bool` coercion), so there is nothing to default here.
 */
function readAttributes(formData: FormData): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('attributes.')) continue
    attributes[key.slice('attributes.'.length)] = typeof value === 'string' ? value : ''
  }
  return attributes
}

/**
 * Public and admin paths that go stale after a write.
 *
 * A record's public page and the collection it is browsed under both depend on
 * `entityType` + `slug`, which is exactly what the create/update/publish forms
 * already carry as hidden inputs — so this never needs a second read of the row
 * it just wrote.
 *
 * The tag drop is what covers everything a path list cannot name: the home page's
 * rails and counts, this record's appearance in another record's related strip,
 * every cached browse page of its collection. Without it a curator's edit would
 * sit behind the cache window on pages they never thought to look at.
 */
function revalidateEntityPaths(id: string, entityType: string, slug: string) {
  revalidateArchiveGraph()
  revalidatePath('/admin/entities')
  revalidatePath(`/admin/entities/${id}`)

  const typedEntityType = entityType as EntityType
  const collection = collectionForEntityType(typedEntityType)
  if (collection) revalidatePath(`/explore/${collection.slug}`)
  if (slug) revalidatePath(entityHref({ entityType: typedEntityType, slug }))
}

/**
 * The record editor's save action (`EntityForm`'s `action` prop).
 *
 * `entityType` is read once and dispatched to `updateEntity` when an `id` was
 * posted, `createEntity` otherwise — the same branch `EntityForm`'s hidden `id`
 * input implies. Nothing here decides *which* fields are valid; that is
 * `entityInputSchema` and the per-table attribute schema, enforced inside the
 * service (§35).
 */
export async function saveEntityAction(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const profile = await requireAdmin()
  const actor = actorFromProfile(profile)

  const id = formData.get('id')
  const entityType = formData.get('entityType')

  const input = {
    entityType,
    canonicalName: formData.get('canonicalName'),
    slug: formData.get('slug'),
    aliases: formData.get('aliases'),
    summary: formData.get('summary'),
    description: formData.get('description'),
    imageUrl: formData.get('imageUrl'),
    activeFrom: formData.get('activeFrom'),
    activeTo: formData.get('activeTo'),
    prominence: formData.get('prominence'),
    isPublished: formData.get('isPublished') === 'true',
    provenanceId: formData.get('provenanceId'),
    notes: formData.get('notes'),
    attributes: readAttributes(formData),
  }

  const isEdit = typeof id === 'string' && id.length > 0
  const result = isEdit ? await updateEntity(id, input, actor) : await createEntity(input, actor)

  if (!result.ok) return errorState(result)

  if (typeof entityType === 'string') {
    revalidateEntityPaths(result.data.id, entityType, result.data.slug)
  }

  const notice = isEdit
    ? `Saved changes to “${result.data.canonicalName}”.`
    : `Created “${result.data.canonicalName}”. Add its relationships next — generation, team, credits and appearances all live in the relationship editor (§10).`

  redirect(withQuery(`/admin/entities/${result.data.id}`, 'notice', notice))
}

/**
 * Publish or unpublish, from the toggle on the editor page.
 *
 * The form posts the *target* state directly as `isPublished` rather than
 * asking this action to infer a toggle from the current row — two buttons, two
 * unambiguous intents, no read-then-flip race between two curators.
 */
export async function setPublishedAction(formData: FormData): Promise<void> {
  const profile = await requireAdmin()
  const actor = actorFromProfile(profile)

  const id = formData.get('id')
  if (typeof id !== 'string' || id.length === 0) {
    redirect(withQuery('/admin/entities', 'error', 'Missing record id.'))
  }

  const entityType = formData.get('entityType')
  const slug = formData.get('slug')
  const isPublished = formData.get('isPublished') === 'true'

  const result = await setEntityPublished(id, isPublished, actor)

  if (!result.ok) {
    redirect(withQuery(`/admin/entities/${id}`, 'error', result.message))
  }

  if (typeof entityType === 'string' && typeof slug === 'string') {
    revalidateEntityPaths(id, entityType, slug)
  }

  const notice = isPublished
    ? `Published “${result.data.canonicalName}”. It is now visible to readers and eligible for games.`
    : `Unpublished “${result.data.canonicalName}”. It is now invisible to readers and excluded from every game.`

  redirect(withQuery(`/admin/entities/${id}`, 'notice', notice))
}

/**
 * Permanent delete, from the editor's `DangerZone`.
 *
 * `expectedEdgeCount` is the number the confirmation showed the operator, posted
 * back as a hidden input; `deleteEntity` refuses the write if the live count has
 * since moved, which is what keeps that confirmation honest (§35).
 */
export async function deleteEntityAction(formData: FormData): Promise<void> {
  const profile = await requireAdmin()
  const actor = actorFromProfile(profile)

  const id = formData.get('id')
  if (typeof id !== 'string' || id.length === 0) {
    redirect(withQuery('/admin/entities', 'error', 'Missing record id.'))
  }

  const expectedRaw = formData.get('expectedEdgeCount')
  const expectedEdgeCount =
    typeof expectedRaw === 'string' && expectedRaw.length > 0 ? Number(expectedRaw) : undefined

  const result = await deleteEntity(id, actor, expectedEdgeCount)

  if (!result.ok) {
    redirect(withQuery(`/admin/entities/${id}`, 'error', result.message))
  }

  revalidateArchiveGraph()
  revalidatePath('/admin/entities')
  const entityType = formData.get('entityType')
  if (typeof entityType === 'string') {
    const collection = collectionForEntityType(entityType as EntityType)
    if (collection) revalidatePath(`/explore/${collection.slug}`)
  }

  const canonicalName = formData.get('canonicalName')
  const name = typeof canonicalName === 'string' && canonicalName ? canonicalName : 'Record'
  const relationships = result.data.deletedEdges
  const notice = `Deleted “${name}” and ${relationships} relationship${relationships === 1 ? '' : 's'}.`

  redirect(withQuery('/admin/entities', 'notice', notice))
}
