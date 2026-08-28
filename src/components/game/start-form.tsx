import { humanizeEnum } from '@/domain/labels'
import { startDatedGameAction, startGameAction } from '@/app/games/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import type { GameView } from '@/server/queries/games'
import type { EntityRef } from '@/types/graph'

/**
 * The form that starts a session.
 *
 * A real `<form>` posting to a Server Action, which is why the difficulty is a
 * radio group or a select rather than a set of buttons wired to a click handler:
 * the choice has to survive to the server, and the page has to work before
 * hydration.
 *
 * The rungs come from the definition rows. Nothing here knows how many there are
 * or what they are called, so seeding a sixth difficulty adds a sixth radio
 * (PRD §6).
 */

export function StartGameForm({
  game,
  scope,
  scopeDate,
  returnTo,
  layout = 'full',
}: {
  game: GameView
  scope?: EntityRef | null
  scopeDate?: string | null
  /** Where a failure should send the player back to. */
  returnTo: string
  layout?: 'full' | 'compact'
}) {
  if (!game.hasRungs) {
    return (
      <p className="rounded-sm border border-dashed border-rule-strong bg-ground-sunk px-3 py-2.5 text-xs leading-relaxed text-ink-muted">
        {game.isPlanned
          ? 'Planned for V1.1. The definition is seeded but inactive, so nothing here is pretending to be playable.'
          : 'No active definitions for this game yet. A curator can activate one in the admin games settings.'}
      </p>
    )
  }

  const action = game.acceptsDate ? startDatedGameAction : startGameAction
  const firstRung = game.rungs[0]

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="returnTo" value={returnTo} />
      {scope ? <input type="hidden" name="scopeEntityId" value={scope.id} /> : null}

      {layout === 'compact' ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field
            htmlFor={`rung-${game.slug}`}
            label="Difficulty"
            className="min-w-40 flex-1"
          >
            <Select
              id={`rung-${game.slug}`}
              name="definitionId"
              defaultValue={firstRung?.definitionId}
            >
              {game.rungs.map((rung) => (
                <option key={rung.definitionId} value={rung.definitionId}>
                  {rung.label} · {rung.cognition}
                </option>
              ))}
            </Select>
          </Field>
          {game.acceptsDate ? (
            <Field htmlFor={`date-${game.slug}`} label="As of">
              <Input
                id={`date-${game.slug}`}
                name="scopeDate"
                type="date"
                defaultValue={scopeDate ?? undefined}
                className="w-40"
              />
            </Field>
          ) : null}
          <Button type="submit" variant="outline">
            Begin
          </Button>
        </div>
      ) : (
        <>
          <fieldset className="space-y-2">
            <legend className="eyebrow pb-1">Choose a rung</legend>
            {game.rungs.map((rung, index) => (
              <label
                key={rung.definitionId}
                className="flex cursor-pointer items-start gap-3 rounded-sm border border-rule bg-surface px-3.5 py-3 transition-colors hover:border-ink-faint has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
              >
                <input
                  type="radio"
                  name="definitionId"
                  value={rung.definitionId}
                  defaultChecked={index === 0}
                  className="mt-1 size-4 accent-[var(--color-accent)]"
                />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{rung.label}</span>
                    <Badge tone="quiet">{rung.cognition}</Badge>
                  </span>
                  <span className="block font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
                    {rung.rounds} {rung.rounds === 1 ? 'round' : 'rounds'} ·{' '}
                    {humanizeEnum(rung.answerMode)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {game.acceptsDate ? (
            <Field
              htmlFor={`date-${game.slug}`}
              label="Play as of"
              hint="Every question resolves against this date. Leave it blank to play against today."
            >
              <Input
                id={`date-${game.slug}`}
                name="scopeDate"
                type="date"
                defaultValue={scopeDate ?? undefined}
                className="w-48"
              />
            </Field>
          ) : null}

          {scope ? (
            <p className="text-xs text-ink-muted">
              Scoped to <span className="font-medium text-ink">{scope.canonicalName}</span>.
            </p>
          ) : null}

          <Button type="submit" variant="accent" size="lg">
            Start playing
          </Button>
        </>
      )}
    </form>
  )
}
