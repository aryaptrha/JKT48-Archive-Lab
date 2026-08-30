import type { NextConfig } from 'next'

/**
 * The media host, or nothing if the variable is unusable.
 *
 * `new URL()` throws on a malformed value, and thrown from here it takes the
 * whole config with it: the build or the dev server dies with `Invalid URL`
 * before any application code runs, over a variable that only ever contributes
 * an image `hostname`. A bad value should cost the remote image pattern, not the
 * entire archive, so it is caught and the pattern list is left empty.
 */
function supabaseHostname(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!raw) return undefined

  try {
    return new URL(raw).hostname
  } catch {
    console.warn(
      `NEXT_PUBLIC_SUPABASE_URL is not a valid URL ("${raw}"), so no remote image pattern was ` +
        'configured for Supabase Storage.',
    )
    return undefined
  }
}

const supabaseHost = supabaseHostname()

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: false,
  images: {
    // Supabase Storage is the archive's media origin (PRD §27).
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }]
      : [],
  },
  experimental: {
    // Keep Prisma out of the client bundle and safe in serverless runtimes.
    serverActions: { bodySizeLimit: '2mb' },
  },
  serverExternalPackages: ['@prisma/client'],
}

export default nextConfig
