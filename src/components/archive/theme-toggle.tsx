'use client'

import { Moon, Sun } from 'lucide-react'
import { useSyncExternalStore } from 'react'

import { cn } from '@/lib/utils'

/**
 * Light/dark toggle.
 *
 * Three details worth keeping:
 *
 *   1. The stored value is only ever `light` or `dark`. Absence means "follow the
 *      system", so a reader who never touches this control keeps tracking their OS
 *      when it changes at sunset.
 *   2. The state lives in `data-theme` on `<html>`, subscribed to through
 *      `useSyncExternalStore`. The server snapshot is null because the theme is
 *      not knowable there — rendering the *current* icon during SSR would be a
 *      guess, and a wrong guess flips visibly on hydration.
 *   3. The class is applied by `THEME_SCRIPT` before first paint (see below), so
 *      this component never causes a flash — it only changes state afterwards.
 */

const STORAGE_KEY = 'jkt48-archive-theme'

type Theme = 'light' | 'dark'

/**
 * `data-theme` on `<html>` *is* the store.
 *
 * It is set before paint by `THEME_SCRIPT`, read by every CSS rule, and written
 * by `apply` below — so the component subscribes to the attribute rather than
 * keeping a second copy of the truth in React state that could disagree with it.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  return () => observer.disconnect()
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

/** Null on the server: the theme is not knowable until the document exists. */
function getServerSnapshot(): Theme | null {
  return null
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Private browsing or a blocked storage partition. The toggle still works for
    // this page view; it simply will not be remembered, which is a fine outcome.
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore<Theme | null>(subscribe, getSnapshot, getServerSnapshot)
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      onClick={() => apply(next)}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-sm border border-transparent text-ink-muted',
        'transition-colors duration-(--duration-fast) hover:bg-ground-sunk hover:text-ink',
        className,
      )}
      aria-label={theme === null ? 'Switch theme' : `Switch to ${next} mode`}
    >
      {theme === 'dark' ? (
        <Sun aria-hidden className="size-4" />
      ) : (
        <Moon aria-hidden className="size-4" />
      )}
    </button>
  )
}

/**
 * Runs before paint, in `<head>`, to set `data-theme` from storage or the system.
 *
 * This has to be a blocking inline script. Any React-based alternative runs after
 * the first paint, which is the white flash every dark-mode site with a
 * useEffect-based theme has. Wrapped in try/catch because reading localStorage
 * throws outright in some privacy configurations, and a thrown error here would
 * stop the rest of the document's head from executing.
 */
export const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');var d=s==='dark'||(!s&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`
