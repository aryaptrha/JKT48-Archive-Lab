import type { NextConfig } from 'next'

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined

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
