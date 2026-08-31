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
    // Supabase Storage is the archive's media origin (PRD §27),
    // along with Wikimedia, official JKT48 domains, and curated media sources.
    remotePatterns: [
      ...(supabaseHost
        ? [{ protocol: 'https' as const, hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }]
        : []),
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: '*.wikimedia.org' },
      { protocol: 'https', hostname: '*.wikipedia.org' },
      { protocol: 'https', hostname: 'jkt48.com' },
      { protocol: 'https', hostname: '*.jkt48.com' },
      { protocol: 'https', hostname: 'static.wikia.nocookie.net' },
      { protocol: 'https', hostname: '*.nocookie.net' },
      { protocol: 'https', hostname: 'stage48.net' },
      { protocol: 'https', hostname: '*.stage48.net' },
      { protocol: 'https', hostname: 'pbs.twimg.com' },
      { protocol: 'https', hostname: '*.twimg.com' },
      { protocol: 'https', hostname: 'i.imgur.com' },
      { protocol: 'https', hostname: '*.imgur.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  experimental: {
    // Keep Prisma out of the client bundle and safe in serverless runtimes.
    serverActions: { bodySizeLimit: '2mb' },
  },
  serverExternalPackages: ['@prisma/client'],
}

export default nextConfig
