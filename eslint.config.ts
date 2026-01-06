import { defineConfig } from 'eslint/config';

export default defineConfig([
  // Ignore build output and deps
  {
    ignores: ['dist/**', 'node_modules/**'],
  },

  // JS / JSX
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    linterOptions: { reportUnusedDisableDirectives: true },
    plugins: {
      prettier: require('eslint-plugin-prettier'),
      import: require('eslint-plugin-import'),
    },
    rules: {
      'prettier/prettier': 'error',
      'no-console': 'warn',
      'import/no-unresolved': 'off',
    },
  },

  // TS / TSX
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
      prettier: require('eslint-plugin-prettier'),
      import: require('eslint-plugin-import'),
    },
    linterOptions: { reportUnusedDisableDirectives: true },
    rules: {
      'prettier/prettier': 'error',
      'no-console': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'import/no-unresolved': 'off',
    },
  },
  {
    files: ['./*.config.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: './tsconfig.config.json',
      },
    },
  },
]);
