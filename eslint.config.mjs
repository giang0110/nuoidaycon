import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const eslintConfig = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },

  ...coreWebVitals,
  ...nextTypescript,
  prettier,

  // ---------------------------------------------------------------------------
  // Architectural decision A1: lib/domain is pure. It must not reach for the
  // database, the framework, or the UI layer. Enforced by lint, not discipline.
  // See docs/product/PRODUCT_SPEC.md §10.
  // ---------------------------------------------------------------------------
  {
    files: ['lib/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'next',
                'next/*',
                'react',
                'react-dom',
                'react/*',
                '@supabase/*',
                '@/lib/data',
                '@/lib/data/*',
                '@/lib/supabase',
                '@/lib/supabase/*',
                '@/app/*',
                '@/components/*',
              ],
              message:
                'lib/domain must stay pure (decision A1). No Supabase, Next.js, React, or UI imports — take an interface instead.',
            },
          ],
        },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // Architectural decision A3: the service-role key bypasses RLS. It is allowed
  // only in migration and seed scripts, never in a request path.
  // ---------------------------------------------------------------------------
  {
    files: ['app/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Read environment variables through lib/env.ts so the service-role key cannot leak into a request path (decision A3).',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[property.name='SUPABASE_SERVICE_ROLE_KEY'], Identifier[name='SUPABASE_SERVICE_ROLE_KEY']",
          message:
            'The service-role key is barred from application code (decision A3). Use it only in scripts/ and supabase/.',
        },
      ],
    },
  },

  // Scripts legitimately read env directly and may use the service-role key.
  {
    files: ['scripts/**/*.ts', 'supabase/**/*.ts', 'lib/env.ts', '*.config.*'],
    rules: {
      'no-restricted-properties': 'off',
      'no-restricted-syntax': 'off',
      'no-console': 'off',
    },
  },
];

export default eslintConfig;
