import type { Metadata } from 'next'

import { FormBanner } from '@/components/admin/admin-chrome'
import { PageShell, Section, SectionHeading } from '@/components/archive/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { DIFFICULTY_PROFILES } from '@/domain/difficulty'
import { GAME_TYPE_LABELS } from '@/domain/game-definitions'
import { humanizeEnum } from '@/domain/labels'
import { Difficulty, EntityType, GameType } from '@/generated/prisma/enums'
import { requireAdmin } from '@/lib/auth/session'
import { getGameDefinitions, getRelationshipTypes } from '@/server/services/admin-config'
import { saveGameDefinitionAction, toggleGameActiveAction } from './actions'

export const metadata: Metadata = {
  title: 'Games configuration',
}

/**
 * `/admin/games` (PRD §5, §6, §19, §25).
 *
 * Game definitions are rows, not code: scoring values, clue counts, hop counts,
 * and required relationship types are all configurable without a redeploy.
 *
 * Difficulty represents cognitive complexity (direct fact through multi-hop reasoning),
 * NOT simply a shorter timer (§6.3).
 *
 * Games are deactivated, never deleted, so past player sessions remain intact.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

const GAME_TYPES = Object.values(GameType)
const DIFFICULTIES = Object.values(Difficulty)
const ENTITY_TYPES = Object.values(EntityType)

export default async function AdminGamesPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  await requireAdmin()
  const query = await searchParams
  const [definitions, relationshipTypes] = await Promise.all([
    getGameDefinitions(),
    getRelationshipTypes(),
  ])

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        as="h1"
        eyebrow={`${definitions.length} game profiles`}
        title="Game Definitions & Scoring"
        lead="Scoring models and difficulty parameters are configurable rows (§6). Difficulty determines cognitive complexity (direct fact → multi-hop reasoning), not timer length (§6.3)."
      />

      <FormBanner error={first(query.error)} notice={first(query.notice)} />

      {/* ------------------------------------------------ Cognitive complexity callout */}
      <section className="rounded-sm border border-rule bg-surface p-4 text-xs leading-relaxed text-ink-muted space-y-2">
        <h2 className="font-display text-sm font-semibold text-ink-strong">
          Difficulty Principle (§P4, §6.3)
        </h2>
        <p>
          Difficulty in JKT48 Archive Lab is <strong>cognitive complexity</strong>: Easy asks for a direct fact,
          Medium combines multiple facts, Hard asks for a relationship chain, Expert uses indirect pivots, and
          Nightmare requires multi-hop historical deductions.
        </p>
        <p className="text-accent font-medium">
          ⚠️ Do NOT shorten time limits to create higher difficulty tiers. A harder tier asks a harder question.
        </p>
      </section>

      {/* ------------------------------------------------ Existing Game Definitions */}
      <Section className="space-y-8">
        <SectionHeading
          as="h2"
          eyebrow="Tuneable engines"
          title="Game profiles"
          lead="Games are deactivated rather than deleted to avoid orphaning historical player sessions (§26)."
        />

        <div className="space-y-8">
          {definitions.map((def) => {
            const diffInfo = DIFFICULTY_PROFILES[def.difficulty]
            const requiredTypeIds = new Set(
              def.relationshipTypes.filter((r) => r.isRequired).map((r) => r.id),
            )
            const enrichingTypeIds = new Set(
              def.relationshipTypes.filter((r) => !r.isRequired).map((r) => r.id),
            )

            return (
              <div
                key={def.id}
                className="space-y-6 rounded-sm border border-rule bg-surface p-6"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-lg font-semibold text-ink-strong">
                        {def.name}
                      </h3>
                      {def.isActive ? (
                        <Badge tone="sage">Active</Badge>
                      ) : (
                        <Badge tone="neutral">Inactive</Badge>
                      )}
                      <Badge tone="indigo">{diffInfo?.label ?? def.difficulty}</Badge>
                    </div>
                    <p className="font-mono text-catalog text-ink-faint mt-1">
                      Code: {def.code} · Type: {GAME_TYPE_LABELS[def.gameType] ?? humanizeEnum(def.gameType)} · Target: {def.targetEntityType}
                    </p>
                  </div>

                  <form action={toggleGameActiveAction}>
                    <input type="hidden" name="id" value={def.id} />
                    <input
                      type="hidden"
                      name="isActive"
                      value={def.isActive ? 'false' : 'true'}
                    />
                    <Button
                      type="submit"
                      variant={def.isActive ? 'outline' : 'accent'}
                      size="sm"
                    >
                      {def.isActive ? 'Deactivate game' : 'Activate game'}
                    </Button>
                  </form>
                </div>

                <form action={saveGameDefinitionAction} className="space-y-6">
                  <input type="hidden" name="id" value={def.id} />
                  <input type="hidden" name="isActive" value={def.isActive ? 'true' : 'false'} />

                  {/* Basic facts */}
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field htmlFor={`name-${def.id}`} label="Display name" required>
                      <Input
                        id={`name-${def.id}`}
                        name="name"
                        defaultValue={def.name}
                        required
                      />
                    </Field>

                    <Field htmlFor={`code-${def.id}`} label="Code identifier" required>
                      <Input
                        id={`code-${def.id}`}
                        name="code"
                        defaultValue={def.code}
                        required
                      />
                    </Field>

                    <Field htmlFor={`order-${def.id}`} label="Display order">
                      <Input
                        id={`order-${def.id}`}
                        name="displayOrder"
                        type="number"
                        defaultValue={def.displayOrder}
                      />
                    </Field>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field htmlFor={`gameType-${def.id}`} label="Game engine type" required>
                      <Select
                        id={`gameType-${def.id}`}
                        name="gameType"
                        defaultValue={def.gameType}
                      >
                        {GAME_TYPES.map((gt) => (
                          <option key={gt} value={gt}>
                            {GAME_TYPE_LABELS[gt] ?? gt}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <Field htmlFor={`diff-${def.id}`} label="Cognitive difficulty" required>
                      <Select
                        id={`diff-${def.id}`}
                        name="difficulty"
                        defaultValue={def.difficulty}
                      >
                        {DIFFICULTIES.map((d) => (
                          <option key={d} value={d}>
                            {d} ({DIFFICULTY_PROFILES[d]?.cognition ?? ''})
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <Field htmlFor={`targetType-${def.id}`} label="Target entity type" required>
                      <Select
                        id={`targetType-${def.id}`}
                        name="targetEntityType"
                        defaultValue={def.targetEntityType}
                      >
                        {ENTITY_TYPES.map((et) => (
                          <option key={et} value={et}>
                            {et}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  {/* Generator parameters */}
                  <div className="rounded-sm border border-rule bg-ground-sunk p-4 space-y-4">
                    <h4 className="font-display text-sm font-semibold text-ink-strong">
                      Generator parameters
                    </h4>
                    <div className="grid gap-4 sm:grid-cols-5">
                      <Field htmlFor={`roundCount-${def.id}`} label="Rounds per game">
                        <Input
                          id={`roundCount-${def.id}`}
                          name="roundCount"
                          type="number"
                          min={1}
                          defaultValue={def.roundCount}
                        />
                      </Field>

                      <Field htmlFor={`clueCount-${def.id}`} label="Clues shown">
                        <Input
                          id={`clueCount-${def.id}`}
                          name="clueCount"
                          type="number"
                          min={1}
                          defaultValue={def.clueCount}
                        />
                      </Field>

                      <Field htmlFor={`hopCount-${def.id}`} label="Graph hops">
                        <Input
                          id={`hopCount-${def.id}`}
                          name="hopCount"
                          type="number"
                          min={1}
                          max={5}
                          defaultValue={def.hopCount}
                        />
                      </Field>

                      <Field htmlFor={`optionCount-${def.id}`} label="Option choices">
                        <Input
                          id={`optionCount-${def.id}`}
                          name="optionCount"
                          type="number"
                          min={2}
                          defaultValue={def.optionCount}
                        />
                      </Field>

                      <Field
                        htmlFor={`timeLimit-${def.id}`}
                        label="Time limit (sec)"
                        hint="Optional safety clock only"
                      >
                        <Input
                          id={`timeLimit-${def.id}`}
                          name="timeLimitSec"
                          type="number"
                          defaultValue={def.timeLimitSec ?? ''}
                          placeholder="No limit"
                        />
                      </Field>
                    </div>
                  </div>

                  {/* Scoring */}
                  <div className="rounded-sm border border-rule bg-ground-sunk p-4 space-y-4">
                    <h4 className="font-display text-sm font-semibold text-ink-strong">
                      Scoring model (§6)
                    </h4>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field htmlFor={`ptsCorrect-${def.id}`} label="Points: Correct answer">
                        <Input
                          id={`ptsCorrect-${def.id}`}
                          name="pointsCorrect"
                          type="number"
                          defaultValue={def.pointsCorrect}
                        />
                      </Field>

                      <Field htmlFor={`ptsRel-${def.id}`} label="Points: Correct relationship">
                        <Input
                          id={`ptsRel-${def.id}`}
                          name="pointsRelationshipCorrect"
                          type="number"
                          defaultValue={def.pointsRelationshipCorrect}
                        />
                      </Field>

                      <Field htmlFor={`ptsIncorrect-${def.id}`} label="Points: Incorrect penalty">
                        <Input
                          id={`ptsIncorrect-${def.id}`}
                          name="pointsIncorrect"
                          type="number"
                          defaultValue={def.pointsIncorrect}
                        />
                      </Field>
                    </div>
                  </div>

                  {/* Relationship vocabulary requirements */}
                  <div className="space-y-4">
                    <h4 className="font-display text-sm font-semibold text-ink-strong">
                      Required & Enriching Relationship Types
                    </h4>
                    <p className="text-xs text-ink-muted">
                      Select which relationships candidates must possess to generate a challenge. Types with 0 usage cannot generate rounds.
                    </p>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        htmlFor={`reqTypes-${def.id}`}
                        label="Required relationship types (gating candidates)"
                      >
                        <select
                          id={`reqTypes-${def.id}`}
                          name="requiredRelationshipTypeIds"
                          multiple
                          size={6}
                          defaultValue={[...requiredTypeIds]}
                          className="w-full rounded-sm border border-rule-strong bg-surface-raised p-2 font-mono text-xs text-ink"
                        >
                          {relationshipTypes.map((rt) => (
                            <option key={rt.id} value={rt.id}>
                              {rt.name} ({rt.code}) — {rt.usageCount} edges
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field
                        htmlFor={`enrTypes-${def.id}`}
                        label="Enriching relationship types (bonus clues)"
                      >
                        <select
                          id={`enrTypes-${def.id}`}
                          name="enrichingRelationshipTypeIds"
                          multiple
                          size={6}
                          defaultValue={[...enrichingTypeIds]}
                          className="w-full rounded-sm border border-rule-strong bg-surface-raised p-2 font-mono text-xs text-ink"
                        >
                          {relationshipTypes.map((rt) => (
                            <option key={rt.id} value={rt.id}>
                              {rt.name} ({rt.code}) — {rt.usageCount} edges
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button type="submit" variant="outline" size="sm">
                      Save game parameters
                    </Button>
                  </div>
                </form>
              </div>
            )
          })}
        </div>
      </Section>
    </PageShell>
  )
}
