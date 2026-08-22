import js from '@eslint/js';
import next from 'eslint-config-next';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts', 'public/**'],
  },

  js.configs.recommended,
  ...next,
  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        // Type-aware linting. This is what makes `no-floating-promises` work,
        // and an un-awaited database write in a checkout path is exactly the
        // class of bug worth paying a slower lint for.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // --- Security-relevant ---

      // The single most direct XSS vector in React. There is one audited
      // exception (JSON-LD in `src/components/seo/`), which opts out locally.
      'react/no-danger': 'error',

      // `target="_blank"` without `rel="noreferrer"` hands the opened page a
      // handle on our window.
      'react/jsx-no-target-blank': ['error', { allowReferrer: false }],

      // Catches `await`-less promises: a dropped stock decrement or audit-log
      // write that silently never happens.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // `any` erases exactly the guarantees the validation layer exists to make.
      '@typescript-eslint/no-explicit-any': 'error',

      // Non-null assertions defeat `noUncheckedIndexedAccess`.
      '@typescript-eslint/no-non-null-assertion': 'error',

      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',

      // --- Hygiene ---
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  {
    // Scripts are operator tools run from a terminal; printing is the point.
    files: ['scripts/**/*.ts', 'tests/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Must stay last: turns off every stylistic rule Prettier owns.
  prettier,
];

export default config;
