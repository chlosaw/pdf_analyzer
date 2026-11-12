import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist', '**/node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/api/**/*.ts', 'e2e/**/*.ts', '*.config.ts', '*.config.js'],
    languageOptions: { globals: globals.node }
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
    }
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Security guardrails (OWASP A03 Injection)
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error'
    }
  },
  {
    // SQL must go through Prisma's tagged templates ($queryRaw`...${value}`), which send values as bind
    // parameters. The *Unsafe variants take a plain string, the classic SQL-injection hole.
    files: ['apps/api/src/**/*.ts', 'apps/api/prisma/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { property: '$queryRawUnsafe', message: 'Use $queryRaw`...` so values are bound as parameters.' },
        { property: '$executeRawUnsafe', message: 'Use $executeRaw`...` so values are bound as parameters.' }
      ]
    }
  },
  {
    files: ['apps/web/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Renders raw HTML (XSS risk). Render text or sanitised markdown instead.'
        }
      ]
    }
  },
  prettier
);
