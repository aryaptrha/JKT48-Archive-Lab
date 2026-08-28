import { redirect } from 'next/navigation'

/**
 * `/history` has no page of its own.
 *
 * The information architecture (PRD §20) lists History as a section containing
 * the Timeline and the Time Machine, not as a destination. A landing page here
 * would be two links and a paragraph, so the section entry point is the timeline
 * itself and the bare path redirects to it rather than 404ing on a URL a reader
 * can reasonably guess.
 */
export default function HistoryIndex() {
  redirect('/history/timeline')
}
