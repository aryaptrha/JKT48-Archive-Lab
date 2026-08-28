import type { Metadata, Viewport } from 'next'
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'

import { SiteFooter } from '@/components/archive/site-footer'
import { SiteHeader } from '@/components/archive/site-header'
import { THEME_SCRIPT } from '@/components/archive/theme-toggle'

import './globals.css'

/**
 * The root layout.
 *
 * Three faces, self-hosted by `next/font` so there is no request to Google at
 * runtime and no layout shift while a webfont loads:
 *
 *   - Fraunces for display. A variable serif with an optical-size axis, which is
 *     what lets a 40px title and a 16px subhead look like the same typeface set at
 *     two sizes rather than one typeface scaled. `SOFT` and `WONK` are pulled in
 *     because the base stylesheet sets them.
 *   - IBM Plex Sans for reading. Neutral without being anonymous, and it has the
 *     alternate single-storey glyphs that keep Indonesian names legible at small
 *     sizes.
 *   - IBM Plex Mono for catalogue numbers, dates and counts.
 *
 * Explicitly not Inter (PRD §22): the brief asks the archive not to look like
 * every other product built this year, and the body face is most of that.
 */

const display = Fraunces({
  subsets: ['latin'],
  axes: ['SOFT', 'WONK', 'opsz'],
  display: 'swap',
  variable: '--font-fraunces',
})

const sans = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-plex-sans',
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-plex-mono',
})

export const metadata: Metadata = {
  title: {
    default: 'JKT48 Archive Lab',
    template: '%s · JKT48 Archive Lab',
  },
  description:
    'An interactive knowledge archive of JKT48 history — members, generations, teams, songs and events, connected as a graph and playable as a memory game.',
  applicationName: 'JKT48 Archive Lab',
  formatDetection: { telephone: false, date: false, address: false },
  openGraph: {
    type: 'website',
    siteName: 'JKT48 Archive Lab',
    title: 'JKT48 Archive Lab',
    description:
      'Browse the archive by record or by date, then test what you actually remember.',
  },
  robots: {
    index: true,
    follow: true,
    // The authenticated and curator areas have nothing to offer a crawler and
    // should not appear in results at all.
    nocache: false,
  },
}

export const viewport: Viewport = {
  // Both are declared so the browser UI matches the painted ground in either
  // theme; a single value leaves one mode with a mismatched notch.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f4' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1a18' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      // `suppressHydrationWarning` because THEME_SCRIPT sets `data-theme` on this
      // element before React hydrates. The mismatch is intentional and is the only
      // way to avoid a flash of the wrong theme.
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col antialiased">
        {/* First tab stop on every page: skip the masthead, reach the record. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:border focus:border-accent focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>

        <SiteHeader />

        <main id="main" className="flex-1">
          {children}
        </main>

        <SiteFooter />
      </body>
    </html>
  )
}
