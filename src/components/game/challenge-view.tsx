import { AnswerMode } from '@/generated/prisma/enums'
import type {
  ChainStep,
  ChallengePrompt,
  ChoiceOption,
  Clue,
  GraphEdgeSlot,
  GraphNodeSlot,
  PlayableChallenge,
  ProfileField,
} from '@/server/services/game-engine'
import { Badge } from '@/components/ui/badge'
import { Input, Select } from '@/components/ui/field'
import { formatDate } from '@/lib/date'

/**
 * The question, as the player sees it (PRD §5, §6.2).
 *
 * Four prompt shapes and four answer modes, kept apart on purpose: a prompt says
 * what is being asked, an answer mode says how it is answered, and the pairing is
 * a property of the definition row rather than of this file. That is why the
 * switch below is over `prompt.kind` and the one under it is over `answerMode`,
 * with no combined branch anywhere.
 *
 * Nothing here can leak an answer. The engine never puts the solution into
 * `PlayableChallenge` — this component could not render it if it tried.
 *
 * Every control is a plain form control inside the page's `<form>`, so a round
 * can be answered before hydration and by a keyboard alone.
 */

export function ChallengeView({ challenge }: { challenge: PlayableChallenge }) {
  return (
    <div className="space-y-6">
      <PromptView prompt={challenge.prompt} />
      <AnswerControls challenge={challenge} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Prompt                                                                     */
/* -------------------------------------------------------------------------- */

function PromptView({ prompt }: { prompt: ChallengePrompt }) {
  switch (prompt.kind) {
    case 'CLUES':
      return (
        <div className="space-y-4">
          <Question text={prompt.question} asOf={prompt.asOf} />
          <ClueList clues={prompt.clues} />
        </div>
      )

    case 'CHAIN':
      return (
        <div className="space-y-4">
          <Question text={prompt.question} asOf={prompt.asOf} />
          <ChainView chain={prompt.chain} />
          {prompt.clues.length > 0 ? <ClueList clues={prompt.clues} /> : null}
        </div>
      )

    case 'PROFILE':
      return (
        <div className="space-y-4">
          <Question text={prompt.question} asOf={null} />
          <div className="rounded-sm border border-rule bg-surface">
            <div className="border-b border-rule px-4 py-2.5">
              <p className="eyebrow">Record</p>
              <p className="font-display text-base font-semibold text-ink-strong">
                {prompt.heading}
              </p>
            </div>
            <dl className="ruled px-4">
              {prompt.fields.map((field) => (
                <ProfileRow key={field.key} field={field} />
              ))}
            </dl>
          </div>
        </div>
      )

    case 'GRAPH':
      return (
        <div className="space-y-4">
          <Question text={prompt.question} asOf={prompt.asOf} />
          <GraphView nodes={prompt.nodes} edges={prompt.edges} />
        </div>
      )
  }
}

function Question({ text, asOf }: { text: string; asOf: string | null }) {
  return (
    <div className="space-y-2">
      {asOf ? (
        <p className="eyebrow">
          {/* The date is part of the question, not decoration: the same question
              has different right answers on different dates (PRD §11). */}
          As of {formatDate(asOf)}
        </p>
      ) : null}
      <h2 className="font-display text-xl leading-snug font-semibold text-ink-strong text-balance sm:text-2xl">
        {text}
      </h2>
    </div>
  )
}

const CLUE_TONE = {
  ATTRIBUTE: 'neutral',
  RELATIONSHIP: 'indigo',
  TEMPORAL: 'sage',
} as const

/**
 * The clues, numbered.
 *
 * They are numbered because a MEDIUM round expects them to be intersected, and
 * "clue 2 plus clue 3" is a thought a player can hold. An unordered bullet list
 * invites reading only the first one.
 */
function ClueList({ clues }: { clues: Clue[] }) {
  if (clues.length === 0) return null

  return (
    <ol className="space-y-2">
      {clues.map((clue, index) => (
        <li
          key={`${clue.label}:${index}`}
          className="flex gap-3 rounded-sm border border-rule bg-surface px-3.5 py-3"
        >
          <span className="font-mono text-catalog tabular-nums text-ink-faint">
            {String(index + 1).padStart(2, '0')}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <Badge tone={CLUE_TONE[clue.kind]}>{clue.label}</Badge>
            <p className="text-sm leading-relaxed text-ink">{clue.text}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

/**
 * An indirect question drawn as a path.
 *
 * "The center of the song whose team's captain was X" is unreadable as a
 * sentence, so it is drawn as the walk it actually is. The unknown position is
 * marked rather than blanked, because a player needs to see *where* in the chain
 * the gap sits (PRD §6.3, EXPERT and NIGHTMARE).
 */
function ChainView({ chain }: { chain: ChainStep[] }) {
  return (
    <ol className="flex flex-wrap items-stretch gap-x-1 gap-y-2">
      {chain.map((step, index) => (
        <li key={index} className="flex items-stretch gap-1">
          {index > 0 ? (
            <span aria-hidden className="self-center px-1 text-ink-faint">
              →
            </span>
          ) : null}
          <div
            className={
              step.isUnknown
                ? 'space-y-0.5 rounded-sm border border-dashed border-accent bg-accent-soft px-3 py-2'
                : 'space-y-0.5 rounded-sm border border-rule bg-surface px-3 py-2'
            }
          >
            <p className="font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
              {step.relationshipLabel}
            </p>
            <p
              className={
                step.isUnknown
                  ? 'text-sm font-semibold text-accent'
                  : 'text-sm font-medium text-ink'
              }
            >
              {step.isUnknown ? '?' : step.entityLabel}
              {step.isUnknown ? <span className="sr-only"> — the answer</span> : null}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function ProfileRow({ field }: { field: ProfileField }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-2.5">
      <dt className="font-mono text-catalog uppercase tracking-[0.08em] text-ink-muted">
        {field.label}
      </dt>
      <dd className="text-sm text-ink">
        {field.isRedacted ? (
          <span
            aria-label="Redacted — you fill this in"
            className="inline-block min-w-24 border-b border-dashed border-accent align-baseline text-accent"
          >
            <span aria-hidden>▁▁▁▁</span>
          </span>
        ) : (
          (field.value ?? '—')
        )}
      </dd>
    </div>
  )
}

/**
 * The graph puzzle, drawn as nodes with the edges written between them.
 *
 * A real force-directed canvas would need JavaScript to be answerable at all; a
 * list of "from — relationship — to" rows is answerable with a keyboard and reads
 * correctly to a screen reader, which matters more than the drawing (PRD §22).
 */
function GraphView({ nodes, edges }: { nodes: GraphNodeSlot[]; edges: GraphEdgeSlot[] }) {
  const byId = new Map(nodes.map((node) => [node.id, node]))

  return (
    <div className="space-y-3 rounded-sm border border-rule bg-surface p-4">
      <p className="eyebrow">The fragment as it survives</p>
      <ul className="space-y-2">
        {edges.map((edge) => {
          const from = byId.get(edge.fromNodeId)
          const to = byId.get(edge.toNodeId)
          return (
            <li
              key={edge.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-rule pb-2 last:border-0 last:pb-0 text-sm"
            >
              <NodeChip node={from} />
              <span
                className={
                  edge.isMissing
                    ? 'rounded-xs border border-dashed border-accent px-1.5 font-mono text-catalog uppercase tracking-[0.08em] text-accent'
                    : 'rounded-xs border border-rule px-1.5 font-mono text-catalog uppercase tracking-[0.08em] text-ink-muted'
                }
              >
                {edge.isMissing ? 'missing' : edge.label}
              </span>
              <NodeChip node={to} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function NodeChip({ node }: { node: GraphNodeSlot | undefined }) {
  if (!node) return <span className="text-ink-faint">—</span>

  return (
    <span
      className={
        node.isUnknown
          ? 'rounded-sm border border-dashed border-accent bg-accent-soft px-2 py-0.5 text-accent'
          : 'rounded-sm border border-rule bg-ground px-2 py-0.5 text-ink'
      }
    >
      {node.isUnknown ? '?' : node.label}
      <span className="ml-1.5 font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
        {node.entityTypeLabel}
      </span>
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Answer controls                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The inputs, named so the Server Action can rebuild a `SubmittedAnswer`.
 *
 * The naming convention is the contract: `option`, `text`, `field.<key>`,
 * `node.<slotId>`, `edge.<slotId>`. It is parsed in one place (the answer action)
 * and validated there against the challenge's own answer mode, so a hand-crafted
 * POST cannot smuggle a different shape past the evaluator.
 */
function AnswerControls({ challenge }: { challenge: PlayableChallenge }) {
  switch (challenge.answerMode) {
    case AnswerMode.MULTIPLE_CHOICE:
      return <OptionList options={challenge.options ?? []} />

    case AnswerMode.TEXT_INPUT:
      return (
        <div className="space-y-1.5">
          <label
            htmlFor="answer-text"
            className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted"
          >
            Your answer
          </label>
          <Input
            id="answer-text"
            name="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="Type the name"
            className="max-w-md text-base"
          />
          <p className="text-xs text-ink-faint">
            Spelling is forgiven where the archive records an alias. Case and spacing never matter.
          </p>
        </div>
      )

    case AnswerMode.FORM_RECONSTRUCTION:
      return <FieldGrid challenge={challenge} />

    case AnswerMode.GRAPH_BUILD:
      return <GraphBuilder challenge={challenge} />
  }
}

function OptionList({ options }: { options: ChoiceOption[] }) {
  if (options.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        This round has no options recorded, which is a generation fault rather than a hard question.
        Abandon the session and start another.
      </p>
    )
  }

  return (
    <fieldset className="space-y-2">
      <legend className="eyebrow pb-1">Choose one</legend>
      {options.map((option, index) => (
        <label
          key={option.id}
          className="flex cursor-pointer items-start gap-3 rounded-sm border border-rule bg-surface px-3.5 py-3 transition-colors hover:border-ink-faint has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
        >
          <input
            type="radio"
            name="option"
            value={option.id}
            required={index === 0}
            className="mt-0.5 size-4 accent-[var(--color-accent)]"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">{option.label}</span>
            {option.detail ? (
              <span className="block text-xs text-ink-faint">{option.detail}</span>
            ) : null}
          </span>
        </label>
      ))}
    </fieldset>
  )
}

/** Memory Reconstruction: one input per redacted field, labelled by the record. */
function FieldGrid({ challenge }: { challenge: PlayableChallenge }) {
  const fields =
    challenge.prompt.kind === 'PROFILE'
      ? challenge.prompt.fields.filter((field) => field.isRedacted)
      : []

  if (fields.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Nothing was redacted in this round, so there is nothing to reconstruct.
      </p>
    )
  }

  return (
    <fieldset className="space-y-3">
      <legend className="eyebrow pb-1">Fill in the redactions</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <label
              htmlFor={`field-${field.key}`}
              className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted"
            >
              {field.label}
            </label>
            <Input
              id={`field-${field.key}`}
              name={`field.${field.key}`}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-faint">
        Each field is graded on its own, so a partly remembered record still earns what it deserves.
      </p>
    </fieldset>
  )
}

/** Connect the Dots: a select per unknown node and per missing edge. */
function GraphBuilder({ challenge }: { challenge: PlayableChallenge }) {
  if (challenge.prompt.kind !== 'GRAPH') {
    return (
      <p className="text-sm text-ink-muted">
        This round expects a graph answer but was generated without a graph prompt.
      </p>
    )
  }

  const { nodes, edges, nodeChoices, edgeChoices } = challenge.prompt
  const unknownNodes = nodes.filter((node) => node.isUnknown)
  const missingEdges = edges.filter((edge) => edge.isMissing)
  const nodeLabel = new Map(nodes.map((node) => [node.id, node.label]))

  return (
    <fieldset className="space-y-4">
      <legend className="eyebrow pb-1">Rebuild the fragment</legend>

      {unknownNodes.map((node) => (
        <div key={node.id} className="space-y-1.5">
          <label
            htmlFor={`node-${node.id}`}
            className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted"
          >
            Which {node.entityTypeLabel.toLowerCase()} belongs here?
          </label>
          <Select id={`node-${node.id}`} name={`node.${node.id}`} defaultValue="" required>
            <option value="" disabled>
              Choose an entity…
            </option>
            {nodeChoices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
                {choice.detail ? ` — ${choice.detail}` : ''}
              </option>
            ))}
          </Select>
        </div>
      ))}

      {missingEdges.map((edge) => (
        <div key={edge.id} className="space-y-1.5">
          <label
            htmlFor={`edge-${edge.id}`}
            className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted"
          >
            How is {nodeLabel.get(edge.fromNodeId) ?? 'this'} related to{' '}
            {nodeLabel.get(edge.toNodeId) ?? 'that'}?
          </label>
          <Select id={`edge-${edge.id}`} name={`edge.${edge.id}`} defaultValue="" required>
            <option value="" disabled>
              Choose a relationship…
            </option>
            {edgeChoices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </Select>
        </div>
      ))}

      <p className="text-xs text-ink-faint">
        Every piece is graded separately, and naming a relationship is worth more than naming an
        entity — the exact weights come from the definition for this rung, so the scorecard will itemise
        them rather than this page guessing.
      </p>
    </fieldset>
  )
}
