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

    // Release lint must stay zero-noise. Legacy cleanup rules that are
    // too broad for a behaviour-safe release pass are kept out of the
    // gate; typecheck, unit tests, Playwright and focused reviews carry
    // the release signal.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    'react-hooks/exhaustive-deps': 'off',

    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-extra-semi': 'error',
    'no-regex-spaces': 'error',
    'no-constant-condition': 'error',
    'no-irregular-whitespace': 'error',
    'prefer-const': 'error',
    'react/no-unescaped-entities': 'error',
  },
  ignorePatterns: ['dist/**', 'release/**', 'node_modules/**'],
};
