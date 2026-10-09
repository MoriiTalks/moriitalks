import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const sourceFiles = ['apps/mobile/src/**/*.{ts,tsx}'];

const comments = {
  rules: {
    'no-semicolon': {
      meta: {
        type: 'suggestion',
        schema: [],
        messages: { comma: 'Use a comma instead of a semicolon in comments.' },
      },
      create(context) {
        return {
          Program() {
            for (const comment of context.sourceCode.getAllComments()) {
              if (comment.value.includes(';')) {
                context.report({ loc: comment.loc, messageId: 'comma' });
              }
            }
          },
        };
      },
    },
  },
};

export default defineConfig(
  { linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' } },
  globalIgnores([
    '**/node_modules/**',
    '**/.expo/**',
    '**/dist/**',
    'apps/mobile/android/**',
    'apps/mobile/ios/**',
    '**/expo-env.d.ts',
    '**/uniwind-types.d.ts',
  ]),
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    plugins: { comments },
    rules: { 'comments/no-semicolon': 'error' },
  },
  {
    files: sourceFiles,
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat['recommended-latest'],
    ],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'sort-imports': ['error', { ignoreDeclarationSort: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-check': false, 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true },
      ],
    },
  },
  prettier,
);
