import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Combining diacritical marks, stripped after NFKD normalisation. */
const COMBINING_MARKS = /[̀-ͯ]/g
/** Straight and curly apostrophes. */
const APOSTROPHES = /['‘’]/g

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Stable, URL-safe slug. Used by the entity editor and the seed script. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
}

/**
 * Deterministic pseudo-random generator (mulberry32).
 *
 * The game engine seeds every session so a challenge can be replayed, shared,
 * or reproduced when debugging a bad question (PRD §6).
 */
export function createSeededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let state = h >>> 0

  return function next() {
    state = (state + 0x6d2b79f5) | 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher–Yates using an injected RNG so shuffles stay reproducible. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const a = result[i] as T
    const b = result[j] as T
    result[i] = b
    result[j] = a
  }
  return result
}

export function pickOne<T>(items: readonly T[], random: () => number = Math.random): T | undefined {
  if (items.length === 0) return undefined
  return items[Math.floor(random() * items.length)]
}

export function pickMany<T>(
  items: readonly T[],
  count: number,
  random: () => number = Math.random,
): T[] {
  return shuffle(items, random).slice(0, Math.max(0, count))
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)]
}

/** Normalises a free-text answer so casing and punctuation do not fail a user. */
export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim()
}
