import { NextResponse } from 'next/server'

/**
 * Standard JSON envelope and response utilities for API v1 (PRD §21).
 */

export const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
}

export const PRIVATE_CACHE_HEADERS = {
  'Cache-Control': 'no-store, private',
}

export type ApiEnvelope<T> = {
  data: T
  meta?: {
    page: number
    pageSize: number
    total: number
    pageCount: number
  }
}

export type ApiErrorEnvelope = {
  error: {
    code: string
    message: string
  }
}

export function jsonResponse<T>(
  data: T,
  init?: ResponseInit,
  headers?: Record<string, string>,
): NextResponse<ApiEnvelope<T>> {
  return NextResponse.json(
    { data },
    {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...PUBLIC_CACHE_HEADERS,
        ...headers,
        ...init?.headers,
      },
    },
  )
}

export function paginatedResponse<T>(
  items: T[],
  pagination: { page: number; pageSize: number; total: number; pageCount?: number },
  headers?: Record<string, string>,
): NextResponse<ApiEnvelope<T[]>> {
  const pageCount = pagination.pageCount ?? Math.max(1, Math.ceil(pagination.total / pagination.pageSize))

  return NextResponse.json(
    {
      data: items,
      meta: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: pagination.total,
        pageCount,
      },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        ...PUBLIC_CACHE_HEADERS,
        ...headers,
      },
    },
  )
}

export function errorResponse(
  message: string,
  code: string = 'BAD_REQUEST',
  status = 400,
): NextResponse<ApiErrorEnvelope> {
  return NextResponse.json(
    { error: { code, message } },
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...PRIVATE_CACHE_HEADERS,
      },
    },
  )
}

export function parsePagination(
  searchParams: URLSearchParams,
  defaultPageSize = 20,
  maxPageSize = 100,
): { page: number; pageSize: number } {
  const pageRaw = Number.parseInt(searchParams.get('page') ?? '1', 10)
  const pageSizeRaw = Number.parseInt(searchParams.get('pageSize') ?? String(defaultPageSize), 10)

  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw >= 1
    ? Math.min(pageSizeRaw, maxPageSize)
    : defaultPageSize

  return { page, pageSize }
}
