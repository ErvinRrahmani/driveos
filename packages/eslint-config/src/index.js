import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { httpStatusRules } from './http-status.js';
import boundaries from './module-boundaries.js';

const ignores = {
  ignores: [
    '**/dist/**',
    '**/coverage/**',
    '**/.turbo/**',
    '**/.expo/**',
    '**/node_modules/**',
    '**/src/client/generated/**',
    '**/src/mocks/generated/**',
    '**/routeTree.gen.ts',
    '**/expo-env.d.ts',
  ],
};

export const base = defineConfig(
  ignores,
  js.configs.recommended,
  tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      ...httpStatusRules,
    },
  },
  prettier,
);

export const nest = defineConfig(base, {
  files: ['**/*.ts'],
  rules: {
    '@typescript-eslint/consistent-type-imports': 'off',
    '@typescript-eslint/no-extraneous-class': 'off',
  },
});

export const apiModules = [
  {
    files: ['src/modules/**/*.ts'],
    plugins: { driveos: boundaries },
    rules: { 'driveos/module-boundaries': 'error' },
  },
];

export const react = defineConfig(base, {
  files: ['**/*.{ts,tsx}'],
  plugins: { 'react-hooks': reactHooks },
  languageOptions: { globals: { ...globals.browser } },
  rules: reactHooks.configs.recommended.rules,
});
