/**
 * Minimal structured logger (PRD §34 — basic production observability).
 *
 * Vercel captures stdout/stderr per invocation, so JSON lines are enough for
 * V1. A dedicated error tracker can be swapped in behind this interface later
 * without touching call sites.
 */

type Level = 'debug' | 'info' | 'warn' | 'error'
type Context = Record<string, unknown>

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const minLevel: Level = process.env.NODE_ENV === 'production' ? 'info' : 'debug'

function serializeError(error: unknown): Context {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
      cause: error.cause instanceof Error ? error.cause.message : undefined,
    }
  }
  return { error: String(error) }
}

function emit(level: Level, message: string, context?: Context) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return

  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...context,
  })

  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (message: string, context?: Context) => emit('debug', message, context),
  info: (message: string, context?: Context) => emit('info', message, context),
  warn: (message: string, context?: Context) => emit('warn', message, context),
  error: (message: string, error?: unknown, context?: Context) =>
    emit('error', message, { ...context, ...(error === undefined ? {} : serializeError(error)) }),
}
