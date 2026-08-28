import Link from 'next/link'

import { cn } from '@/lib/utils'
import type { Subgraph } from '@/types/graph'

/**
 * The neighbourhood map: an entity and everything one hop away (PRD §4.4).
 *
 * Rendered as server-side SVG with a deterministic radial layout — no physics
 * simulation, no client JavaScript, no canvas. That is a real design decision
 * rather than a shortcut:
 *
 *   - A force-directed graph moves every time you load it, so two readers looking
 *     at the same record see different pictures and neither can describe it to the
 *     other. A radial layout of the same subgraph is the same picture every time.
 *   - It renders in the initial HTML, so the map is there before hydration and is
 *     still there if hydration never happens.
 *   - Reduced-motion users get a static diagram by construction rather than by
 *     an opt-out.
 *
 * The map is a *way in*, not an analysis tool: nodes link to records, and the
 * reader follows one. Anything denser than one hop belongs on the entity page's
 * relationship sections, which are readable.
 */

const WIDTH = 640
const HEIGHT = 360
const CENTRE = { x: WIDTH / 2, y: HEIGHT / 2 }

/** Nodes past this point stop being legible and start being decoration. */
const MAX_NODES = 14

export function GraphMap({
  subgraph,
  className,
}: {
  subgraph: Subgraph
  className?: string
}) {
  const others = subgraph.nodes.filter((node) => node.id !== subgraph.root.id).slice(0, MAX_NODES)

  if (others.length === 0) return null

  // Two radii, alternating, so labels on adjacent spokes do not collide.
  const positions = new Map<string, { x: number; y: number }>()
  positions.set(subgraph.root.id, CENTRE)

  others.forEach((node, index) => {
    const angle = (index / others.length) * Math.PI * 2 - Math.PI / 2
    const radius = index % 2 === 0 ? 132 : 158
    positions.set(node.id, {
      x: CENTRE.x + Math.cos(angle) * radius * 1.55,
      y: CENTRE.y + Math.sin(angle) * radius * 0.82,
    })
  })

  const drawable = subgraph.edges.filter(
    (edge) => positions.has(edge.from.id) && positions.has(edge.to.id),
  )

  return (
    <figure className={cn('space-y-2', className)}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Relationship map for ${subgraph.root.canonicalName}, showing ${others.length} connected records`}
      >
        <g>
          {drawable.map((edge) => {
            const from = positions.get(edge.from.id)
            const to = positions.get(edge.to.id)
            if (!from || !to) return null

            const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }

            return (
              <g key={edge.id}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  className="stroke-rule-strong"
                  strokeWidth={1}
                  // A closed relationship is drawn dashed: the map should show
                  // that a connection used to hold, not silently flatten history.
                  strokeDasharray={edge.validTo ? '3 3' : undefined}
                />
                <text
                  x={mid.x}
                  y={mid.y - 4}
                  textAnchor="middle"
                  className="fill-ink-faint font-mono"
                  style={{ fontSize: 8, letterSpacing: '0.06em' }}
                >
                  {edge.label.toUpperCase()}
                </text>
              </g>
            )
          })}
        </g>

        <g>
          {others.map((node) => {
            const position = positions.get(node.id)
            if (!position) return null
            const isRight = position.x >= CENTRE.x

            return (
              <g key={node.id}>
                <circle cx={position.x} cy={position.y} r={4} className="fill-ink-muted" />
                <text
                  x={position.x + (isRight ? 9 : -9)}
                  y={position.y + 3.5}
                  textAnchor={isRight ? 'start' : 'end'}
                  className="fill-ink"
                  style={{ fontSize: 11 }}
                >
                  {node.canonicalName.length > 26
                    ? `${node.canonicalName.slice(0, 25)}…`
                    : node.canonicalName}
                </text>
              </g>
            )
          })}

          <circle cx={CENTRE.x} cy={CENTRE.y} r={7} className="fill-accent" />
          <circle
            cx={CENTRE.x}
            cy={CENTRE.y}
            r={13}
            className="fill-none stroke-accent"
            strokeWidth={1}
            opacity={0.4}
          />
        </g>
      </svg>

      {/*
        The SVG is decorative-plus: it conveys structure, but the structure must
        also be navigable and readable as text. This list is that, and it is why
        the diagram itself carries no links.
      */}
      <figcaption className="flex flex-wrap gap-x-3 gap-y-1.5 border-t border-rule pt-2.5">
        {others.map((node) => (
          <Link
            key={node.id}
            href={node.href}
            className="font-mono text-catalog uppercase tracking-[0.08em] text-ink-muted transition-colors hover:text-accent"
          >
            {node.canonicalName}
          </Link>
        ))}
      </figcaption>
    </figure>
  )
}
