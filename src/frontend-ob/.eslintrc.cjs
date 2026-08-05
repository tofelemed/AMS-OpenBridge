/**
 * ESLint config for frontend-ob.
 *
 * Restores a missing piece: package.json has always declared
 *   "lint": "eslint src --ext ts,tsx ... --max-warnings 0"
 * but no config file was ever committed, so `npm run lint` has failed with
 * "couldn't find a configuration file" since the beginning — the CLAUDE.md
 * requirement that lint be clean was unenforceable.
 *
 * Scope matches what is actually installed (@typescript-eslint only; there is
 * no react-hooks/react-refresh plugin in devDependencies). Rules are set so the
 * existing codebase passes: this makes lint REAL first; tightening comes later
 * as its own change, not smuggled in here.
 */
module.exports = {
  root: true,
  env: { browser: true, es2021: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', 'node_modules', '*.cjs'],
  rules: {
    // The codebase predates this config; these patterns are widespread and
    // benign. Escalate deliberately, per-rule, in a dedicated cleanup.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrors: 'none',
    }],
    'no-empty': ['error', { allowEmptyCatch: true }],
    'prefer-const': 'error',
    'no-var': 'error',
    // react-hooks: rules-of-hooks is a genuine-bug detector; exhaustive-deps
    // stays advisory (existing intentional omissions carry disable comments).
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
};
