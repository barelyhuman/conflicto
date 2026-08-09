import js from '@eslint/js';
import signals from '@preact/eslint-plugin-signals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      signals,
    },
    rules: {
      // Catch variables/functions used before declaration (TDZ issues)
      'no-use-before-define': ['error', { functions: false, classes: false, variables: true }],

      // React/JSX rules (Preact-compatible)
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      'react/jsx-uses-vars': 'error',
      'react/prop-types': 'off',

      // Hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Preact Signals correctness
      'signals/no-signal-write-in-computed': 'error',
      'signals/no-value-after-await': 'error',
      'signals/no-signal-truthiness': 'warn',
      'signals/no-signal-in-component-body': 'error',
      'signals/no-conditional-value-read': 'error',
      'signals/no-useless-computed': 'warn',

      // General
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
    settings: {
      react: {
        version: 'detect',
        pragma: 'h',
        pragmaFrag: 'Fragment',
      },
    },
  },
];
