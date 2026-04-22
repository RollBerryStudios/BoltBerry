/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  settings: {
    react: { version: 'detect' },
  },
  rules: {
    // React 18+ — JSX transform is automatic
    'react/react-in-jsx-scope': 'off',

    // Best-practice rules, but warn-only during gradual cleanup.
    // Prevents CI from being blocked while the codebase is cleaned up.
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-var-requires': 'warn',
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-extra-semi': 'warn',
    'no-regex-spaces': 'warn',

    // Downgrade built-in errors to warnings during migration
    'no-constant-condition': 'warn',
    'no-irregular-whitespace': 'warn',
    'prefer-const': 'warn',
    'react/no-unescaped-entities': 'warn',
  },
  ignorePatterns: ['dist/**', 'release/**', 'node_modules/**'],
};
