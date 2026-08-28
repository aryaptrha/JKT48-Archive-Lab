import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

/**
 * Flat config, composed from `eslint-config-next`'s own flat exports.
 *
 * These packages ship `Linter.Config[]` directly as of Next 16, so they are
 * spread rather than run through `FlatCompat` — the compat layer re-validates
 * them against the legacy schema and rejects them.
 */
const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      // Prisma's generated client is not ours to lint.
      'src/generated/**',
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
    ],
  },
  {
    rules: {
      // `_`-prefixed bindings are the deliberate discard convention; everything
      // else unused is an error, matching `noUnusedLocals` in tsconfig.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // `verbatimModuleSyntax` makes this a build requirement, not a preference.
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },
]

export default config
