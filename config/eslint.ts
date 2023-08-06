import { Linter } from 'eslint'
import { FlatCompat } from '@eslint/eslintrc'
// import globals from 'globals'
import ts from '@typescript-eslint/eslint-plugin'
import * as tsParser from '@typescript-eslint/parser'
import js from '@eslint/js'
// import * as jsoncEslintParser from 'jsonc-eslint-parser'

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const config: Linter.FlatConfig[] = [
  // Prettier
  ...compat.extends('plugin:prettier/recommended'),

  {
    ignores: ['build'],
  },

  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': ts,
    },
    languageOptions: {
      parser: tsParser,
    },
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    rules: js.configs.recommended.rules,
  },

  // {
  //   files: ['src/**/*.ts', 'src/**/*.tsx'],
  //   languageOptions: {
  //     globals: {
  //       ...globals.browser,
  //     },
  //   },
  // },

  // {
  //   files: ['**/*.json'],
  //   languageOptions: {
  //     parser: jsoncEslintParser,
  //   },
  // },
]

export = config
